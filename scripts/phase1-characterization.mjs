import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const junctionPath = resolve(repositoryRoot, 'DIFARYX-demo', 'real-app');

const excludedRelativePaths = new Set(['DIFARYX-demo', 'DIFARYX-demo/real-app']);

function relativePath(filePath) {
  return relative(repositoryRoot, filePath).replaceAll('\\', '/');
}

function isExcluded(relativeFilePath) {
  return [...excludedRelativePaths].some(
    (excluded) => relativeFilePath === excluded || relativeFilePath.startsWith(`${excluded}/`),
  );
}

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    const rel = relativePath(fullPath);
    if (isExcluded(rel)) continue;

    const stats = await lstat(fullPath);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) {
      output.push(...await walk(fullPath));
    } else {
      output.push(fullPath);
    }
  }
  return output;
}

function matchingLines(contents, pattern) {
  return contents
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(({ text }) => pattern.test(text));
}

const files = await walk(resolve(repositoryRoot, 'src'));
const sourceFiles = files.filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));

async function reportFile(filePath, patterns) {
  const contents = await readFile(filePath, 'utf8');
  return {
    file: relativePath(filePath),
    matches: patterns.flatMap((pattern) => matchingLines(contents, pattern)),
  };
}

const agentDemo = resolve(repositoryRoot, 'src/pages/AgentDemo.tsx');
const app = resolve(repositoryRoot, 'src/App.tsx');
const activeEvidenceFacade = resolve(repositoryRoot, 'src/scientificReview/services/evidenceBundleService.ts');
const legacyFiles = sourceFiles.filter((file) =>
  /src[\\/]services[\\/](?:llmIntegration|evidencePacket)\.ts$/.test(file),
);

let junctionTarget = null;
try {
  junctionTarget = await realpath(junctionPath);
} catch {
  junctionTarget = 'unavailable';
}

const reports = [
  await reportFile(app, [/path="\/(?:agent|demo\/agent)"/, /AgentDemo/]),
  await reportFile(agentDemo, [/evidencePacket/, /callReasoningAPI/, /saveRun/, /saveAgentRunResult/]),
  await reportFile(activeEvidenceFacade, [/agent\/mcp\/evidencePacket/, /buildActiveModelInput/]),
  ...await Promise.all(legacyFiles.map((file) => reportFile(file, [/evidencePacket/, /executeLLMReasoning/, /llmPrompt/]))),
];

const generatorImporters = [];
const evidenceStackImporters = [];
for (const file of sourceFiles) {
  const contents = await readFile(file, 'utf8');
  if (contents.includes('generateDeterministicReasoning')) {
    generatorImporters.push(relativePath(file));
  }
  if (contents.includes('agent/mcp/evidencePacket') || contents.includes('services/evidencePacket')) {
    evidenceStackImporters.push({
      file: relativePath(file),
      activeMcp: contents.includes('agent/mcp/evidencePacket'),
      legacyService: contents.includes('services/evidencePacket'),
    });
  }
}

console.log(JSON.stringify({
  repositoryRoot,
  junction: {
    path: relativePath(junctionPath),
    target: junctionTarget,
    excluded: true,
  },
  traversal: {
    sourceFiles: sourceFiles.length,
    excludedRelativePaths: [...excludedRelativePaths],
  },
  routeAndImportEvidence: reports,
  evidenceStackImporters,
  deterministicGeneratorImporters: generatorImporters,
}, null, 2));
