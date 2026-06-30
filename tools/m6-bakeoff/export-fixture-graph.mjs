#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const analyzer = resolve(repoRoot, "sidecar", "cobolens-analyze", "target", "debug", process.platform === "win32" ? "cobolens-analyze.exe" : "cobolens-analyze");
const fixtureRoot = resolve(repoRoot, "fixtures", "m6-bakeoff");
const out = resolve(repoRoot, "public", "m6-bakeoff-graph.json");

await mkdir(dirname(out), { recursive: true });

const code = await runAnalyzer();
if (code !== 0) {
  process.exit(code);
}

console.log(`wrote ${out}`);

function runAnalyzer() {
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
    const child = spawn(analyzer, args, { cwd: repoRoot, stdio: "inherit" });
    child.on("error", (error) => {
      console.error(error.message);
      resolveRun(1);
    });
    child.on("close", (code) => resolveRun(code ?? 1));
  });
}
