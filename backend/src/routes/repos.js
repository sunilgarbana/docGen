const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/repos — list all repos for logged-in user
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const repos = await prisma.repo.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ repos });
  } catch (error) {
    next(error);
  }
});

// POST /api/repos — add a new repo
router.post(
  '/',
  requireAuth,
  [
    body('githubUrl').isURL().withMessage('Valid GitHub URL is required')
      .matches(/github\.com\//).withMessage('Must be a GitHub URL')
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    try {
      const { githubUrl } = req.body;
      
      // Basic extraction of name from URL for quick display
      const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      const name = match ? match[2].replace('.git', '') : 'Unknown Repo';
      
      const repo = await prisma.repo.create({
        data: {
          userId: req.userId,
          githubUrl,
          name
        }
      });
      res.status(201).json({ repo });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/repos/:id — delete a repo
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Ensure the repo belongs to the user
    const repo = await prisma.repo.findUnique({ where: { id } });
    if (!repo) {
      return res.status(404).json({ error: { message: 'Repo not found' } });
    }
    if (repo.userId !== req.userId) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    // Prisma handles cascading deletes recursively if set, but we might need to manually delete relations
    await prisma.generatedDoc.deleteMany({ where: { repoId: id } });
    await prisma.docJob.deleteMany({ where: { repoId: id } });
    await prisma.repo.delete({ where: { id } });

    res.json({ message: 'Repository deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
