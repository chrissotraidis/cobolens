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
    buildSemanticChunks,
    createLocalStorageSemanticVectorStore,
    semanticGraphIndexKey,
    semanticSearchGraph,
  } = require(resolve(tempRoot, "retrieval", "semantic.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const sourceBundle = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-source.json"), "utf8"));
  const reportRecord = graph.nodes.find((node) => node.name === "REPORT-RECORD");
  const customer = graph.nodes.find((node) => node.name === "CUSTOMER");
  if (!reportRecord || !customer) throw new Error("Fixture nodes missing.");

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
  const indexKey = semanticGraphIndexKey(graph, "ollama|http://127.0.0.1:11434/api|fixture-embed");
  const embedCallSizes = [];
  const cachedMatches = await semanticSearchGraph({
    graph,
    question: "Which record is written to the report output?",
    topK: 2,
    indexKey,
    vectorStore,
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
    embedTexts: async (texts) => {
      embedCallSizes.push(texts.length);
      return {
        vectors: texts.map((text) => vectorForText(text)),
      };
    },
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
  const checks = {
    "semantic chunks include graph relationship facts": chunks.some((chunk) => chunk.node.name === "REPORT-RECORD" && /writes REPORT-RECORD/.test(chunk.text)),
    "semantic search ranks vector-nearest node first": matches[0]?.node.name === "REPORT-RECORD",
    "semantic index is persisted after first search": Boolean(storage.getItem(indexKey)) && cachedMatches[0]?.node.name === "REPORT-RECORD",
    "semantic index reuses stored chunk vectors": reusedMatches[0]?.node.name === "REPORT-RECORD" && embedCallSizes.at(-1) === 1,
    "semantic context includes matched node": context.focusNodes.some((node) => node.name === "REPORT-RECORD"),
    "semantic prompt includes vector match section": context.prompt.includes("Semantic vector matches:") && context.prompt.includes("REPORT-RECORD is written by LINEAGE"),
    "semantic citations include matched node source": context.citations.some((citation) => citation.file === "copybook/REPORT.cpy" && citation.nodeId === reportRecord.id),
    "semantic retrieval degrades when embeddings fail": fallbackContext.prompt.includes("Semantic vector matches:\n- None"),
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Semantic retrieval smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(JSON.stringify({ checks }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function vectorForText(text) {
  if (/Which record is written/i.test(text)) return [1, 0, 0];
  if (/^REPORT-RECORD is/i.test(text)) return [0.98, 0.02, 0];
  if (/CUSTOMER/i.test(text)) return [0, 1, 0];
  return [0, 0, 1];
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
