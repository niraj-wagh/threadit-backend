require('dotenv').config();
const { execSync } = require('child_process');
const express = require('express');
const cors    = require('cors');

// ── Auto sync DB schema on startup ──────────────────
try {
  console.log('⏳ Syncing database schema...');
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  console.log('✅ Database schema synced');
} catch (e) {
  console.error('⚠️  DB push failed (continuing anyway):', e.message);
}

// Routes
const authRoutes       = require('./src/routes/auth');
const communityRoutes  = require('./src/routes/communities');
const postRoutes       = require('./src/routes/posts');
const commentRoutes    = require('./src/routes/comments');
const voteRoutes       = require('./src/routes/votes');
const userRoutes       = require('./src/routes/users');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) =>
  res.json({ status: 'ok', message: 'Threadit API running' }));

app.use('/api/auth',        authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/posts',       postRoutes);
app.use('/api/comments',    commentRoutes);
app.use('/api/votes',       voteRoutes);
app.use('/api/users',       userRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));