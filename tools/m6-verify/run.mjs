#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const checks = [
  {
    name: "demo asset policy smoke",
    command: process.execPath,
    args: ["tools/m6-verify/demo-assets-smoke.mjs"],
  },
  {
    name: "citation focus smoke",
    command: process.execPath,
    args: ["tools/m6-verify/citation-focus-smoke.mjs"],
  },
  {
    name: "graph selectors smoke",
    command: process.execPath,
    args: ["tools/m6-verify/graph-selectors-smoke.mjs"],
  },
  {
    name: "summary planning smoke",
    command: process.execPath,
    args: ["tools/m6-verify/summary-planning-smoke.mjs"],
  },
  {
    name: "summary graph smoke",
    command: process.execPath,
    args: ["tools/m6-verify/summary-graph-smoke.mjs"],
  },
  {
    name: "ask focus smoke",
    command: process.execPath,
    args: ["tools/m6-verify/ask-focus-smoke.mjs"],
  },
  {
    name: "model runtime smoke",
    command: process.execPath,
    args: ["tools/m6-verify/model-runtime-smoke.mjs"],
  },
  {
    name: "inspector progress smoke",
    command: process.execPath,
    args: ["tools/m6-verify/inspector-progress-smoke.mjs"],
  },
  {
    name: "chat history smoke",
    command: process.execPath,
    args: ["tools/m6-verify/chat-history-smoke.mjs"],
  },
  {
    name: "layout state smoke",
    command: process.execPath,
    args: ["tools/m6-verify/layout-state-smoke.mjs"],
  },
  {
    name: "source line smoke",
    command: process.execPath,
    args: ["tools/m6-verify/source-line-smoke.mjs"],
  },
  {
    name: "source reader smoke",
    command: process.execPath,
    args: ["tools/m6-verify/source-reader-smoke.mjs"],
  },
  {
    name: "app settings smoke",
    command: process.execPath,
    args: ["tools/m6-verify/app-settings-smoke.mjs"],
  },
  {
    name: "browser launch smoke",
    command: process.execPath,
    args: ["tools/m6-verify/browser-launch-smoke.mjs"],
  },
  {
    name: "verification contract smoke",
    command: process.execPath,
    args: ["tools/m6-verify/verification-contract-smoke.mjs"],
  },
  {
    name: "Rust sidecar formatting",
    command: "cargo",
    args: ["fmt", "--manifest-path", "sidecar/cobolens-analyze/Cargo.toml", "--all", "--", "--check"],
  },
  {
    name: "Rust shell formatting",
    command: "cargo",
    args: ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--all", "--", "--check"],
  },
  {
    name: "Rust sidecar lint",
    command: "cargo",
    args: ["clippy", "--manifest-path", "sidecar/cobolens-analyze/Cargo.toml", "--all-targets", "--", "-D", "warnings"],
  },
  {
    name: "Rust shell lint",
    command: "cargo",
    args: ["clippy", "--manifest-path", "src-tauri/Cargo.toml", "--all-targets", "--", "-D", "warnings"],
  },
  {
    name: "Rust analyzer debug build",
    command: "cargo",
    args: ["build", "--manifest-path", "sidecar/cobolens-analyze/Cargo.toml"],
    missingCommandHelp: "Install the Rust toolchain from https://rustup.rs/, then rerun npm run m6:verify.",
  },
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
    name: "bundled sample codebase smoke",
    command: process.execPath,
    args: ["tools/m6-verify/sample-codebase-smoke.mjs"],
  },
  {
    name: "frontend build",
    command: npmCommand(),
    args: ["run", "build"],
  },
  {
    name: "rendered UI smoke",
    command: process.execPath,
    args: ["tools/m6-verify/rendered-ui-smoke.mjs"],
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
    name: "semantic retrieval smoke",
    command: process.execPath,
    args: ["tools/m6-verify/semantic-retrieval-smoke.mjs"],
  },
  {
    name: "UI contract smoke",
    command: process.execPath,
    args: ["tools/m6-verify/ui-contract-smoke.mjs"],
  },
  {
    name: "accessibility smoke",
    command: process.execPath,
    args: ["tools/m6-verify/accessibility-smoke.mjs"],
  },
  {
    name: "packaging contract smoke",
    command: process.execPath,
    args: ["tools/m6-verify/packaging-contract-smoke.mjs"],
  },
  {
    name: "model privacy smoke",
    command: process.execPath,
    args: ["tools/m6-verify/model-privacy-smoke.mjs"],
  },
  {
    name: "embedding privacy smoke",
    command: process.execPath,
    args: ["tools/m6-verify/embedding-privacy-smoke.mjs"],
  },
  {
    name: "model readiness smoke",
    command: process.execPath,
    args: ["tools/m6-verify/model-readiness-smoke.mjs"],
  },
  {
    name: "model readiness request smoke",
    command: process.execPath,
    args: ["tools/m6-verify/model-readiness-request-smoke.mjs"],
  },
  {
    name: "model prompt smoke",
    command: process.execPath,
    args: ["tools/m6-verify/model-prompt-smoke.mjs"],
  },
  {
    name: "model chat contract smoke",
    command: process.execPath,
    args: ["tools/m6-verify/model-chat-contract-smoke.mjs"],
  },
  {
    name: "model answer guard smoke",
    command: process.execPath,
    args: ["tools/m6-verify/model-answer-guard-smoke.mjs"],
  },
  {
    name: "summary prompt smoke",
    command: process.execPath,
    args: ["tools/m6-verify/summary-prompt-smoke.mjs"],
  },
  {
    name: "summary guard smoke",
    command: process.execPath,
    args: ["tools/m6-verify/summary-guard-smoke.mjs"],
  },
  {
    name: "Rust sidecar tests",
    command: "cargo",
    args: ["test"],
    cwd: resolve(repoRoot, "sidecar", "cobolens-analyze"),
    missingCommandHelp: "Install the Rust toolchain from https://rustup.rs/, then rerun npm run m6:verify.",
  },
  {
    name: "Tauri shell tests",
    command: "cargo",
    args: ["test"],
    cwd: resolve(repoRoot, "src-tauri"),
    missingCommandHelp: "Install the Rust toolchain from https://rustup.rs/, then rerun npm run m6:verify.",
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
      console.error(formatSpawnError(check, error));
      resolveRun(1);
    });
    child.on("close", (code) => resolveRun(code ?? 1));
  });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function formatSpawnError(check, error) {
  const lines = [`Unable to start ${check.name}: ${error.message}`];
  if (error.code === "ENOENT") {
    lines.push(`Missing required command: ${check.command}`);
  }
  if (check.missingCommandHelp) {
    lines.push(check.missingCommandHelp);
  }
  return lines.join("\n");
}
