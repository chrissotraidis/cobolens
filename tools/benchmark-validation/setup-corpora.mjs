#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const configPath = resolve(repoRoot, "tools", "benchmark-validation", "corpora.json");
const cacheRoot = resolve(repoRoot, ".cache", "benchmarks");
const corpora = JSON.parse(await readFile(configPath, "utf8"));

await mkdir(cacheRoot, { recursive: true });
for (const corpus of corpora) {
  const destination = resolve(cacheRoot, corpus.directory);
  const present = await git(["-C", destination, "rev-parse", "--is-inside-work-tree"], true);
  if (!present.ok) {
    await git(["clone", "--filter=blob:none", corpus.repository, destination]);
  }
  await git(["-C", destination, "fetch", "--depth", "1", "origin", corpus.commit]);
  await git(["-C", destination, "checkout", "--detach", "FETCH_HEAD"]);
  console.log(`${corpus.name}: ${corpus.commit}`);
}

function git(args, quiet = false) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("git", args, {
      cwd: repoRoot,
      stdio: quiet ? "ignore" : "inherit",
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      const result = { ok: code === 0, code };
      if (code === 0 || quiet) resolveRun(result);
      else rejectRun(new Error(`git ${args.join(" ")} exited ${code}`));
    });
  });
}
