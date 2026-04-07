const OpenAI = require('openai');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Sleeps for a given number of milliseconds.
 * @param {number} ms 
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calls the OpenAI API with retry logic.
 * @param {Object} params - Chat completion params
 * @param {number} attempt - Current attempt number
 * @returns {Promise<string>} - The text response
 */
async function callWithRetry(params, attempt = 1) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      ...params,
    });
    return response.choices[0].message.content;
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      console.warn(`OpenAI API call failed (attempt ${attempt}/${MAX_RETRIES}): ${error.message}. Retrying...`);
      await sleep(RETRY_DELAY_MS * attempt); // exponential backoff
      return callWithRetry(params, attempt + 1);
    }
    throw new Error(`OpenAI API call failed after ${MAX_RETRIES} attempts: ${error.message}`);
  }
}

/**
 * Builds a concatenated code block from a list of file objects.
 * @param {Array<{path: string, content: string}>} files
 * @returns {string}
 */
function formatFilesForPrompt(files) {
  return files
    .map(f => `### FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');
}

/**
 * Generates documentation from a context object produced by contextBuilder.
 * 
 * @param {{ summary: string, files: Array<{path: string, content: string}> }} context
 * @returns {Promise<{ readme: string, apiReference: string, docstrings: Array<{filePath: string, functionName: string, suggestedDocstring: string}> }>}
 */
async function generateDocs(context) {
  const { summary, files } = context;

  // Categorize files for each prompt
  const entryFiles = files.filter(f =>
    /\/(index|main|app)\.(js|ts|py|go|java|rb)$/.test(f.path) || f.path === 'index.js' || f.path === 'app.js' || f.path === 'main.py'
  );
  const routeFiles = files.filter(f =>
    f.path.toLowerCase().includes('/route') || f.path.toLowerCase().includes('/api') || f.path.toLowerCase().includes('/controller')
  );
  const utilServiceFiles = files.filter(f =>
    f.path.toLowerCase().includes('/service') ||
    f.path.toLowerCase().includes('/util') ||
    f.path.toLowerCase().includes('/helper') ||
    f.path.toLowerCase().includes('/lib')
  );

  // Prepare prompt content strings
  const summarySection = `## Codebase Summary\n${summary}`;
  const entrySection = entryFiles.length > 0 ? formatFilesForPrompt(entryFiles) : '(no entry point files identified)';
  const routeSection = routeFiles.length > 0 ? formatFilesForPrompt(routeFiles) : '(no route files identified)';
  const utilSection = utilServiceFiles.length > 0 ? formatFilesForPrompt(utilServiceFiles) : '(no utility/service files identified)';

  // === Call A: README Generator ===
  const readmePromise = callWithRetry({
    messages: [
      {
        role: 'system',
        content: 'You are a technical writer. Generate a professional README.md for a software project based on the provided codebase context. Include: title, description, features, tech stack, installation, usage, and contributing sections. Do not include AI commentary — write it as if you are the author.'
      },
      {
        role: 'user',
        content: `${summarySection}\n\n## Entry Points\n${entrySection}`
      }
    ]
  });

  // === Call B: API Reference Generator ===
  const apiReferencePromise = callWithRetry({
    messages: [
      {
        role: 'system',
        content: 'You are a technical writer. Generate a comprehensive API reference document in Markdown. For each endpoint, include: HTTP method, path, description, request parameters/body, example request, and example response. Use clear headings and tables where appropriate.'
      },
      {
        role: 'user',
        content: `${summarySection}\n\n## Route Files\n${routeSection}`
      }
    ]
  });

  // === Call C: Docstring Suggestions ===
  const docstringsPromise = callWithRetry({
    messages: [
      {
        role: 'system',
        content: 'You are a code reviewer. Analyze the provided source files and suggest JSDoc (or Python docstring) comments for all undocumented or poorly documented functions. Return ONLY a valid JSON array with no additional text in this format: [{"filePath": "src/utils/foo.js", "functionName": "myFunction", "suggestedDocstring": "/* ... */"}]'
      },
      {
        role: 'user',
        content: `${summarySection}\n\n## Utility & Service Files\n${utilSection}`
      }
    ]
  });

  // Run all 3 in parallel
  const [readmeRaw, apiReferenceRaw, docstringsRaw] = await Promise.all([
    readmePromise,
    apiReferencePromise,
    docstringsPromise
  ]);

  // Parse the docstrings JSON
  let docstrings = [];
  try {
    // Strip fenced code block if the model wrapped it
    const cleaned = docstringsRaw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    docstrings = JSON.parse(cleaned);
    if (!Array.isArray(docstrings)) {
      throw new Error('Expected an array');
    }
  } catch (err) {
    console.error('Failed to parse docstrings JSON from OpenAI. Raw response saved.', err.message);
    docstrings = [{ filePath: 'N/A', functionName: 'N/A', suggestedDocstring: docstringsRaw }];
  }

  return {
    readme: readmeRaw,
    apiReference: apiReferenceRaw,
    docstrings
  };
}

module.exports = {
  generateDocs
};
