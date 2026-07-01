#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const benchmarkRoot = resolve(repoRoot, ".cache", "benchmarks", "COBOL-Legacy-Benchmark-Suite");
const appImageRoot = resolve(repoRoot, "src-tauri", "target", "release", "bundle", "appimage");
const defaultLocalModel = process.env.COBOLENS_READINESS_MODEL ?? "llama3.2:1b";

const results = [];

await required("V1 readiness report contract", process.execPath, ["tools/v1-readiness/report-contract-smoke.mjs"]);
await required("M6 verification suite", process.execPath, ["tools/m6-verify/run.mjs"]);

if (existsSync(benchmarkRoot)) {
  await optional("local benchmark suite", process.execPath, [
    "tools/benchmark-validation/run.mjs",
    "--root",
    benchmarkRoot,
    "--report",
    ".cache/benchmark-reports/legacy-benchmark-report.json",
    "--graph",
    ".cache/benchmark-reports/current-graph.json",
  ]);
} else {
  skipped("local benchmark suite", "missing .cache/benchmarks/COBOL-Legacy-Benchmark-Suite");
}

if (ollamaCommandAvailable()) {
  await optional("local Ollama readiness", process.execPath, ["tools/local-model/ollama-smoke.mjs", defaultLocalModel]);
  if (existsSync(resolve(repoRoot, "public", "m6-bakeoff-graph.json"))) {
    await optional("local Ollama grounded Summary smoke", process.execPath, ["tools/local-model/ollama-summary-smoke.mjs", defaultLocalModel]);
    await optional("local Ollama grounded Ask smoke", process.execPath, ["tools/local-model/ollama-ask-smoke.mjs", defaultLocalModel]);
  } else {
    skipped("local Ollama grounded Summary smoke", "missing public/m6-bakeoff-graph.json; run npm run m6:fixture-graph");
    skipped("local Ollama grounded Ask smoke", "missing public/m6-bakeoff-graph.json; run npm run m6:fixture-graph");
  }
} else {
  skipped("local Ollama readiness", "ollama command not found");
  skipped("local Ollama grounded Summary smoke", "ollama command not found");
  skipped("local Ollama grounded Ask smoke", "ollama command not found");
}

if (await hasPackagedAppImage()) {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    await optional("packaged Linux GUI smoke", process.execPath, ["tools/desktop/packaged-gui-smoke.mjs"]);
  } else {
    skipped("packaged Linux GUI smoke", "missing DISPLAY or WAYLAND_DISPLAY");
  }
} else {
  skipped("packaged Linux GUI smoke", "missing AppImage bundle; run npm run tauri build");
}

const failedRequired = results.filter((result) => result.required && result.status === "failed");
const failedOptional = results.filter((result) => !result.required && result.status === "failed");
const skippedOptional = results.filter((result) => !result.required && result.status === "skipped");
const requiredPassed = failedRequired.length === 0;
const optionalEvidenceClean = failedOptional.length === 0;
const optionalEvidenceComplete = skippedOptional.length === 0;
const report = {
  ready: requiredPassed && optionalEvidenceClean && optionalEvidenceComplete,
  requiredPassed,
  optionalEvidenceClean,
  optionalEvidenceComplete,
  optionalFailed: failedOptional.length,
  optionalSkipped: skippedOptional.length,
  results,
};

console.log("\n==> v1 readiness report");
console.log(JSON.stringify(report, null, 2));
process.exit(report.requiredPassed ? 0 : 1);

async function required(name, command, args) {
  return runGate({ name, command, args, required: true });
}

async function optional(name, command, args) {
  return runGate({ name, command, args, required: false });
}

async function runGate({ name, command, args, required }) {
  console.log(`\n==> ${required ? "required" : "optional"}: ${name}`);
  const startedAt = Date.now();
  const code = await spawnGate(command, args);
  const result = {
    name,
    required,
    status: code === 0 ? "passed" : "failed",
    code,
    elapsedMs: Date.now() - startedAt,
  };
  results.push(result);
  if (code !== 0 && required) {
    console.log(`FAIL required gate: ${name}`);
    console.log("\n==> v1 readiness report");
    console.log(JSON.stringify({ ready: false, requiredPassed: false, results }, null, 2));
    process.exit(code || 1);
  }
  console.log(`${code === 0 ? "PASS" : "ADVISORY FAIL"} ${name}`);
  return result;
}

function skipped(name, reason) {
  results.push({ name, required: false, status: "skipped", reason });
  console.log(`\n==> optional: ${name}`);
  console.log(`SKIP ${reason}`);
}

function spawnGate(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      console.error(error.message);
      resolveRun(1);
    });
    child.on("close", (code) => resolveRun(code ?? 1));
  });
}

function ollamaCommandAvailable() {
  return spawnSync("ollama", ["--version"], { encoding: "utf8" }).status === 0;
}

async function hasPackagedAppImage() {
  try {
    const entries = await readdir(appImageRoot, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith(".AppImage"));
  } catch {
    return false;
  }
}
