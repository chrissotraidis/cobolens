#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const toolRoot = resolve(repoRoot, "tools", "benchmark-validation");
const cacheRoot = resolve(repoRoot, ".cache", "benchmarks");
const reportRoot = resolve(repoRoot, ".cache", "benchmark-reports");
const corpora = JSON.parse(await readFile(resolve(toolRoot, "corpora.json"), "utf8"));
const results = [];

await mkdir(reportRoot, { recursive: true });
for (const corpus of corpora) {
  const root = resolve(cacheRoot, corpus.directory);
  const revision = await capture("git", ["-C", root, "rev-parse", "HEAD"]);
  if (revision !== corpus.commit) {
    throw new Error(`${corpus.name} is at ${revision}; expected ${corpus.commit}. Run npm run benchmark:corpora:setup.`);
  }

  const slug = corpus.directory.toLowerCase();
  const report = resolve(reportRoot, `${slug}.json`);
  await run(process.execPath, [
    resolve(toolRoot, "run.mjs"),
    "--root", root,
    "--expect", resolve(toolRoot, corpus.expect),
    "--report", report,
  ]);
  const corpusReport = JSON.parse(await readFile(report, "utf8"));
  console.log(
    `${corpus.name}: ${corpusReport.parsed}/${corpusReport.files} files, ` +
    `${corpusReport.nodes} nodes, ${corpusReport.edges} cited edges, ${corpusReport.durationMs}ms`,
  );
  results.push({
    name: corpus.name,
    repository: corpus.repository,
    commit: revision,
    report: corpusReport,
  });
}

const aggregate = resolve(reportRoot, "corpus-suite.json");
await writeFile(aggregate, `${JSON.stringify({ corpora: results }, null, 2)}\n`);
console.log(`Corpus benchmark passed: ${results.length} repositories. Report: ${aggregate}`);

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"] });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited ${code}`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: repoRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout.trim());
      else rejectRun(new Error(stderr.trim() || `${command} exited ${code}`));
    });
  });
}
