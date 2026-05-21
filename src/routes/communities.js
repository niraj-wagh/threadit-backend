const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/communities - List all communities
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { search, limit = 20, offset = 0 } = req.query;

    const where = search
      ? { OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ]}
      : {};

    const communities = await prisma.community.findMany({
      where,
      include: {
        creator: { select: { id: true, username: true } },
        _count: { select: { posts: true, members: true } },
      },
      orderBy: { members: { _count: 'desc' } },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    const total = await prisma.community.count({ where });

    res.json({ communities, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch communities' });
  }
});

// GET /api/communities/:slug - Get single community
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const { slug } = req.params;

    const community = await prisma.community.findUnique({
      where: { slug },
      include: {
        creator: { select: { id: true, username: true } },
        _count: { select: { posts: true, members: true } },
      },
    });

    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    // Check if current user is a member
    let isMember = false;
    if (req.user) {
      const membership = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: req.user.id, communityId: community.id } },
      });
      isMember = !!membership;
    }

    res.json({ community: { ...community, isMember } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch community' });
  }
});

// POST /api/communities - Create community
router.post('/', authenticate, [
  body('name')
    .isLength({ min: 3, max: 21 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Community name must be 3-21 chars, letters/numbers/underscores'),
  body('description').optional().isLength({ max: 500 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    const slug = name.toLowerCase();

    const existing = await prisma.community.findFirst({
      where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }] },
    });

    if (existing) {
      return res.status(409).json({ error: 'A community with that name already exists' });
    }

    const community = await prisma.community.create({
      data: {
        name,
        slug,
        description,
        creatorId: req.user.id,
        members: {
          create: { userId: req.user.id },
        },
      },
      include: {
        creator: { select: { id: true, username: true } },
        _count: { select: { posts: true, members: true } },
      },
    });

    res.status(201).json({ community });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create community' });
  }
});

// POST /api/communities/:slug/join
router.post('/:slug/join', authenticate, async (req, res) => {
  try {
    const { slug } = req.params;

    const community = await prisma.community.findUnique({ where: { slug } });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const existing = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: req.user.id, communityId: community.id } },
    });

    if (existing) {
      // Leave community
      await prisma.communityMember.delete({
        where: { userId_communityId: { userId: req.user.id, communityId: community.id } },
      });
      return res.json({ joined: false, message: 'Left community' });
    }

    // Join community
    await prisma.communityMember.create({
      data: { userId: req.user.id, communityId: community.id },
    });

    res.json({ joined: true, message: 'Joined community' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle membership' });
  }
});

module.exports = router;
