const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Create Prisma client with error handling
let prisma;
try {
  prisma = new PrismaClient({
    log: ['error'],
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
  });
} catch(e) {
  console.error('Prisma init error:', e.message);
}

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback-secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /api/auth/signup
router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('username').isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, username, password } = req.body;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      const field = existing.email === email ? 'email' : 'username';
      return res.status(409).json({ error: `This ${field} is already taken` });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user   = await prisma.user.create({
      data: { email, username, password: hashed },
      select: { id: true, email: true, username: true, avatar: true, createdAt: true },
    });

    res.status(201).json({ user, token: generateToken(user.id) });
  } catch (e) {
    console.error('Signup error:', e.message);
    res.status(500).json({ error: 'Signup failed: ' + e.message });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { password: _, ...safe } = user;
    res.json({ user: safe, token: generateToken(user.id) });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Login failed: ' + e.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, username: true,
        avatar: true, bio: true, createdAt: true,
        _count: { select: { posts: true, comments: true } },
      },
    });
    res.json({ user });
  } catch (e) {
    console.error('Me error:', e.message);
    res.status(500).json({ error: 'Failed to fetch user: ' + e.message });
  }
});

// GitHub OAuth
router.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(501).json({ error: 'GitHub OAuth not configured' });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.FRONTEND_URL}/oauth/callback?provider=github`,
    scope: 'user:email',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.post('/github/callback', async (req, res) => {
  res.status(501).json({ error: 'GitHub OAuth not configured' });
});

// Google OAuth
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(501).json({ error: 'Google OAuth not configured' });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.FRONTEND_URL}/oauth/callback?provider=google`,
    response_type: 'code',
    scope: 'openid email profile',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.post('/google/callback', async (req, res) => {
  res.status(501).json({ error: 'Google OAuth not configured' });
});

module.exports = router;
