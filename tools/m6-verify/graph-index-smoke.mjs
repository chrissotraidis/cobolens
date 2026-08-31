#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-graph-index-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/lib/graphIndex.ts",
      "src/lib/graphSelectors.ts",
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
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout);
    process.stderr.write(compile.stderr);
    process.exit(compile.status ?? 1);
  }

  const require = createRequire(resolve(tempRoot, "smoke.cjs"));
  const graphIndexPath = existsSync(resolve(tempRoot, "lib", "graphIndex.js"))
    ? resolve(tempRoot, "lib", "graphIndex.js")
    : resolve(tempRoot, "graphIndex.js");
  const graphSelectorsPath = existsSync(resolve(tempRoot, "lib", "graphSelectors.js"))
    ? resolve(tempRoot, "lib", "graphSelectors.js")
    : resolve(tempRoot, "graphSelectors.js");
  const { graphIndex, incidentEdges } = require(graphIndexPath);
  const { dependencyCounts } = require(graphSelectorsPath);

  const graph = largeGraph(6_139, 14_008);
  const indexStarted = performance.now();
  const firstIndex = graphIndex(graph);
  const indexMs = performance.now() - indexStarted;
  const secondIndex = graphIndex(graph);
  const selfLoop = graph.edges.at(-1);
  const selfLoopIncidentCount = incidentEdges(firstIndex, selfLoop.from).filter((edge) => edge === selfLoop).length;

  let naiveTotal = 0;
  const lookupNodes = graph.nodes.slice(0, 500);
  const naiveStarted = performance.now();
  for (const node of lookupNodes) {
    naiveTotal += graph.edges.filter((edge) => edge.to === node.id).length;
    naiveTotal += graph.edges.filter((edge) => edge.from === node.id).length;
  }
  const naiveMs = performance.now() - naiveStarted;

  let indexedTotal = 0;
  const indexedStarted = performance.now();
  for (const node of lookupNodes) indexedTotal += dependencyCounts(node, graph).total;
  const indexedMs = performance.now() - indexedStarted;

  const assertions = [
    ["graph index is cached by graph identity", firstIndex === secondIndex],
    ["indexed dependency counts match whole-graph scans", indexedTotal === naiveTotal],
    ["self-loop appears once in incident edges", selfLoopIncidentCount === 1],
    ["representative graph index builds within a broad interactive budget", indexMs < 250],
    ["cached lookups avoid repeated whole-graph work", indexedMs < naiveMs],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Graph index smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    checked: assertions.length,
    graph: { nodes: graph.nodes.length, edges: graph.edges.length },
    indexMs: round(indexMs),
    naiveLookupMs: round(naiveMs),
    indexedLookupMs: round(indexedMs),
    lookupSpeedup: round(naiveMs / Math.max(indexedMs, 0.001)),
  }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function largeGraph(nodeCount, edgeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node:${index}`,
    type: index % 7 === 0 ? "program" : "data-item",
    name: `NODE-${index}`,
    file: `src/file-${index % 272}.cbl`,
    lines: [1, 20],
  }));
  const edges = Array.from({ length: edgeCount - 1 }, (_, index) => ({
    from: `node:${index % nodeCount}`,
    to: `node:${(index * 37 + 11) % nodeCount}`,
    type: index % 3 === 0 ? "READS" : "CALLS",
    site: { file: `src/file-${index % 272}.cbl`, line: (index % 400) + 1 },
  }));
  edges.push({ from: "node:0", to: "node:0", type: "SELF" });
  return {
    schemaVersion: 1,
    meta: { scannedAt: "2026-08-31T00:00:00Z", dialectGuess: "IBM", fileCount: 272, parsedFileCount: 272, parseErrors: [] },
    nodes,
    edges,
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
