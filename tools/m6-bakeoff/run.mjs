#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureRoot = resolve(repoRoot, "fixtures", "m6-bakeoff");
const defaultAnalyzer = resolve(repoRoot, "sidecar", "cobolens-analyze", "target", "debug", process.platform === "win32" ? "cobolens-analyze.exe" : "cobolens-analyze");

const options = parseArgs(process.argv.slice(2));
const candidates = options.candidates;
if (!candidates.length) {
  candidates.push({ name: "current-rust", command: defaultAnalyzer });
}

const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-m6-bakeoff-"));
let exitCode = 0;

try {
  for (const candidate of candidates) {
    const out = resolve(tempRoot, `${safeName(candidate.name)}.json`);
    const result = await runAnalyzer(candidate, out);
    if (!result.ok) {
      exitCode = 1;
      printFailure(candidate.name, [`analyzer exited with ${result.code}`, ...result.stderrLines.slice(-8)]);
      continue;
    }

    const graph = JSON.parse(await readFile(out, "utf8"));
    const failures = validateGraph(graph, options);
    if (failures.length) {
      exitCode = 1;
      printFailure(candidate.name, failures);
      continue;
    }

    console.log(`PASS ${candidate.name}`);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

process.exitCode = exitCode;

function parseArgs(args) {
  const candidates = [];
  let contractOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--contract-only") {
      contractOnly = true;
      continue;
    }

    if (args[index] !== "--candidate") throw new Error(`unknown argument: ${args[index]}`);
    const value = args[index + 1];
    if (!value) throw new Error("--candidate requires name=/path/to/analyzer");
    const splitAt = value.indexOf("=");
    if (splitAt <= 0) throw new Error("--candidate requires name=/path/to/analyzer");
    candidates.push({
      name: value.slice(0, splitAt),
      command: resolve(value.slice(splitAt + 1)),
    });
    index += 1;
  }
  return { candidates, contractOnly };
}

function runAnalyzer(candidate, out) {
  const args = [
    "--root",
    fixtureRoot,
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
    const child = spawn(candidate.command, args, { cwd: repoRoot });
    const stderrLines = [];
    child.stderr.on("data", (chunk) => {
      stderrLines.push(...chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean));
    });
    child.stdout.on("data", (chunk) => {
      for (const line of chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean)) {
        console.log(`${candidate.name}: ${line}`);
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

function validateGraph(graph, options) {
  const failures = [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  if (graph.schemaVersion !== 1) failures.push("schemaVersion must remain 1 for the current app contract");
  if (!nodes.some((node) => node.type === "program" && node.name === "LINEAGE")) failures.push("missing LINEAGE program node");
  if (!nodes.some((node) => node.type === "copybook" && node.name === "CUSTOMER")) failures.push("missing CUSTOMER copybook node");
  if (!nodes.some((node) => node.type === "jcl-job" && node.name === "DAILYLN")) failures.push("missing DAILYLN JCL job node");
  if (options.contractOnly) return failures;

  const requiredSemanticSignals = [
    { label: "data-item nodes", ok: nodes.some((node) => node.type === "data-item") },
    { label: "dataset nodes", ok: nodes.some((node) => node.type === "dataset") },
    { label: "DB2 table node", ok: nodes.some((node) => node.type === "db2-table" && /CUSTOMER_TABLE/i.test(node.name)) },
    { label: "CICS command node or link edge", ok: nodes.some((node) => node.type === "cics-command") || edges.some((edge) => /link/i.test(edge.type)) },
    { label: "read lineage edge", ok: edges.some((edge) => /reads?/i.test(edge.type)) },
    { label: "write lineage edge", ok: edges.some((edge) => /writes?/i.test(edge.type)) },
    { label: "field move edge", ok: edges.some((edge) => /moves?-to/i.test(edge.type)) },
    { label: "DD dataset usage edge", ok: edges.some((edge) => /uses-dd/i.test(edge.type)) },
    {
      label: "COBOL logical file to JCL DD assignment",
      ok: hasNamedEdge(graph, "CUSTOMER-FILE", "assigned-to", "CUSTIN"),
    },
  ];

  for (const signal of requiredSemanticSignals) {
    if (!signal.ok) failures.push(`missing semantic signal: ${signal.label}`);
  }

  return failures;
}

function hasNamedEdge(graph, fromName, type, toName) {
  const nodesById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  return (graph.edges ?? []).some((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    return from?.name === fromName && edge.type.toLocaleLowerCase() === type.toLocaleLowerCase() && to?.name === toName;
  });
}

function printFailure(name, failures) {
  console.log(`FAIL ${name}`);
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "candidate";
}
