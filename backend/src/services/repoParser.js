const { Octokit } = require('@octokit/rest');
const path = require('path');

const ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.py', '.jsx', '.tsx', '.go', '.java', '.rb', '.md']);
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__'];
const IGNORED_FILES = new Set(['.env']);
const MAX_FILE_SIZE = 50 * 1024; // 50KB

/**
 * Checks if a file path should be ignored.
 */
function shouldIgnore(filePath) {
  const parts = filePath.split('/');
  
  // Check against ignored directories anywhere in the path
  for (const dir of IGNORED_DIRS) {
    if (parts.includes(dir)) return true;
  }
  
  // Check exact ignored filenames (e.g., .env)
  const filename = parts[parts.length - 1];
  if (IGNORED_FILES.has(filename)) return true;
  
  return false;
}

/**
 * Parses a GitHub repository URL and fetches the file tree and contents.
 *
 * @param {string} githubUrl
 * @param {string} [commitHash]
 * @returns {Promise<{ files: Array<{path: string, content: string, extension: string}>, metadata: { name: string, description: string, defaultBranch: string, latestCommitHash: string } }>}
 */
async function parseRepo(githubUrl, commitHash = null) {
  // Extract owner and repo from URL
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error('Invalid GitHub URL');
  }
  let owner = match[1];
  let repo = match[2];
  
  // Strip .git if present
  if (repo.endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  let metadata;
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    metadata = {
      name: data.name,
      description: data.description,
      defaultBranch: data.default_branch,
      latestCommitHash: commitHash
    };
  } catch (error) {
    if (error.status === 404) {
      throw new Error(`Repository not found or private. Ensure GITHUB_TOKEN has access to ${owner}/${repo}`);
    }
    throw error;
  }

  // If no commit hash is provided, fetch the latest commit of the default branch
  if (!metadata.latestCommitHash) {
    const branchRes = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: metadata.defaultBranch
    });
    metadata.latestCommitHash = branchRes.data.commit.sha;
  }

  // Fetch the recursive tree
  const treeRes = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: metadata.latestCommitHash,
    recursive: "true"
  });

  if (treeRes.data.truncated) {
    console.warn('Warning: Repository tree is too large and was truncated by the GitHub API.');
  }

  // Filter criteria:
  // 1. Must be a file ('blob')
  // 2. Must not be in an ignored directory or be an ignored file
  // 3. Must have an allowed extension
  // 4. Must be under 50KB
  const filteredTree = treeRes.data.tree.filter((node) => {
    if (node.type !== 'blob') return false;
    
    // Path checks
    if (shouldIgnore(node.path)) return false;
    
    // Extension check
    const ext = path.extname(node.path);
    if (!ALLOWED_EXTENSIONS.has(ext)) return false;
    
    // Size check (size is typically available for blobs in recursive trees)
    if (node.size !== undefined && node.size > MAX_FILE_SIZE) return false;
    
    return true;
  });

  // Fetch standard blobs in chunks to avoid rate limiting or memory bloat
  const CHUNK_SIZE = 10;
  const files = [];

  for (let i = 0; i < filteredTree.length; i += CHUNK_SIZE) {
    const chunk = filteredTree.slice(i, i + CHUNK_SIZE);
    
    const chunkPromises = chunk.map(async (node) => {
      try {
        const result = await octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: node.sha
        });
        
        const content = Buffer.from(result.data.content, 'base64').toString('utf8');
        return {
          path: node.path,
          content,
          extension: path.extname(node.path)
        };
      } catch (err) {
        console.error(`Failed to fetch blob for ${node.path}`, err.message);
        return null;
      }
    });

    const results = await Promise.all(chunkPromises);
    for (const r of results) {
      if (r) files.push(r);
    }
  }

  return { files, metadata };
}

module.exports = {
  parseRepo
};
