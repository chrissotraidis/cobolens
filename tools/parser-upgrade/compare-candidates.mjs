#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultRoot = resolve(repoRoot, "fixtures", "m6-bakeoff");
const defaultCandidates = [
  ["rust", "sidecar/cobolens-analyze/target/debug/cobolens-analyze"],
  ["proleap", "sidecar/cobolens-analyze-jvm/bin/cobolens-analyze-jvm"],
  ["mapa", "sidecar/cobolens-analyze-mapa/bin/cobolens-analyze-mapa"],
];

const options = parseArgs(process.argv.slice(2));
await assertReadableDirectory(options.root);

const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-candidate-compare-"));
const results = [];

try {
  for (const candidate of options.candidates) {
    const out = resolve(tempRoot, `${safeName(candidate.name)}.json`);
    const started = performance.now();
    const result = await runAnalyzer(candidate, options.root, out, options.timeoutMs);
    const elapsedMs = Math.round(performance.now() - started);
    if (!result.ok) {
      results.push({
        name: candidate.name,
        ok: false,
        elapsedMs,
        error: result.timedOut
          ? `analyzer timed out after ${options.timeoutMs}ms`
          : `analyzer exited with ${result.code}`,
        stderrTail: result.stderrLines.slice(-8),
      });
      continue;
    }

    const graph = JSON.parse(await readFile(out, "utf8"));
    results.push({
      name: candidate.name,
      ok: validateGraph(graph).length === 0,
      elapsedMs,
      failures: validateGraph(graph),
      summary: summarizeGraph(graph),
      semanticSignals: semanticSignals(graph),
    });
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

const report = {
  root: options.root,
  candidates: results,
};

console.log(JSON.stringify(report, null, 2));

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}

function parseArgs(args) {
  let root = process.env.COBOLENS_BENCHMARK_ROOT ? resolve(process.env.COBOLENS_BENCHMARK_ROOT) : defaultRoot;
  let timeoutMs = Number(process.env.COBOLENS_COMPARE_TIMEOUT_MS ?? 120_000);
  const candidates = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      const value = args[index + 1];
      if (!value) throw new Error("--root requires a path");
      root = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = Number(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--timeout-ms requires a positive number");
      timeoutMs = value;
      index += 1;
      continue;
    }
    if (arg === "--candidate") {
      const value = args[index + 1];
      if (!value) throw new Error("--candidate requires name=/path/to/analyzer");
      const splitAt = value.indexOf("=");
      if (splitAt <= 0) throw new Error("--candidate requires name=/path/to/analyzer");
      candidates.push({ name: value.slice(0, splitAt), command: resolve(value.slice(splitAt + 1)) });
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("COBOLENS_COMPARE_TIMEOUT_MS must be a positive number");
  }

  if (!candidates.length) {
    for (const [name, command] of defaultCandidates) {
      candidates.push({ name, command: resolve(repoRoot, command) });
    }
  }

  return { root, candidates, timeoutMs };
}

async function assertReadableDirectory(path) {
  try {
    await access(path, constants.R_OK);
  } catch {
    console.error(`comparison root is not readable: ${path}`);
    process.exit(2);
  }
}

function runAnalyzer(candidate, root, out, timeoutMs) {
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
    let settled = false;
    const child = spawn(candidate.command, args, {
      cwd: repoRoot,
      detached: process.platform !== "win32",
      env: linuxEnv(),
    });
    const stderrLines = [];
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killAnalyzer(child);
      resolveRun({ ok: false, code: "timeout", timedOut: true, stderrLines });
    }, timeoutMs);
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => {
      stderrLines.push(...chunk.toString("utf8").trim().split(/\r?\n/).filter(Boolean));
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveRun({ ok: false, code: "spawn-error", stderrLines: [error.message] });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveRun({ ok: code === 0, code, stderrLines });
    });
  });
}

function killAnalyzer(child) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") {
      child.kill("SIGKILL");
      return;
    }
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // Best effort cleanup; the timeout report is still the useful signal.
    }
  }
}

function validateGraph(graph) {
  const failures = [];
  if (graph.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (!Array.isArray(graph.nodes)) failures.push("nodes must be an array");
  if (!Array.isArray(graph.edges)) failures.push("edges must be an array");
  if (!graph.meta || !Array.isArray(graph.meta.parseErrors)) failures.push("meta.parseErrors must be an array");
  if (Array.isArray(graph.nodes) && graph.nodes.length === 0) failures.push("graph has no nodes");
  return failures;
}

function summarizeGraph(graph) {
  return {
    files: graph.meta?.fileCount ?? 0,
    parsed: graph.meta?.parsedFileCount ?? 0,
    parseErrors: graph.meta?.parseErrors?.length ?? 0,
    nodes: graph.nodes?.length ?? 0,
    edges: graph.edges?.length ?? 0,
    nodeTypes: [...new Set((graph.nodes ?? []).map((node) => node.type))].sort(),
    edgeTypes: [...new Set((graph.edges ?? []).map((edge) => edge.type))].sort(),
  };
}

function semanticSignals(graph) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  return {
    dataItems: nodes.some((node) => node.type === "data-item"),
    datasets: nodes.some((node) => node.type === "dataset"),
    db2Tables: nodes.some((node) => node.type === "db2-table"),
    cicsLinks: nodes.some((node) => node.type === "cics-command") || edges.some((edge) => /links?/i.test(edge.type)),
    reads: edges.some((edge) => /reads?/i.test(edge.type)),
    writes: edges.some((edge) => /writes?/i.test(edge.type)),
    moves: edges.some((edge) => /moves?-to/i.test(edge.type)),
    jclDdUsage: edges.some((edge) => /uses-dd/i.test(edge.type)),
  };
}

function linuxEnv() {
  const localRoot = `${process.env.HOME ?? ""}/.local`;
  const localJvm = process.env.COBOLENS_JVM_HOME ?? `${localRoot}/codex-jvm`;
  return {
    ...process.env,
    PATH: [
      `${localRoot}/codex-node/node-v24.14.0-linux-x64/bin`,
      `${localJvm}/jdk-21/bin`,
      `${localJvm}/jdk-17/bin`,
      `${localJvm}/maven/bin`,
      `${process.env.HOME ?? ""}/.cargo/bin`,
      "/usr/local/sbin",
      "/usr/local/bin",
      "/usr/sbin",
      "/usr/bin",
      "/sbin",
      "/bin",
    ].join(":"),
  };
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "candidate";
}
