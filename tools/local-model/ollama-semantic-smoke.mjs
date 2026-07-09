#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-ollama-semantic-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "module" }));
  await symlink(resolve(repoRoot, "node_modules"), resolve(tempRoot, "node_modules"), "dir");
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/retrieval/semantic.ts",
      "src/model/embeddings.ts",
      "src/model/config.ts",
      "src/model/privacy.ts",
      "src/lib/graph.ts",
      "--target",
      "ES2022",
      "--module",
      "ES2022",
      "--moduleResolution",
      "bundler",
      "--outDir",
      tempRoot,
      "--skipLibCheck",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout);
    process.stderr.write(compile.stderr);
    process.exit(compile.status ?? 1);
  }
  await patchCompiledImports("retrieval/semantic.js");
  await patchCompiledImports("model/embeddings.js");
  await patchCompiledImports("model/privacy.js");

  const { DEFAULT_MODEL_SETTINGS } = await import(compiledModuleUrl("model", "config.js"));
  const { embedTexts } = await import(compiledModuleUrl("model", "embeddings.js"));
  const {
    buildSemanticChunkVectorIndex,
    buildSemanticChunks,
    buildSemanticSourceChunks,
    createLocalStorageSemanticVectorStore,
    hasSemanticChunkVectorIndex,
    semanticGraphIndexKey,
    semanticSearchGraph,
  } = await import(compiledModuleUrl("retrieval", "semantic.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const sourceBundle = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-source.json"), "utf8"));
  const settings = {
    ...DEFAULT_MODEL_SETTINGS,
    embeddingModel: process.argv[2] ?? DEFAULT_MODEL_SETTINGS.embeddingModel,
    baseUrl: process.env.OLLAMA_BASE_URL
      ? `${process.env.OLLAMA_BASE_URL.replace(/\/+$/, "")}/api`
      : DEFAULT_MODEL_SETTINGS.baseUrl,
  };
  const sourceChunks = await buildSemanticSourceChunks({
    graph,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const chunks = buildSemanticChunks(graph, sourceChunks);
  const storage = createMemoryStorage();
  const vectorStore = createLocalStorageSemanticVectorStore(storage);
  const indexKey = semanticGraphIndexKey(
    graph,
    `ollama|${settings.baseUrl}|${settings.embeddingModel}`,
    160,
    chunks,
  );
  const embedCallSizes = [];
  const embed = async (texts) => {
    embedCallSizes.push(texts.length);
    return embedTexts({ settings, texts, timeoutMs: 30_000 });
  };
  const warm = await buildSemanticChunkVectorIndex({
    graph,
    chunks,
    indexKey,
    vectorStore,
    maxCandidateChunks: 160,
    embedTexts: embed,
  });
  const restartedStore = createLocalStorageSemanticVectorStore(storage);
  const search = () => semanticSearchGraph({
    graph,
    chunks,
    question: "Where does LINEAGE select the customer rate from CUSTOMER_TABLE?",
    indexKey,
    vectorStore: restartedStore,
    maxCandidateChunks: 160,
    topK: 4,
    requireCachedIndex: true,
    embedTexts: embed,
  });
  const firstMatches = await search();
  const repeatedMatches = await search();
  const rateMatch = firstMatches.find((match) =>
    match.kind === "source" &&
    match.file === "src/LINEAGE.cbl" &&
    match.text.includes("SELECT RATE") &&
    match.startLine <= 35 &&
    match.endLine >= 38,
  );
  const checks = {
    "source-aware semantic chunks were built": sourceChunks.length > 0,
    "semantic vectors were persisted": !warm.cached && await hasSemanticChunkVectorIndex({
      graph,
      chunks,
      indexKey,
      vectorStore: restartedStore,
      maxCandidateChunks: 160,
    }),
    "behavioral query retrieves the exact rate source range": Boolean(rateMatch),
    "restarted cache reuses chunk vectors":
      repeatedMatches.length > 0 &&
      embedCallSizes[0] === warm.chunkCount &&
      embedCallSizes.slice(1).every((size) => size === 1),
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Ollama semantic smoke failed: ${failed.join(", ")}`);
    console.error(JSON.stringify({
      model: settings.embeddingModel,
      matches: firstMatches.map((match) => ({
        kind: match.kind,
        range: `${match.file}:${match.startLine}-${match.endLine}`,
        score: match.score,
        node: match.node.name,
      })),
      embedCallSizes,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    model: settings.embeddingModel,
    chunkCount: warm.chunkCount,
    sourceChunkCount: sourceChunks.length,
    rateMatch: `${rateMatch.file}:${rateMatch.startLine}-${rateMatch.endLine}`,
    embedCallSizes,
    checks,
  }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function compiledModuleUrl(folder, filename) {
  return pathToFileURL(resolve(tempRoot, folder, filename)).href;
}

async function patchCompiledImports(path) {
  const target = resolve(tempRoot, path);
  if (!existsSync(target)) return;
  const current = await readFile(target, "utf8");
  const patched = current
    .replaceAll('from "../lib/graph"', 'from "../lib/graph.js"')
    .replaceAll('from "./config"', 'from "./config.js"')
    .replaceAll('from "./privacy"', 'from "./privacy.js"');
  if (patched !== current) await writeFile(target, patched);
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function sourceExcerpt(sourceBundle, node) {
  if (!node.file) throw new Error(`Node ${node.id} has no source file.`);
  const text = sourceBundle[node.file];
  if (text == null) throw new Error(`Source ${node.file} is unavailable.`);
  const lines = text.split(/\r?\n/);
  const startLine = node.lines?.[0] ?? 1;
  const endLine = Math.min(lines.length, node.lines?.[1] ?? startLine);
  return {
    file: node.file,
    startLine,
    endLine,
    truncated: false,
    text: lines
      .slice(startLine - 1, endLine)
      .map((line, index) => `${startLine + index}: ${line}`)
      .join("\n"),
  };
}
