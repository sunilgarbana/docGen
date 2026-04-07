const express = require('express');
const { body, validationResult } = require('express-validator');
const requireAuth = require('../middleware/auth');
const { addDocJob, getJobStatus } = require('../services/jobQueue');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/jobs — trigger doc generation for a repoId
router.post(
  '/',
  requireAuth,
  [
    body('repoId').isUUID().withMessage('Valid repoId UUID is required')
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    try {
      const { repoId } = req.body;
      
      const repo = await prisma.repo.findUnique({ where: { id: repoId } });
      if (!repo) {
        return res.status(404).json({ error: { message: 'Repository not found' } });
      }
      if (repo.userId !== req.userId) {
        return res.status(403).json({ error: { message: 'Forbidden' } });
      }

      // Add to queue
      const jobId = await addDocJob(repo.id, repo.githubUrl);

      res.status(202).json({ 
        message: 'Job enqueued successfully',
        jobId 
      });
    } catch (error) {
      // Return 500 cleanly handling redis connection failures etc.
      next(error);
    }
  }
);

// GET /api/jobs/:id — get job status
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobStatus = await getJobStatus(id);

    // Verify ownership via repo relation
    const repo = await prisma.repo.findUnique({ where: { id: jobStatus.repoId } });
    if (!repo || repo.userId !== req.userId) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }

    res.json({ job: jobStatus });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: { message: error.message } });
    }
    next(error);
  }
});

module.exports = router;
