require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes      = require('./routes/auth');
const communityRoutes = require('./routes/communities');
const postRoutes      = require('./routes/posts');
const commentRoutes   = require('./routes/comments');
const voteRoutes      = require('./routes/votes');
const userRoutes      = require('./routes/users');
const seedRoutes      = require('./routes/seed');

const app  = express();
const PORT = process.env.PORT || 5000;

// CORS
const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  'https://threadit-frontend.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com')
    ) return callback(null, true);
    return callback(new Error('CORS blocked: ' + origin), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/',       (req, res) => res.json({ status: 'ok', message: 'Threadit API' }));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Routes
app.use('/api/auth',        authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/posts',       postRoutes);
app.use('/api/comments',    commentRoutes);
app.use('/api/votes',       voteRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/seed',        seedRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server on port ' + PORT);
  console.log('Origins:', allowedOrigins);
});