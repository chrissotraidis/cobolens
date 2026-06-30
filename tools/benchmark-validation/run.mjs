#!/usr/bin/env node
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const analyzer = resolve(
  repoRoot,
  "sidecar",
  "cobolens-analyze",
  "target",
  "debug",
  process.platform === "win32" ? "cobolens-analyze.exe" : "cobolens-analyze",
);
const root = parseRoot(process.argv.slice(2)) ?? process.env.COBOLENS_BENCHMARK_ROOT;

if (!root) {
  console.error("benchmark root is required: npm run validate:benchmark -- --root /path/to/benchmark");
  process.exit(2);
}

await assertReadableDirectory(root);
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-benchmark-"));
const out = resolve(tempRoot, "graph.json");

try {
  const result = await runAnalyzer(root, out);
  if (!result.ok) {
    console.error(`analyzer failed with ${result.code}`);
    for (const line of result.stderrLines.slice(-12)) console.error(line);
    process.exit(1);
  }

  const graph = JSON.parse(await readFile(out, "utf8"));
  const failures = validateGraph(graph);
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  const nodeTypes = [...new Set(graph.nodes.map((node) => node.type))].sort();
  const edgeTypes = [...new Set(graph.edges.map((edge) => edge.type))].sort();
  console.log(
    JSON.stringify(
      {
        files: graph.meta.fileCount,
        parsed: graph.meta.parsedFileCount,
        parseErrors: graph.meta.parseErrors.length,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        nodeTypes,
        edgeTypes,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function parseRoot(args) {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--root") throw new Error(`unknown argument: ${args[index]}`);
    const value = args[index + 1];
    if (!value) throw new Error("--root requires a path");
    return resolve(value);
  }
  return undefined;
}

async function assertReadableDirectory(path) {
  try {
    await access(path, constants.R_OK);
  } catch {
    console.error(`benchmark root is not readable: ${path}`);
    process.exit(2);
  }
}

function runAnalyzer(root, out) {
  const args = [
    "--root",
    root,
    "--out",
    out,
    "--format",
    "auto",
    "--ext",
    ".cbl,.cob,.cpy,.jcl",
    "--encoding",
    "utf8",
  ];

  return new Promise((resolveRun) => {
    const child = spawn(analyzer, args, { cwd: repoRoot });
    const stderrLines = [];
    child.stderr.on("data", (chunk) => {
      stderrLines.push(...chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean));
    });
    child.stdout.on("data", (chunk) => {
      for (const line of chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean)) {
        console.log(line);
      }
    });
    child.on("error", (error) => {
      resolveRun({ ok: false, code: "spawn-error", stderrLines: [error.message] });
    });
    child.on("close", (code) => {
      resolveRun({ ok: code === 0, code, stderrLines });
    });
  });
}

function validateGraph(graph) {
  const failures = [];
  if (graph.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (!Array.isArray(graph.nodes)) failures.push("nodes must be an array");
  if (!Array.isArray(graph.edges)) failures.push("edges must be an array");
  if (!graph.meta || !Array.isArray(graph.meta.parseErrors)) failures.push("meta.parseErrors must be an array");
  if (Array.isArray(graph.nodes) && graph.nodes.length === 0) failures.push("benchmark produced no graph nodes");
  return failures;
}
