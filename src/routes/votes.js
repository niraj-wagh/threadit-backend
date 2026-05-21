const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/votes - Vote on a post
router.post('/', authenticate, [
  body('postId').notEmpty().withMessage('Post ID required'),
  body('type').isIn(['UP', 'DOWN']).withMessage('Type must be UP or DOWN'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { postId, type } = req.body;
    const userId = req.user.id;

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const existingVote = await prisma.vote.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    let scoreDelta = 0;
    let newVoteType = null;

    if (existingVote) {
      if (existingVote.type === type) {
        // Remove vote (toggle off)
        await prisma.vote.delete({
          where: { userId_postId: { userId, postId } },
        });
        scoreDelta = type === 'UP' ? -1 : 1;
        newVoteType = null;
      } else {
        // Change vote direction
        await prisma.vote.update({
          where: { userId_postId: { userId, postId } },
          data: { type },
        });
        scoreDelta = type === 'UP' ? 2 : -2;
        newVoteType = type;
      }
    } else {
      // New vote
      await prisma.vote.create({
        data: { userId, postId, type },
      });
      scoreDelta = type === 'UP' ? 1 : -1;
      newVoteType = type;
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { score: { increment: scoreDelta } },
      select: { id: true, score: true },
    });

    res.json({ score: updatedPost.score, userVote: newVoteType });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process vote' });
  }
});

module.exports = router;
