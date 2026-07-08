#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const graphPath = resolve(repoRoot, "public", "m6-bakeoff-graph.json");
const sourceBundlePath = resolve(repoRoot, "public", "m6-bakeoff-source.json");
const fixtureRoot = resolve(repoRoot, "fixtures", "m6-bakeoff");

const graph = await readJson(graphPath);
const sourceBundle = await readJson(sourceBundlePath);
const readme = await readText(resolve(repoRoot, "README.md"));
const techDebt = await readText(resolve(repoRoot, "docs", "tech-debt.md"));

const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const edges = Array.isArray(graph.edges) ? graph.edges : [];
const sourceFiles = Object.keys(sourceBundle).sort();
const referencedFiles = referencedGraphFiles(nodes, edges);
const failures = [];

expect(graph.schemaVersion === 1, "demo graph schemaVersion must be 1");
expect(nodes.length > 0, "demo graph must include nodes");
expect(edges.length > 0, "demo graph must include edges");
expect(graph.meta?.fileCount === sourceFiles.length, "demo graph file count must match bundled source files");
expect(graph.meta?.parsedFileCount === sourceFiles.length, "demo graph parsed-file count must match bundled source files");
expect(Array.isArray(graph.meta?.parseErrors) && graph.meta.parseErrors.length === 0, "demo graph must have no parse errors");

for (const file of referencedFiles) {
  expect(file in sourceBundle, `graph references ${file}, but it is missing from public/m6-bakeoff-source.json`);
}

for (const file of sourceFiles) {
  const bundled = sourceBundle[file];
  const fixture = await readText(resolve(fixtureRoot, file));
  expect(typeof bundled === "string" && bundled.length > 0, `${file} must have bundled source text`);
  expect(bundled === fixture, `${file} in public/m6-bakeoff-source.json must match fixtures/m6-bakeoff/${file}`);
}

for (const node of nodes) {
  if (node.file && Array.isArray(node.lines)) {
    const [start, end = start] = node.lines;
    expectLinesInFile(node.file, start, end, `node ${node.id}`);
  }
}

for (const edge of edges) {
  if (edge.site?.file && edge.site?.line) {
    expectLinesInFile(edge.site.file, edge.site.line, edge.site.line, `edge ${edge.from}->${edge.to}`);
  }
}

const policyText = `${readme}\n${techDebt}`;
expect(policyText.includes("npm run m6:fixture-graph"), "demo asset policy must name npm run m6:fixture-graph");
expect(policyText.includes("public/m6-bakeoff-graph.json"), "demo asset policy must name public/m6-bakeoff-graph.json");
expect(policyText.includes("public/m6-bakeoff-source.json"), "demo asset policy must name public/m6-bakeoff-source.json");
expect(/release/i.test(policyText), "demo asset policy must say when release regeneration happens");
expect(/analyzer/i.test(policyText), "demo asset policy must mention analyzer changes");

if (failures.length) {
  console.error(`Demo asset smoke failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      graph: {
        files: sourceFiles.length,
        nodes: nodes.length,
        edges: edges.length,
      },
      referencedFiles: referencedFiles.length,
      sourceBundleMatchesFixture: true,
      releasePolicyDocumented: true,
    },
    null,
    2,
  ),
);

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function readText(path) {
  return readFile(path, "utf8");
}

function referencedGraphFiles(graphNodes, graphEdges) {
  const files = new Set();
  for (const node of graphNodes) {
    if (node.file && !node.external) files.add(node.file);
  }
  for (const edge of graphEdges) {
    if (edge.site?.file) files.add(edge.site.file);
  }
  return [...files].sort();
}

function expectLinesInFile(file, start, end, label) {
  const text = sourceBundle[file];
  if (typeof text !== "string") {
    failures.push(`${label} cites ${file}, but that file is not bundled`);
    return;
  }
  const lineCount = text.split(/\r?\n/).length;
  const validStart = Number.isInteger(start) && start >= 1 && start <= lineCount;
  const validEnd = Number.isInteger(end) && end >= start && end <= lineCount;
  expect(validStart && validEnd, `${label} cites ${file}:${start}-${end}, outside bundled ${lineCount} lines`);
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}
