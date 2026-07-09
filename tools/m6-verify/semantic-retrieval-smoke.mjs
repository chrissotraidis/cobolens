#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-semantic-retrieval-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/retrieval/context.ts",
      "src/retrieval/semantic.ts",
      "src/lib/graph.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--outDir",
      tempRoot,
      "--skipLibCheck",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout);
    process.stderr.write(compile.stderr);
    process.exit(compile.status ?? 1);
  }

  const require = createRequire(resolve(tempRoot, "smoke.cjs"));
  const { retrieveQuestionContext } = require(resolve(tempRoot, "retrieval", "context.js"));
  const {
    buildSemanticChunkVectorIndex,
    buildSemanticChunks,
    buildSemanticSourceChunks,
    createLocalStorageSemanticVectorStore,
    semanticGraphIndexKey,
    semanticSearchGraph,
  } = require(resolve(tempRoot, "retrieval", "semantic.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const sourceBundle = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-source.json"), "utf8"));
  const reportRecord = graph.nodes.find((node) => node.name === "REPORT-RECORD");
  const customer = graph.nodes.find((node) => node.name === "CUSTOMER");
  if (!reportRecord || !customer) throw new Error("Fixture nodes missing.");

  const sourceChunks = await buildSemanticSourceChunks({
    graph,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const combinedChunks = buildSemanticChunks(graph, sourceChunks);

  const matches = await semanticSearchGraph({
    graph,
    question: "Which record is written to the report output?",
    topK: 2,
    embedTexts: async (texts) => ({
      vectors: texts.map((text) => {
        if (/Which record is written/i.test(text)) return [1, 0, 0];
        if (/^REPORT-RECORD is/i.test(text)) return [0.98, 0.02, 0];
        if (/CUSTOMER/i.test(text)) return [0, 1, 0];
        return [0, 0, 1];
      }),
    }),
  });
  const storage = createMemoryStorage();
  const vectorStore = createLocalStorageSemanticVectorStore(storage);
  const indexKey = semanticGraphIndexKey(
    graph,
    "ollama|http://127.0.0.1:11434/api|fixture-embed",
    160,
    combinedChunks,
  );
  const embedCallSizes = [];
  const warmResult = await buildSemanticChunkVectorIndex({
    graph,
    indexKey,
    vectorStore,
    chunks: combinedChunks,
    maxCandidateChunks: 160,
    embedTexts: async (texts) => {
      embedCallSizes.push(texts.length);
      return {
        vectors: texts.map((text) => vectorForText(text)),
      };
    },
  });
  const cachedMatches = await semanticSearchGraph({
    graph,
    question: "Which record is written to the report output?",
    topK: 2,
    indexKey,
    vectorStore,
    chunks: combinedChunks,
    maxCandidateChunks: 160,
    requireCachedIndex: true,
    embedTexts: async (texts) => {
      embedCallSizes.push(texts.length);
      return {
        vectors: texts.map((text) => vectorForText(text)),
      };
    },
  });
  const reusedMatches = await semanticSearchGraph({
    graph,
    question: "Which record is written to the report output?",
    topK: 2,
    indexKey,
    vectorStore,
    chunks: combinedChunks,
    maxCandidateChunks: 160,
    requireCachedIndex: true,
    embedTexts: async (texts) => {
      embedCallSizes.push(texts.length);
      return {
        vectors: texts.map((text) => vectorForText(text)),
      };
    },
  });
  const sourceMatches = await semanticSearchGraph({
    graph,
    question: "Where is the customer rate calculated?",
    topK: 2,
    indexKey,
    vectorStore,
    chunks: combinedChunks,
    maxCandidateChunks: 160,
    requireCachedIndex: true,
    embedTexts: async (texts) => ({ vectors: texts.map((text) => vectorForText(text)) }),
  });

  const context = await retrieveQuestionContext({
    graph,
    question: "Describe the report output record in plain English.",
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
    semanticSearch: async () => [
      {
        node: reportRecord,
        score: 0.97,
        text: "REPORT-RECORD is written by LINEAGE at src/LINEAGE.cbl:26.",
        kind: "graph",
        file: "copybook/REPORT.cpy",
        startLine: 1,
        endLine: 1,
      },
    ],
  });

  const fallbackContext = await retrieveQuestionContext({
    graph,
    question: "Describe the report output record in plain English.",
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
    semanticSearch: async () => {
      throw new Error("embedding model unavailable");
    },
  });

  const chunks = buildSemanticChunks(graph);
  const rateSourceChunk = sourceChunks.find((chunk) =>
    chunk.file === "src/LINEAGE.cbl" && chunk.text.includes("SELECT RATE"),
  );
  const sourceContext = await retrieveQuestionContext({
    graph,
    question: "Where is the customer rate calculated?",
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
    semanticSearch: async () => sourceMatches.slice(0, 1),
  });
  const checks = {
    "semantic chunks include graph relationship facts": chunks.some((chunk) => chunk.node.name === "REPORT-RECORD" && /writes REPORT-RECORD/.test(chunk.text)),
    "semantic source chunks split at a paragraph boundary with exact ranges":
      rateSourceChunk?.kind === "source" &&
      rateSourceChunk.startLine === 25 &&
      rateSourceChunk.endLine === 47,
    "source and graph chunks are ranked together":
      combinedChunks.some((chunk) => chunk.kind === "source") &&
      combinedChunks.some((chunk) => chunk.kind === "graph"),
    "semantic search ranks vector-nearest node first": matches[0]?.node.name === "REPORT-RECORD",
    "behavioral semantic search ranks the relevant source code first":
      sourceMatches[0]?.kind === "source" &&
      sourceMatches[0]?.file === "src/LINEAGE.cbl" &&
      sourceMatches[0]?.text.includes("SELECT RATE"),
    "semantic warm builds chunk-only index before query": warmResult.chunkCount > 0 && embedCallSizes[0] === warmResult.chunkCount,
    "semantic index is persisted after first search": Boolean(storage.getItem(indexKey)) && cachedMatches[0]?.node.name === "REPORT-RECORD",
    "semantic index reuses stored chunk vectors": reusedMatches[0]?.node.name === "REPORT-RECORD" && embedCallSizes.at(-1) === 1,
    "semantic context includes matched node": context.focusNodes.some((node) => node.name === "REPORT-RECORD"),
    "semantic prompt includes vector match section": context.prompt.includes("Semantic vector matches:") && context.prompt.includes("REPORT-RECORD is written by LINEAGE"),
    "semantic citations include matched node source": context.citations.some((citation) => citation.file === "copybook/REPORT.cpy" && citation.nodeId === reportRecord.id),
    "source semantic citations preserve the exact chunk range":
      sourceContext.citations.some((citation) =>
        citation.file === "src/LINEAGE.cbl" &&
        citation.line === 25 &&
        citation.endLine === 47,
      ),
    "semantic retrieval degrades visibly when embeddings fail":
      fallbackContext.prompt.includes("Semantic vector matches:\n- Unavailable (embedding model unavailable)") &&
      fallbackContext.semanticError === "embedding model unavailable" &&
      fallbackContext.focusNodes.length > 0,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Semantic retrieval smoke failed: ${failed.join(", ")}`);
    console.error(JSON.stringify({
      warmResult,
      queryVector: vectorForText("Which record is written to the report output?"),
      reportChunk: combinedChunks.find((chunk) => chunk.kind === "graph" && chunk.node.name === "REPORT-RECORD"),
      reportVector: JSON.parse(storage.getItem(indexKey) ?? "null")?.vectors?.[
        combinedChunks.findIndex((chunk) => chunk.kind === "graph" && chunk.node.name === "REPORT-RECORD")
      ],
      cachedMatches: cachedMatches.map((match) => ({ name: match.node.name, kind: match.kind, score: match.score })),
      reusedMatches: reusedMatches.map((match) => ({ name: match.node.name, kind: match.kind, score: match.score })),
      sourceMatches: sourceMatches.map((match) => ({ name: match.node.name, kind: match.kind, score: match.score, range: `${match.file}:${match.startLine}-${match.endLine}` })),
      embedCallSizes,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ checks }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function vectorForText(text) {
  if (/Where is the customer rate calculated/i.test(text)) return [0, 0, 0, 1];
  if (/^Source for LINEAGE at src\/LINEAGE\.cbl:25-47:/i.test(text) && /SELECT RATE/i.test(text)) return [0, 0, 0.02, 0.98];
  if (/Which record is written/i.test(text)) return [1, 0, 0, 0];
  if (/^REPORT-RECORD is/i.test(text)) return [0.98, 0.02, 0, 0];
  if (/CUSTOMER/i.test(text)) return [0, 1, 0, 0];
  return [0, 0, 1, 0];
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function sourceExcerpt(sourceBundle, node) {
  if (!node.file) {
    throw new Error(`Node ${node.id} has no source file.`);
  }
  const text = sourceBundle[node.file];
  if (text == null) {
    throw new Error(`Source ${node.file} is unavailable.`);
  }
  const lines = text.split(/\r?\n/);
  const startLine = node.lines?.[0] ?? 1;
  const endLine = node.lines?.[1] ?? startLine;
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
