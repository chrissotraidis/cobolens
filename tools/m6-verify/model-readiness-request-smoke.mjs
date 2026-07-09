#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-readiness-request-"));

try {
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/settings/readinessRequest.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--outDir",
      tempRoot,
      "--skipLibCheck",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout);
    process.stderr.write(compile.stderr);
    process.exit(compile.status ?? 1);
  }

  const require = createRequire(resolve(tempRoot, "smoke.cjs"));
  const { createReadinessRequestTracker, modelReadinessKey } = require(resolve(tempRoot, "settings", "readinessRequest.js"));
  const settings = {
    provider: "ollama",
    model: "qwen3.5:2b-nvfp4",
    embeddingModel: "nomic-embed-text",
    baseUrl: "http://127.0.0.1:11434/api",
  };
  const firstKey = modelReadinessKey(settings, false);
  const tracker = createReadinessRequestTracker(firstKey);
  const first = tracker.begin();
  tracker.syncKey(firstKey);
  const unchangedKeyKeepsRequest = tracker.isCurrent(first);
  const second = tracker.begin();
  const newerRequestSupersedesOlder = !tracker.isCurrent(first) && tracker.isCurrent(second);
  const nextKey = modelReadinessKey({ ...settings, model: "another-model" }, false);
  tracker.syncKey(nextKey);

  const checks = {
    "unchanged settings keep the active readiness request": unchangedKeyKeepsRequest,
    "a newer readiness request supersedes an older request": newerRequestSupersedesOlder,
    "changing model settings invalidates an in-flight request": !tracker.isCurrent(second),
    "provider key state participates in the readiness key": modelReadinessKey(settings, true) !== firstKey,
    "embedding model participates in the readiness key":
      modelReadinessKey({ ...settings, embeddingModel: "other-embed" }, false) !== firstKey,
  };

  console.log(JSON.stringify({ checks }, null, 2));
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Model readiness request smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
