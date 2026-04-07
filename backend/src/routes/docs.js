const express = require('express');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/docs/:repoId — get latest GeneratedDoc for a repo
router.get('/:repoId', requireAuth, async (req, res, next) => {
  try {
    const { repoId } = req.params;

    // Check ownership
    const repo = await prisma.repo.findUnique({ where: { id: repoId } });
    if (!repo) return res.status(404).json({ error: { message: 'Repo not found' } });
    if (repo.userId !== req.userId) return res.status(403).json({ error: { message: 'Forbidden' } });

    // Fetch latest documents by ordering `createdAt`
    const latestDocs = await prisma.generatedDoc.findMany({
      where: { repoId },
      orderBy: { createdAt: 'desc' },
      take: 3 // Expected 3 formats: MARKDOWN, OPENAPI, DOCSTRING per job
    });

    if (latestDocs.length === 0) {
      return res.status(404).json({ error: { message: 'No documents generated for this repo yet' } });
    }
    res.json({ docs: latestDocs });
  } catch (error) {
    next(error);
  }
});

// GET /api/docs/:repoId/history — list all GeneratedDocs for a repo
router.get('/:repoId/history', requireAuth, async (req, res, next) => {
  try {
    const { repoId } = req.params;

    const repo = await prisma.repo.findUnique({ where: { id: repoId } });
    if (!repo) return res.status(404).json({ error: { message: 'Repo not found' } });
    if (repo.userId !== req.userId) return res.status(403).json({ error: { message: 'Forbidden' } });

    const allDocs = await prisma.generatedDoc.findMany({
      where: { repoId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ docs: allDocs });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
