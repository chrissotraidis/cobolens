#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const analyzer = resolve(repoRoot, "sidecar", "cobolens-analyze", "target", "debug", process.platform === "win32" ? "cobolens-analyze.exe" : "cobolens-analyze");
const fixtureRoot = resolve(repoRoot, "fixtures", "m6-bakeoff");
const out = resolve(repoRoot, "public", "m6-bakeoff-graph.json");
const sourceOut = resolve(repoRoot, "public", "m6-bakeoff-source");
const sourceBundleOut = resolve(repoRoot, "public", "m6-bakeoff-source.json");

await mkdir(dirname(out), { recursive: true });
await rm(sourceOut, { recursive: true, force: true });
await mkdir(sourceOut, { recursive: true });
await Promise.all(
  ["copybook", "jcl", "src"].map((directory) =>
    cp(resolve(fixtureRoot, directory), resolve(sourceOut, directory), { recursive: true }),
  ),
);
await writeFile(sourceBundleOut, JSON.stringify(await sourceBundle(), null, 2));

const code = await runAnalyzer();
if (code !== 0) {
  process.exit(code);
}

async function sourceBundle() {
  const files = [
    "copybook/CUSTOMER.cpy",
    "copybook/REPORT.cpy",
    "jcl/DAILYLN.jcl",
    "src/LINEAGE.cbl",
  ];
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, await readFile(resolve(fixtureRoot, file), "utf8")])),
  );
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
