const express    = require('express');
const bcrypt     = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

async function runSeed() {
  const hashedPassword = await bcrypt.hash('password123', 12);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: { email: 'alice@example.com', username: 'alice_dev', password: hashedPassword, bio: 'Full-stack developer' },
  });
  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: { email: 'bob@example.com', username: 'bob_codes', password: hashedPassword, bio: 'Open source contributor' },
  });

  const programming = await prisma.community.upsert({
    where: { slug: 'programming' },
    update: {},
    create: { name: 'programming', slug: 'programming', description: 'A community for programmers.', creatorId: alice.id },
  });
  const webdev = await prisma.community.upsert({
    where: { slug: 'webdev' },
    update: {},
    create: { name: 'webdev', slug: 'webdev', description: 'All things web development!', creatorId: bob.id },
  });
  const tech = await prisma.community.upsert({
    where: { slug: 'technology' },
    update: {},
    create: { name: 'technology', slug: 'technology', description: 'Technology news and discussions.', creatorId: alice.id },
  });

  await prisma.communityMember.createMany({
    skipDuplicates: true,
    data: [
      { userId: alice.id, communityId: programming.id },
      { userId: bob.id,   communityId: programming.id },
      { userId: alice.id, communityId: webdev.id },
      { userId: bob.id,   communityId: webdev.id },
      { userId: alice.id, communityId: tech.id },
    ],
  });

  const post1 = await prisma.post.create({
    data: {
      title: 'What programming language should I learn first in 2024?',
      content: "I'm a complete beginner. Python or JavaScript — what do you think?",
      type: 'TEXT', communityId: programming.id, authorId: bob.id, score: 142,
    },
  });
  const post2 = await prisma.post.create({
    data: {
      title: 'Built my first full-stack app with Next.js and PostgreSQL!',
      content: 'After 6 months of learning, I finally built my first complete web app!',
      type: 'TEXT', communityId: webdev.id, authorId: alice.id, score: 89,
    },
  });
  await prisma.post.create({
    data: {
      title: 'The rise of AI coding assistants – better or worse for programmers?',
      content: 'Tools like GitHub Copilot are great for productivity but terrible for learning.',
      type: 'TEXT', communityId: tech.id, authorId: bob.id, score: 234,
    },
  });

  await prisma.vote.createMany({
    skipDuplicates: true,
    data: [
      { userId: alice.id, postId: post1.id, type: 'UP' },
      { userId: bob.id,   postId: post2.id, type: 'UP' },
    ],
  });

  await prisma.comment.create({
    data: { content: 'Python is the best starting point!', postId: post1.id, authorId: alice.id },
  });
  await prisma.comment.create({
    data: { content: 'JavaScript lets you build browser apps immediately!', postId: post1.id, authorId: bob.id },
  });

  return {
    users: ['alice@example.com', 'bob@example.com'],
    password: 'password123',
    communities: ['r/programming', 'r/webdev', 'r/technology'],
    posts: 3, comments: 2,
  };
}

// GET /api/seed?secret=xxx  ← open directly in browser
router.get('/', async (req, res) => {
  const secret = req.query.secret;
  if (!secret || secret !== process.env.SEED_SECRET) {
    return res.status(401).send(`
      <h2>❌ Wrong secret</h2>
      <p>Visit: /api/seed?secret=YOUR_SEED_SECRET</p>
    `);
  }
  try {
    const result = await runSeed();
    res.send(`
      <h2>✅ Database seeded successfully!</h2>
      <pre>${JSON.stringify(result, null, 2)}</pre>
      <p><strong>Login with:</strong> alice@example.com / password123</p>
    `);
  } catch (error) {
    res.status(500).send(`<h2>❌ Seed failed</h2><pre>${error.message}</pre>`);
  }
});

// POST /api/seed?secret=xxx
router.post('/', async (req, res) => {
  const secret = req.query.secret || req.body.secret;
  if (!secret || secret !== process.env.SEED_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }
  try {
    const result = await runSeed();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/seed/status
router.get('/status', async (req, res) => {
  try {
    const [users, posts, communities, comments] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.community.count(),
      prisma.comment.count(),
    ]);
    res.json({ users, posts, communities, comments, seeded: users > 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;