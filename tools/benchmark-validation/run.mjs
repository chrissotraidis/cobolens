#!/usr/bin/env node
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const options = parseArgs(process.argv.slice(2));
const root = options.root ?? process.env.COBOLENS_BENCHMARK_ROOT;

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
  const report = summarizeGraph(graph, root);
  const failures = validateGraph(graph, report);
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  if (options.report) {
    await mkdir(dirname(options.report), { recursive: true });
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(options.report ? { ...report, report: options.report } : report, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== "--root" && arg !== "--report") throw new Error(`unknown argument: ${arg}`);
    const value = args[index + 1];
    if (!value) throw new Error(`${arg} requires a path`);
    parsed[arg.slice(2)] = resolve(value);
    index += 1;
  }
  return parsed;
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

function validateGraph(graph, report) {
  const failures = [];
  if (graph.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (!Array.isArray(graph.nodes)) failures.push("nodes must be an array");
  if (!Array.isArray(graph.edges)) failures.push("edges must be an array");
  if (!graph.meta || !Array.isArray(graph.meta.parseErrors)) failures.push("meta.parseErrors must be an array");
  if (Array.isArray(graph.nodes) && graph.nodes.length === 0) failures.push("benchmark produced no graph nodes");
  if (!Number.isInteger(graph.meta?.fileCount) || graph.meta.fileCount <= 0) failures.push("meta.fileCount must be positive");
  if (!Number.isInteger(graph.meta?.parsedFileCount) || graph.meta.parsedFileCount <= 0) {
    failures.push("meta.parsedFileCount must be positive");
  }

  for (const parseError of graph.meta?.parseErrors ?? []) {
    if (!parseError.file || !parseError.reason) {
      failures.push("parse errors must list both file and reason");
      break;
    }
  }

  if (Array.isArray(graph.nodes) && Array.isArray(graph.edges)) {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.from)) failures.push(`edge references missing from node: ${edge.from}`);
      if (!nodeIds.has(edge.to)) failures.push(`edge references missing to node: ${edge.to}`);
      if (edge.site && (!edge.site.file || !Number.isInteger(edge.site.line))) {
        failures.push(`edge has malformed citation site: ${edge.from} -> ${edge.to}`);
      }
    }
  }

  const requiredSignals = [
    "programs",
    "copybooks",
    "dataItems",
    "datasets",
    "jclJobs",
    "jclSteps",
    "jclDd",
    "db2Tables",
    "calls",
    "copies",
    "runs",
    "declaresDd",
    "reads",
    "writes",
    "moves",
    "queries",
    "usesDd",
  ];
  for (const signal of requiredSignals) {
    if (!report.semanticSignals[signal]) failures.push(`missing benchmark semantic signal: ${signal}`);
  }

  return failures;
}

function summarizeGraph(graph, root) {
  const nodeTypes = countBy(graph.nodes, (node) => node.type);
  const edgeTypes = countBy(graph.edges, (edge) => edge.type);
  const parseErrorsByReason = countBy(graph.meta.parseErrors, (parseError) => parseError.reason);
  const citedEdges = graph.edges.filter((edge) => edge.site?.file && Number.isInteger(edge.site?.line)).length;
  const semanticSignals = {
    programs: Boolean(nodeTypes.program),
    copybooks: Boolean(nodeTypes.copybook),
    dataItems: Boolean(nodeTypes["data-item"]),
    datasets: Boolean(nodeTypes.dataset),
    jclJobs: Boolean(nodeTypes["jcl-job"]),
    jclSteps: Boolean(nodeTypes["jcl-step"]),
    jclDd: Boolean(nodeTypes["jcl-dd"]),
    db2Tables: Boolean(nodeTypes["db2-table"]),
    cicsCommands: Boolean(nodeTypes["cics-command"]),
    calls: Boolean(edgeTypes.CALLS),
    performs: Boolean(edgeTypes.PERFORMS),
    copies: Boolean(edgeTypes.COPIES),
    runs: Boolean(edgeTypes.RUNS),
    declaresDd: Boolean(edgeTypes["DECLARES-DD"]),
    reads: Boolean(edgeTypes.reads),
    writes: Boolean(edgeTypes.writes),
    moves: Boolean(edgeTypes["moves-to"]),
    queries: Boolean(edgeTypes.queries),
    usesDd: Boolean(edgeTypes["uses-dd"]),
  };

  return {
    root,
    files: graph.meta.fileCount,
    parsed: graph.meta.parsedFileCount,
    parseErrors: graph.meta.parseErrors.length,
    parseCoverage: roundRatio(graph.meta.parsedFileCount, graph.meta.fileCount),
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    nodeTypes,
    edgeTypes,
    citedEdges,
    citedEdgeCoverage: roundRatio(citedEdges, graph.edges.length),
    externalNodes: graph.nodes.filter((node) => node.external).length,
    parseErrorsByReason,
    parseErrorSamples: graph.meta.parseErrors.slice(0, 20),
    semanticSignals,
  };
}

function countBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = keyFor(item) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function roundRatio(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 1000;
}
