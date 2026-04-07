const { GoogleGenerativeAI } = require("@google/generative-ai");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Sleeps for a given number of milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the Gemini API with retry logic.
 * @param {string} prompt - The full prompt string
 * @param {number} attempt - Current attempt number
 * @returns {Promise<string>} - The text response
 */
async function callWithRetry(prompt, attempt = 1) {
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return text;
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      console.warn(
        `Gemini API call failed (attempt ${attempt}/${MAX_RETRIES}): ${error.message}. Retrying...`,
      );
      await sleep(RETRY_DELAY_MS * attempt); // exponential backoff
      return callWithRetry(prompt, attempt + 1);
    }
    throw new Error(
      `Gemini API call failed after ${MAX_RETRIES} attempts: ${error.message}`,
    );
  }
}

/**
 * Builds a concatenated code block from a list of file objects.
 * @param {Array<{path: string, content: string}>} files
 * @returns {string}
 */
function formatFilesForPrompt(files) {
  return files
    .map((f) => `### FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
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
  const entryFiles = files.filter(
    (f) =>
      /\/(index|main|app)\.(js|ts|py|go|java|rb)$/.test(f.path) ||
      f.path === "index.js" ||
      f.path === "app.js" ||
      f.path === "main.py",
  );
  const routeFiles = files.filter(
    (f) =>
      f.path.toLowerCase().includes("/route") ||
      f.path.toLowerCase().includes("/api") ||
      f.path.toLowerCase().includes("/controller"),
  );
  const utilServiceFiles = files.filter(
    (f) =>
      f.path.toLowerCase().includes("/service") ||
      f.path.toLowerCase().includes("/util") ||
      f.path.toLowerCase().includes("/helper") ||
      f.path.toLowerCase().includes("/lib"),
  );

  // Prepare prompt content strings
  const summarySection = `## Codebase Summary\n${summary}`;
  const entrySection =
    entryFiles.length > 0
      ? formatFilesForPrompt(entryFiles)
      : "(no entry point files identified)";
  const routeSection =
    routeFiles.length > 0
      ? formatFilesForPrompt(routeFiles)
      : "(no route files identified)";
  const utilSection =
    utilServiceFiles.length > 0
      ? formatFilesForPrompt(utilServiceFiles)
      : "(no utility/service files identified)";

  // === Call A: README Generator ===
  const readmePromise = callWithRetry(
    `You are a senior software engineer and technical writer documenting your own project.

     Generate a professional README.md for a software project based on the provided codebase context. Include: title, description, features, tech stack, installation, usage, and contributing sections. Do not include AI commentary — write it as if you are the author.\n\n${summarySection}\n\n## Entry Points\n${entrySection}`,
  );

  // === Call B: API Reference Generator ===
  const apiReferencePromise = callWithRetry(
    `You are a senior backend engineer documenting your own API. Write precise, developer-friendly API reference docs. Use actual route names, parameters, and response shapes found in the code. Never use placeholders.

Generate a complete API reference in markdown. For each endpoint include: method, path, description, request params/body (with types), response format, and a curl example. Only document routes actually present in the code below.

${routeSection}`,
  );

  // === Call C: Docstring Suggestions ===
  const docstringsPromise = callWithRetry(
    `You are a senior engineer doing a code review. Generate JSDoc comments only for functions that are missing them or have inadequate documentation.

Return a JSON array only — no explanation, no markdown fences. Each item: { filePath, functionName, suggestedDocstring }. Only include functions that genuinely need documentation. Skip test files, generated files, and simple one-liners.

${utilSection}`,
  );

  // Run all 3 in parallel
  const [readmeRaw, apiReferenceRaw, docstringsRaw] = await Promise.all([
    readmePromise,
    apiReferencePromise,
    docstringsPromise,
  ]);

  // Parse the docstrings JSON
  let docstrings = [];
  try {
    // Strip fenced code block if the model wrapped it
    const cleaned = docstringsRaw
      .trim()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");
    docstrings = JSON.parse(cleaned);
    if (!Array.isArray(docstrings)) {
      throw new Error("Expected an array");
    }
  } catch (err) {
    console.error(
      "Failed to parse docstrings JSON from Gemini. Raw response saved.",
      err.message,
    );
    docstrings = [
      {
        filePath: "N/A",
        functionName: "N/A",
        suggestedDocstring: docstringsRaw,
      },
    ];
  }

  return {
    readme: readmeRaw,
    apiReference: apiReferenceRaw,
    docstrings,
  };
}

module.exports = {
  generateDocs,
};
