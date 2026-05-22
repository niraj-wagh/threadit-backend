require('dotenv').config();
const { execSync } = require('child_process');
const express = require('express');
const cors    = require('cors');

// Auto push DB schema on startup
try {
  console.log('Syncing database schema...');
  execSync('node node_modules/prisma/build/index.js db push --accept-data-loss', {
    stdio: 'inherit', timeout: 60000,
  });
  console.log('Database synced');
} catch (e) {
  console.error('DB sync warning:', e.message);
}

const authRoutes      = require('./routes/auth');
const communityRoutes = require('./routes/communities');
const postRoutes      = require('./routes/posts');
const commentRoutes   = require('./routes/comments');
const voteRoutes      = require('./routes/votes');
const userRoutes      = require('./routes/users');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS — allow Vercel frontend + localhost ──────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,                        // from Render env
  'https://threadit-frontend.vercel.app',          // hardcoded fallback
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Also allow any vercel.app subdomain (for preview deployments)
    if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
      return callback(null, true);
    }
    console.log('CORS blocked origin:', origin);
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/',       (req, res) => res.json({ status: 'ok', message: 'Threadit API running' }));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Routes
app.use('/api/auth',        authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/posts',       postRoutes);
app.use('/api/comments',    commentRoutes);
app.use('/api/votes',       voteRoutes);
app.use('/api/users',       userRoutes);

// Error handlers
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
  console.log('Allowed origins:', allowedOrigins);
});