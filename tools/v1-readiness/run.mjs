#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { selectReadinessModel } from "../local-model/model-selection.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const benchmarkRoot = resolve(repoRoot, ".cache", "benchmarks", "COBOL-Legacy-Benchmark-Suite");
const appImageRoot = resolve(repoRoot, "src-tauri", "target", "release", "bundle", "appimage");
const macAppRoot = resolve(repoRoot, "src-tauri", "target", "release", "bundle", "macos");
const results = [];

await required("V1 readiness report contract", process.execPath, ["tools/v1-readiness/report-contract-smoke.mjs"]);
await required("V1 PRD coverage audit", process.execPath, ["tools/v1-readiness/prd-coverage-smoke.mjs"]);
await required("V1 local model selection", process.execPath, ["tools/v1-readiness/model-selection-smoke.mjs"]);
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
  const localModel = selectReadinessModel({
    explicitModel: process.env.COBOLENS_READINESS_MODEL,
    listOutput: ollamaListOutput(),
  });
  console.log(`\nUsing local readiness model: ${localModel}`);
  await optional("local Ollama readiness", process.execPath, ["tools/local-model/ollama-smoke.mjs", localModel]);
  if (existsSync(resolve(repoRoot, "public", "m6-bakeoff-graph.json"))) {
    await optional("local Ollama grounded Summary smoke", process.execPath, ["tools/local-model/ollama-summary-smoke.mjs", localModel]);
    await optional("local Ollama grounded Ask smoke", process.execPath, ["tools/local-model/ollama-ask-smoke.mjs", localModel]);
    await optional("local Ollama source semantic smoke", process.execPath, ["tools/local-model/ollama-semantic-smoke.mjs"]);
  } else {
    skipped("local Ollama grounded Summary smoke", "missing public/m6-bakeoff-graph.json; run npm run m6:fixture-graph");
    skipped("local Ollama grounded Ask smoke", "missing public/m6-bakeoff-graph.json; run npm run m6:fixture-graph");
    skipped("local Ollama source semantic smoke", "missing public/m6-bakeoff-graph.json; run npm run m6:fixture-graph");
  }
} else {
  skipped("local Ollama readiness", "ollama command not found");
  skipped("local Ollama grounded Summary smoke", "ollama command not found");
  skipped("local Ollama grounded Ask smoke", "ollama command not found");
  skipped("local Ollama source semantic smoke", "ollama command not found");
}

if (process.platform === "darwin") {
  if (await hasPackagedMacApp()) {
    await optional("packaged macOS GUI smoke", process.execPath, ["tools/desktop/macos-packaged-smoke.mjs"]);
  } else {
    skipped("packaged macOS GUI smoke", "missing Cobolens.app bundle; run npm run tauri -- build --bundles app --no-sign");
  }
} else if (process.platform === "linux" && await hasPackagedAppImage()) {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    await optional("packaged Linux GUI smoke", process.execPath, ["tools/desktop/packaged-gui-smoke.mjs"]);
  } else {
    skipped("packaged Linux GUI smoke", "missing DISPLAY or WAYLAND_DISPLAY");
  }
} else if (process.platform === "linux") {
  skipped("packaged Linux GUI smoke", "missing AppImage bundle; run npm run tauri build");
} else {
  skipped("packaged Windows GUI smoke", "no Windows packaged GUI smoke is implemented");
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

function ollamaListOutput() {
  const result = spawnSync("ollama", ["list"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : "";
}

async function hasPackagedAppImage() {
  try {
    const entries = await readdir(appImageRoot, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith(".AppImage"));
  } catch {
    return false;
  }
}

async function hasPackagedMacApp() {
  try {
    const entries = await readdir(macAppRoot, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  } catch {
    return false;
  }
}
