// Add this file as: backend/src/routes/seed.js
const express    = require('express');
const bcrypt     = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/seed?secret=YOUR_SEED_SECRET
router.post('/', async (req, res) => {
  const secret = req.query.secret || req.body.secret;

  if (!secret || secret !== process.env.SEED_SECRET) {
    return res.status(401).json({ error: 'Invalid seed secret' });
  }

  try {
    const hashedPassword = await bcrypt.hash('password123', 12);

    // Users
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

    // Communities
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

    // Members
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

    // Posts
    const post1 = await prisma.post.create({
      data: {
        title: 'What programming language should I learn first in 2024?',
        content: "I'm a complete beginner. I've heard Python is great for beginners but JavaScript is everywhere. What do you think?",
        type: 'TEXT', communityId: programming.id, authorId: bob.id, score: 142,
      },
    });
    const post2 = await prisma.post.create({
      data: {
        title: 'Built my first full-stack app with Next.js and PostgreSQL!',
        content: 'After 6 months of learning, I finally built my first complete web app. Tech stack: Next.js 14, PostgreSQL, Prisma, Tailwind CSS.',
        type: 'TEXT', communityId: webdev.id, authorId: alice.id, score: 89,
      },
    });
    await prisma.post.create({
      data: {
        title: 'The rise of AI coding assistants – are they making us better or worse programmers?',
        content: 'Tools like GitHub Copilot are great for productivity but terrible for learning. Discuss.',
        type: 'TEXT', communityId: tech.id, authorId: bob.id, score: 234,
      },
    });

    // Votes
    await prisma.vote.createMany({
      skipDuplicates: true,
      data: [
        { userId: alice.id, postId: post1.id, type: 'UP' },
        { userId: bob.id,   postId: post2.id, type: 'UP' },
      ],
    });

    // Comments
    await prisma.comment.create({
      data: {
        content: 'Python is definitely the best starting point. The syntax is clean.',
        postId: post1.id, authorId: alice.id,
      },
    });
    await prisma.comment.create({
      data: {
        content: "JavaScript is better because you can build browser apps immediately.",
        postId: post1.id, authorId: bob.id,
      },
    });

    res.json({
      success: true,
      message: 'Database seeded successfully',
      data: {
        users: ['alice@example.com', 'bob@example.com'],
        password: 'password123',
        communities: ['programming', 'webdev', 'technology'],
        posts: 3,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/seed/status
router.get('/status', async (req, res) => {
  try {
    const counts = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.community.count(),
      prisma.comment.count(),
    ]);
    res.json({
      users: counts[0],
      posts: counts[1],
      communities: counts[2],
      comments: counts[3],
      seeded: counts[0] > 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;