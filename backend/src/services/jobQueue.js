const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { PrismaClient } = require('@prisma/client');
const { parseRepo } = require('./repoParser');
const { buildContext } = require('./contextBuilder');
const { generateDocs } = require('./docGenerator');

const prisma = new PrismaClient();

// Redis connection
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Queue
const docQueue = new Queue('doc-generation', { connection });

// Worker
const worker = new Worker(
  'doc-generation',
  async (job) => {
    const { repoId, githubUrl, docJobId } = job.data;

    try {
      // Step A: Mark job as PROCESSING
      await prisma.docJob.update({
        where: { id: docJobId },
        data: { status: 'PROCESSING', startedAt: new Date() },
      });

      // Step B: Parse the repo
      const { files: parsedFiles, metadata } = await parseRepo(githubUrl);

      // Update repo metadata from GitHub
      await prisma.repo.update({
        where: { id: repoId },
        data: {
          name: metadata.name || undefined,
          description: metadata.description || undefined,
          defaultBranch: metadata.defaultBranch || undefined,
        },
      });

      // Step C: Build context
      const context = buildContext(parsedFiles);

      // Step D: Generate docs via OpenAI
      const { readme, apiReference, docstrings } = await generateDocs(context);

      // Step E: Save results to GeneratedDoc table
      const commitHash = metadata.latestCommitHash || 'unknown';

      await prisma.generatedDoc.createMany({
        data: [
          {
            repoId,
            jobId: docJobId,
            format: 'MARKDOWN',
            content: readme,
            commitHash,
          },
          {
            repoId,
            jobId: docJobId,
            format: 'OPENAPI',
            content: apiReference,
            commitHash,
          },
          {
            repoId,
            jobId: docJobId,
            format: 'DOCSTRING',
            content: JSON.stringify(docstrings),
            commitHash,
          },
        ],
      });

      // Step F: Mark job as DONE
      const now = new Date();
      await prisma.docJob.update({
        where: { id: docJobId },
        data: { status: 'DONE', completedAt: now },
      });

      await prisma.repo.update({
        where: { id: repoId },
        data: { lastGeneratedAt: now },
      });

      return { success: true, docJobId };
    } catch (error) {
      // Step G: Mark job as FAILED
      await prisma.docJob.update({
        where: { id: docJobId },
        data: {
          status: 'FAILED',
          errorMessage: error.message || 'Unknown error occurred',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[JobQueue] Job ${job?.id} failed:`, err.message);
});

worker.on('completed', (job) => {
  console.log(`[JobQueue] Job ${job.id} completed successfully.`);
});

/**
 * Creates a DocJob record in the database and enqueues it for processing.
 *
 * @param {string} repoId - The ID of the Repo record
 * @param {string} githubUrl - The GitHub repository URL
 * @returns {Promise<string>} The DocJob ID
 */
async function addDocJob(repoId, githubUrl) {
  const docJob = await prisma.docJob.create({
    data: {
      repoId,
      status: 'PENDING',
    },
  });

  await docQueue.add('generate', {
    repoId,
    githubUrl,
    docJobId: docJob.id,
  });

  return docJob.id;
}

/**
 * Retrieves the current status of a DocJob from the database.
 *
 * @param {string} jobId - The DocJob ID
 * @returns {Promise<Object>} The DocJob record
 */
async function getJobStatus(jobId) {
  const docJob = await prisma.docJob.findUnique({
    where: { id: jobId },
  });

  if (!docJob) {
    throw new Error(`DocJob with ID ${jobId} not found`);
  }

  return docJob;
}

module.exports = {
  addDocJob,
  getJobStatus,
  docQueue,
  worker,
};
