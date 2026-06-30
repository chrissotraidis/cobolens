#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sampleRoot = resolve(repoRoot, "samples", "mini-bank");
const analyzer = resolve(
  repoRoot,
  "sidecar",
  "cobolens-analyze",
  "target",
  "debug",
  process.platform === "win32" ? "cobolens-analyze.exe" : "cobolens-analyze",
);
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-sample-smoke-"));

try {
  const out = resolve(tempRoot, "mini-bank.json");
  const result = await runAnalyzer(out);
  if (!result.ok) {
    console.error(`Sample analyzer smoke failed: exited with ${result.code}`);
    for (const line of result.stderrLines.slice(-8)) console.error(line);
    process.exit(1);
  }

  const graph = JSON.parse(await readFile(out, "utf8"));
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const checks = {
    "schema version is stable": graph.schemaVersion === 1,
    "all bundled files parsed": graph.meta?.fileCount === 4 && graph.meta?.parseErrors?.length === 0,
    "programs are present": hasNode(nodes, "program", "ACCTREAD") && hasNode(nodes, "program", "FEEPOST"),
    "copybook is present": hasNode(nodes, "copybook", "CUSTOMER"),
    "jcl wiring is present": hasNode(nodes, "jcl-job", "DAILYACT") && hasEdge(edges, "RUNS"),
    "dataset lineage is present": hasNode(nodes, "dataset", "MINIBANK.ACCOUNTS") && hasEdge(edges, "uses-dd"),
    "data-item flow is present": hasNode(nodes, "data-item", "CUSTOMER-ID") && hasEdge(edges, "moves-to"),
    "db2 signal is present": nodes.some((node) => node.type === "db2-table"),
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Sample codebase smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        files: graph.meta.fileCount,
        parseErrors: graph.meta.parseErrors.length,
        nodes: nodes.length,
        edges: edges.length,
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function runAnalyzer(out) {
  const args = [
    "--root",
    sampleRoot,
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
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => {
      stderrLines.push(...chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean));
    });
    child.on("error", (error) => {
      resolveRun({ ok: false, code: "spawn-error", stderrLines: [error.message] });
    });
    child.on("close", (code) => {
      resolveRun({ ok: code === 0, code, stderrLines });
    });
  });
}

function hasNode(nodes, type, name) {
  return nodes.some((node) => node.type === type && node.name === name);
}

function hasEdge(edges, type) {
  return edges.some((edge) => edge.type.toLocaleLowerCase() === type.toLocaleLowerCase());
}
