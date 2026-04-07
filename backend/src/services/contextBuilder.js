const path = require('path');

const MAX_TOKENS = 80000;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;

/**
 * Categorizes a file based on its path and name.
 */
function getCategory(filePath) {
  const lowerPath = filePath.toLowerCase();
  const baseName = path.basename(lowerPath);

  if (/(\.test\.|\.spec\.|__tests__)/.test(lowerPath)) {
    return 'tests';
  }
  if (/^(index|main|app)\.(js|ts|py|go|java|rb)$/.test(baseName)) {
    return 'entry';
  }
  if (lowerPath.includes('/route') || lowerPath.includes('/api')) {
    return 'routes';
  }
  if (lowerPath.includes('/service') || lowerPath.includes('/controller') || lowerPath.includes('/handler') || lowerPath.includes('/model')) {
    return 'services';
  }
  if (lowerPath.includes('/util') || lowerPath.includes('/helper') || lowerPath.includes('/lib')) {
    return 'utils';
  }
  if (['package.json', 'requirements.txt', 'tsconfig.json', 'pom.xml', 'gemfile'].includes(baseName)) {
    return 'config';
  }
  return 'others';
}

const PRIORITY_ORDER = {
  entry: 1,
  routes: 2,
  services: 3,
  utils: 4,
  config: 5,
  others: 6,
  tests: 7,
};

/**
 * Builds a visual tree representation of the file paths.
 */
function buildTreeString(filePaths) {
  const tree = {};
  for (const fp of filePaths) {
    const parts = fp.split('/');
    let current = tree;
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  }

  let lines = [];
  function printNode(node, prefix = '') {
    const keys = Object.keys(node).sort();
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${key}`);
      if (Object.keys(node[key]).length > 0) {
        printNode(node[key], prefix + (isLast ? '    ' : '│   '));
      }
    }
  }
  printNode(tree);
  return lines.join('\n');
}

/**
 * Extracts basic exported classes and functions using regex.
 */
function extractExports(content, extension) {
  const exports = [];
  
  if (['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
    // JS/TS Function/Class rules
    const fnRegex = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm;
    const arrowRegex = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=]+)=>/gm;
    const classRegex = /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_]+)/gm;
    
    let match;
    while ((match = fnRegex.exec(content)) !== null) exports.push(`Function: ${match[1]}`);
    while ((match = arrowRegex.exec(content)) !== null) exports.push(`Function: ${match[1]}`);
    while ((match = classRegex.exec(content)) !== null) exports.push(`Class: ${match[1]}`);
  } else if (['.py'].includes(extension)) {
    // Python Def/Class rules
    const defRegex = /^def\s+([A-Za-z0-9_]+)\s*\(/gm;
    const classRegex = /^class\s+([A-Za-z0-9_]+)\s*[:(]/gm;
    
    let match;
    while ((match = defRegex.exec(content)) !== null) exports.push(`Def: ${match[1]}`);
    while ((match = classRegex.exec(content)) !== null) exports.push(`Class: ${match[1]}`);
  }
  
  return exports;
}

/**
 * Processes parsed files and intelligently trims and extracts context.
 * 
 * @param {Array<{path: string, content: string, extension: string}>} parsedFiles 
 * @returns {{ summary: string, files: Array<{path: string, content: string}>, totalTokenEstimate: number }}
 */
function buildContext(parsedFiles) {
  // Sort files by calculated priority
  const prioritizedFiles = parsedFiles
    .map(file => ({ ...file, category: getCategory(file.path) }))
    .sort((a, b) => PRIORITY_ORDER[a.category] - PRIORITY_ORDER[b.category]);

  const treeLines = buildTreeString(parsedFiles.map(f => f.path));
  
  const dependencies = [];
  let packageJsonStr = '';
  let reqTxtStr = '';
  
  // Extract key dependencies and prepare export maps
  const exportsMap = {};
  for (const file of parsedFiles) {
    if (file.path.endsWith('package.json')) {
      packageJsonStr = file.content;
    } else if (file.path.endsWith('requirements.txt')) {
      reqTxtStr = file.content;
    } else {
      const exps = extractExports(file.content, file.extension);
      if (exps.length > 0) {
        exportsMap[file.path] = exps;
      }
    }
  }

  if (packageJsonStr) {
    try {
      const pjson = JSON.parse(packageJsonStr);
      const deps = Object.keys(pjson.dependencies || {}).concat(Object.keys(pjson.devDependencies || {}));
      if (deps.length > 0) dependencies.push(`Node.js Dependencies:\n  - ${deps.join('\n  - ')}`);
    } catch(e) {}
  }
  
  if (reqTxtStr) {
    const lines = reqTxtStr.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length > 0) dependencies.push(`Python Dependencies:\n  - ${lines.join('\n  - ')}`);
  }

  // Build Exports String
  let exportsStr = '';
  for (const [fp, exps] of Object.entries(exportsMap)) {
    exportsStr += `${fp}:\n  - ${exps.join('\n  - ')}\n`;
  }

  // Combine static segments of the summary
  let summary = "### CODEBASE STRUCTURE\n==================\n";
  summary += treeLines + "\n\n";
  if (dependencies.length > 0) {
    summary += "### KEY DEPENDENCIES\n==================\n" + dependencies.join('\n\n') + "\n\n";
  }
  if (exportsStr) {
    summary += "### EXPORTED FUNCTIONS & CLASSES\n==================\n" + exportsStr;
  }

  // Filter content size limits properly
  let totalChars = summary.length;
  let finalFiles = [];
  
  for (const file of prioritizedFiles) {
    const fileHeaderStr = `\n--- FILE: ${file.path} (${file.category}) ---\n`;
    const charsToAdd = fileHeaderStr.length + file.content.length;

    if (totalChars + charsToAdd <= MAX_CHARS) {
      totalChars += charsToAdd;
      finalFiles.push({ path: file.path, content: file.content });
    } else {
      // Cannot fit full file. Check if we can fit a truncated version or if we strictly skip
      const charsRemaining = MAX_CHARS - totalChars - fileHeaderStr.length;
      if (charsRemaining > 500) {
        const truncatedContent = file.content.substring(0, charsRemaining) + '\n... [TRUNCATED DUE TO SIZE LIMIT]';
        totalChars += fileHeaderStr.length + truncatedContent.length;
        finalFiles.push({ path: file.path, content: truncatedContent });
      }
      // Stop adding more content immediately as we hit the soft ceiling
      break;
    }
  }

  return {
    summary,
    files: finalFiles,
    totalTokenEstimate: Math.ceil(totalChars / CHARS_PER_TOKEN)
  };
}

module.exports = {
  buildContext
};
