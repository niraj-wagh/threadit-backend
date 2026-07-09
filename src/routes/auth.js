const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ── Email signup ──────────────────────────────────────
router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('username').isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, username, password } = req.body;
  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      const field = existing.email === email ? 'email' : 'username';
      return res.status(409).json({ error: `This ${field} is already taken` });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user   = await prisma.user.create({
      data: { email, username, password: hashed },
      select: { id: true, email: true, username: true, avatar: true, createdAt: true },
    });
    res.status(201).json({ user, token: generateToken(user.id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// ── Email login ───────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid email or password' });

    const { password: _, ...safe } = user;
    res.json({ user: safe, token: generateToken(user.id) });
} catch (e) {
    console.error('LOGIN ERROR:', e);
    res.status(500).json({ error: 'Login failed', detail: e.message });
  }
});

// ── Me ────────────────────────────────────────────────
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
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ── GitHub OAuth ──────────────────────────────────────
// Step 1: redirect user → GitHub
router.get('/github', (req, res) => {
  const clientId    = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.status(501).json({ error: 'GitHub OAuth not configured' });

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: `${process.env.FRONTEND_URL}/oauth/callback?provider=github`,
    scope:        'user:email',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// Step 2: exchange code for token + upsert user
router.post('/github/callback', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return res.status(501).json({ error: 'GitHub OAuth not configured on server' });

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) return res.status(400).json({ error: 'GitHub auth failed' });

    // Fetch GitHub user profile
    const [profileRes, emailRes] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Threadit-App' },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Threadit-App' },
      }),
    ]);

    const profile = await profileRes.json();
    const emails  = await emailRes.json();

    const primaryEmail = Array.isArray(emails)
      ? (emails.find(e => e.primary && e.verified)?.email || emails[0]?.email)
      : profile.email;

    if (!primaryEmail) return res.status(400).json({ error: 'No email from GitHub account' });

    // Generate unique username from GitHub login
    let username = (profile.login || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 18);
    if (!username) username = `user_${Date.now()}`;

    // Upsert user
    let user = await prisma.user.findFirst({
      where: { OR: [{ email: primaryEmail }, { username }] },
    });

    if (!user) {
      // Check if username taken, append number if needed
      const taken = await prisma.user.findUnique({ where: { username } });
      if (taken) username = `${username}_${Math.floor(Math.random() * 9000) + 1000}`;

      user = await prisma.user.create({
        data: {
          email:    primaryEmail,
          username,
          password: await bcrypt.hash(Math.random().toString(36), 10),
          avatar:   profile.avatar_url,
        },
      });
    }

    const { password: _, ...safe } = user;
    res.json({ user: safe, token: generateToken(user.id) });
  } catch (e) {
    console.error('GitHub OAuth error:', e);
    res.status(500).json({ error: 'GitHub login failed' });
  }
});

// ── Google OAuth ──────────────────────────────────────
// Step 1: redirect user → Google
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(501).json({ error: 'Google OAuth not configured' });

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  `${process.env.FRONTEND_URL}/oauth/callback?provider=google`,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Step 2: exchange code for token + upsert user
router.post('/google/callback', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return res.status(501).json({ error: 'Google OAuth not configured on server' });

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  `${process.env.FRONTEND_URL}/oauth/callback?provider=google`,
        grant_type:    'authorization_code',
      }),
    });
    const tokens     = await tokenRes.json();
    const accessToken = tokens.access_token;
    if (!accessToken) return res.status(400).json({ error: 'Google auth failed' });

    // Fetch Google user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();

    if (!profile.email) return res.status(400).json({ error: 'No email from Google account' });

    // Generate username from Google name
    let username = (profile.name || profile.given_name || '')
      .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18) || `user_${Date.now()}`;

    // Upsert user
    let user = await prisma.user.findUnique({ where: { email: profile.email } });

    if (!user) {
      const taken = await prisma.user.findUnique({ where: { username } });
      if (taken) username = `${username}_${Math.floor(Math.random() * 9000) + 1000}`;

      user = await prisma.user.create({
        data: {
          email:    profile.email,
          username,
          password: await bcrypt.hash(Math.random().toString(36), 10),
          avatar:   profile.picture,
        },
      });
    }

    const { password: _, ...safe } = user;
    res.json({ user: safe, token: generateToken(user.id) });
  } catch (e) {
    console.error('Google OAuth error:', e);
    res.status(500).json({ error: 'Google login failed' });
  }
});

module.exports = router;
