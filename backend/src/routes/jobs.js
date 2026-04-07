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

// POST /api/jobs/webhook — GitHub Action Webhook
router.post('/webhook', async (req, res, next) => {
  const { repoUrl, commitHash, secret } = req.body;

  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: { message: 'Unauthorized: Invalid webhook secret' } });
  }

  try {
    // Normalize github URL (e.g., from git://github.com/owner/repo.git)
    const cleanUrl = String(repoUrl).replace(/^git:\/\//, 'https://').replace(/\.git$/, '');

    // Extract basic name
    const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    const name = match ? match[2] : 'Unknown Repo';

    // Find the repo by URL. If it doesn't exist, assign it to an administrative proxy user
    let repo = await prisma.repo.findFirst({ where: { githubUrl: cleanUrl } });

    if (!repo) {
      const adminUser = await prisma.user.findFirst();
      if (!adminUser) {
        return res.status(400).json({ error: { message: 'Platform has no registered users to attach repo to' } });
      }

      repo = await prisma.repo.create({
        data: {
          userId: adminUser.id,
          githubUrl: cleanUrl,
          name,
        },
      });
    }

    // Trigger doc generation job synchronously in background
    const jobId = await addDocJob(repo.id, repo.githubUrl);

    // Return 200 immediately so the Action completes quickly
    res.status(200).json({ message: 'Doc generation job queued successfully', jobId });
  } catch (error) {
    next(error);
  }
});

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
