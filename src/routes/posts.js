const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/posts - Get all posts (homepage feed)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { sort = 'new', limit = 20, offset = 0, communitySlug } = req.query;

    const where = communitySlug
      ? { community: { slug: communitySlug } }
      : {};

    const orderBy = sort === 'top'
      ? { score: 'desc' }
      : { createdAt: 'desc' };

    const posts = await prisma.post.findMany({
      where,
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        community: { select: { id: true, name: true, slug: true } },
        _count: { select: { comments: true, votes: true } },
        votes: req.user
          ? { where: { userId: req.user.id }, select: { type: true } }
          : false,
      },
      orderBy,
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    const total = await prisma.post.count({ where });

    const postsWithUserVote = posts.map(post => ({
      ...post,
      userVote: post.votes && post.votes.length > 0 ? post.votes[0].type : null,
      votes: undefined,
    }));

    res.json({ posts: postsWithUserVote, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// GET /api/posts/:id - Get single post
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        community: { select: { id: true, name: true, slug: true, description: true } },
        _count: { select: { comments: true } },
        votes: req.user
          ? { where: { userId: req.user.id }, select: { type: true } }
          : false,
      },
    });

    if (!post) return res.status(404).json({ error: 'Post not found' });

    const postWithVote = {
      ...post,
      userVote: post.votes && post.votes.length > 0 ? post.votes[0].type : null,
      votes: undefined,
    };

    res.json({ post: postWithVote });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// POST /api/posts - Create post
router.post('/', authenticate, [
  body('title').isLength({ min: 3, max: 300 }).withMessage('Title must be 3-300 characters'),
  body('communitySlug').notEmpty().withMessage('Community is required'),
  body('type').isIn(['TEXT', 'IMAGE', 'LINK']).withMessage('Invalid post type'),
  body('content').optional().isLength({ max: 10000 }),
  body('imageUrl').optional().isURL().withMessage('Invalid image URL'),
  body('linkUrl').optional().isURL().withMessage('Invalid link URL'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, imageUrl, linkUrl, type, communitySlug } = req.body;

    const community = await prisma.community.findUnique({ where: { slug: communitySlug } });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const post = await prisma.post.create({
      data: {
        title,
        content,
        imageUrl,
        linkUrl,
        type,
        communityId: community.id,
        authorId: req.user.id,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        community: { select: { id: true, name: true, slug: true } },
        _count: { select: { comments: true } },
      },
    });

    res.status(201).json({ post: { ...post, userVote: null } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

    await prisma.post.delete({ where: { id } });
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;
