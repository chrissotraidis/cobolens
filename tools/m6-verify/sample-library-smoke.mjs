#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const extensions = new Set([".cbl", ".cob", ".cpy", ".jcl"]);
const samples = [
  { id: "m6-lineage", root: "fixtures/m6-bakeoff", files: 4, nodes: 28, license: false },
  { id: "ibm-zopen-batch", root: "samples/catalog/ibm-zopen-batch", files: 23, nodes: 286, license: true },
  { id: "zosconnect-api-requester", root: "samples/catalog/zosconnect-api-requester", files: 11, nodes: 188, license: true },
  { id: "aws-carddemo", root: "samples/catalog/aws-carddemo", files: 152, nodes: 6139, license: true },
];
const failures = [];
const report = [];
const commentNoiseNodeIds = new Set([
  "prog:AND",
  "prog:API",
  "prog:REST",
  "prog:THE",
  "prog:WAS",
  "copy:THE",
  "dataset:AT",
  "dataset:FILE",
  "dataset:R",
  "dataset:THE",
  "dataset:UPDATE",
  "dataset:WITH",
  "db2:CALL",
  "db2:QUEUE",
  "db2:THE",
]);

for (const sample of samples) {
  const graph = await readJson(resolve(repoRoot, "public", "samples", `${sample.id}-graph.json`));
  const source = await readJson(resolve(repoRoot, "public", "samples", `${sample.id}-source.json`));
  const root = resolve(repoRoot, sample.root);
  const sourceFiles = await collectSourceFiles(root);
  const bundledFiles = Object.keys(source).sort();
  const graphFiles = new Set([
    ...graph.nodes.flatMap((node) => node.file ? [node.file] : []),
    ...graph.edges.flatMap((edge) => edge.site?.file ? [edge.site.file] : []),
  ]);

  expect(graph.schemaVersion === 1, `${sample.id} graph schema must be version 1`);
  expect(graph.meta.fileCount === sample.files, `${sample.id} graph must report ${sample.files} files`);
  expect(graph.meta.parsedFileCount === sample.files, `${sample.id} must keep every source file usable`);
  expect(graph.nodes.length === sample.nodes, `${sample.id} graph must contain ${sample.nodes} nodes`);
  expect(
    !graph.nodes.some((node) => commentNoiseNodeIds.has(node.id)),
    `${sample.id} must not turn prose in COBOL comments into graph nodes`,
  );
  expect(sourceFiles.length === sample.files, `${sample.id} corpus must contain ${sample.files} source files`);
  expect(bundledFiles.length === sample.files, `${sample.id} source bundle must contain ${sample.files} files`);
  for (const file of graphFiles) expect(file in source, `${sample.id} is missing referenced source ${file}`);
  for (const file of sourceFiles) {
    const key = relative(root, file).split("\\").join("/");
    expect(source[key] === await readFile(file, "utf8"), `${sample.id} bundle differs from ${key}`);
  }
  if (sample.license) {
    const license = await readFile(resolve(root, "LICENSE"), "utf8");
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    expect(license.includes("Apache License"), `${sample.id} must retain its Apache license`);
    expect(/commit\s+`[0-9a-f]{40}`/.test(readme), `${sample.id} README must pin the upstream commit`);
  }

  report.push({
    id: sample.id,
    files: graph.meta.fileCount,
    parsed: graph.meta.parsedFileCount,
    warnings: graph.meta.parseErrors.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
  });
}

const catalog = await readFile(resolve(repoRoot, "src", "samples", "catalog.ts"), "utf8");
const dialog = await readFile(resolve(repoRoot, "src", "samples", "SampleLibraryDialog.tsx"), "utf8");
for (const sample of samples) expect(catalog.includes(`id: "${sample.id}"`), `catalog must list ${sample.id}`);
expect(dialog.includes("Sample library"), "sample chooser must identify itself as the Sample library");
expect(dialog.includes("Public samples retain their upstream license"), "chooser must explain source provenance");

if (failures.length) {
  console.error(`Sample library smoke failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(JSON.stringify({ samples: report, sourceBundlesMatchCorpora: true, provenanceRetained: true }, null, 2));

function expect(condition, message) {
  if (!condition) failures.push(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function collectSourceFiles(root) {
  const files = [];
  await walk(root, files);
  return files.sort((left, right) => left.localeCompare(right));
}

async function walk(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }
}
