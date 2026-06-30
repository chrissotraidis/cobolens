#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const checks = [
  {
    name: "strict bake-off fixture",
    command: process.execPath,
    args: ["tools/m6-bakeoff/run.mjs"],
  },
  {
    name: "benchmark helper on M6 fixture",
    command: process.execPath,
    args: ["tools/benchmark-validation/run.mjs", "--root", "fixtures/m6-bakeoff"],
  },
  {
    name: "frontend build",
    command: npmCommand(),
    args: ["run", "build"],
  },
  {
    name: "export documentation smoke",
    command: process.execPath,
    args: ["tools/m6-verify/export-docs-smoke.mjs"],
  },
  {
    name: "graph ask smoke",
    command: process.execPath,
    args: ["tools/m6-verify/graph-ask-smoke.mjs"],
  },
  {
    name: "Rust sidecar check",
    command: "cargo",
    args: ["check"],
    cwd: resolve(repoRoot, "sidecar", "cobolens-analyze"),
  },
  {
    name: "Tauri shell tests",
    command: "cargo",
    args: ["test"],
    cwd: resolve(repoRoot, "src-tauri"),
  },
];

for (const check of checks) {
  await runCheck(check);
}

await runCheck(
  {
    name: "mapa analyzer candidate",
    command: process.execPath,
    args: ["tools/m6-bakeoff/run.mjs", "--candidate", "mapa=sidecar/cobolens-analyze-mapa/bin/cobolens-analyze-mapa"],
  },
  { advisory: true },
);

await runCheck(
  {
    name: "parser candidate comparison",
    command: process.execPath,
    args: ["tools/parser-upgrade/compare-candidates.mjs"],
  },
  { advisory: true },
);

const readiness = await runCheck(
  {
    name: "parser upgrade readiness",
    command: process.execPath,
    args: ["tools/parser-upgrade/readiness.mjs"],
  },
  { advisory: true },
);

if (readiness !== 0) {
  console.log("ADVISORY parser upgrade is not ready in this environment; install java, javac, and mvn before the ProLeap/mapa spike.");
}

async function runCheck(check, options = {}) {
  console.log(`\n==> ${check.name}`);
  const code = await spawnCheck(check);
  if (code !== 0 && !options.advisory) {
    process.exit(code);
  }
  if (code === 0) {
    console.log(`PASS ${check.name}`);
  } else {
    console.log(`ADVISORY ${check.name} exited ${code}`);
  }
  return code;
}

function spawnCheck(check) {
  return new Promise((resolveRun) => {
    const child = spawn(check.command, check.args, {
      cwd: check.cwd ?? repoRoot,
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

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
