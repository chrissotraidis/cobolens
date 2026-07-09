#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const holdMs = Number(process.env.COBOLENS_PACKAGED_HOLD_MS ?? 6000);
const app = await newestMacApp();

if (process.platform !== "darwin") fail("macOS packaged smoke must run on macOS");
if (!app) fail("No packaged Cobolens.app found. Run npm run tauri build first.");

const executable = resolve(app, "Contents", "MacOS", "Cobolens");
const resources = resolve(app, "Contents", "Resources");
const analyzer = resolve(resources, "binaries", "cobolens-analyze");
const sample = resolve(resources, "samples", "mini-bank");
const checks = {
  "packaged app exists": existsSync(app),
  "packaged app executable exists": existsSync(executable),
  "packaged analyzer exists": existsSync(analyzer),
  "packaged sample exists": existsSync(sample),
};

await access(executable, constants.X_OK);
await access(analyzer, constants.X_OK);
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-macos-package-"));
try {
  const graphPath = resolve(tempRoot, "graph.json");
  await runAnalyzer(analyzer, sample, graphPath);
  const graph = JSON.parse(await readFile(graphPath, "utf8"));
  checks["packaged analyzer reads bundled sample"] =
    graph.meta?.parsedFileCount > 0 && graph.nodes?.length > 0 && graph.edges?.length > 0;
  await assertStaysAlive(executable, holdMs);
  checks[`packaged app stays alive for ${holdMs}ms`] = true;
  console.log(JSON.stringify({ ready: Object.values(checks).every(Boolean), app, checks }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function newestMacApp() {
  const root = resolve(repoRoot, "src-tauri", "target", "release", "bundle", "macos");
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const apps = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue;
      const path = resolve(root, entry.name);
      apps.push({ path, mtimeMs: (await stat(path)).mtimeMs });
    }
    apps.sort((left, right) => right.mtimeMs - left.mtimeMs);
    return apps[0]?.path ?? null;
  } catch {
    return null;
  }
}

function runAnalyzer(binary, root, out) {
  return run(binary, [
    "--root", root,
    "--out", out,
    "--format", "auto",
    "--ext", ".cbl,.cob,.cpy,.jcl",
    "--encoding", "utf8",
  ]);
}

function assertStaysAlive(binary, durationMs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(binary, [], { cwd: repoRoot, stdio: "ignore" });
    let settled = false;
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (!settled) rejectRun(new Error(`packaged app exited early with code ${code}`));
    });
    setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolveRun();
    }, durationMs);
  });
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: "ignore" });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited ${code}`));
    });
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
