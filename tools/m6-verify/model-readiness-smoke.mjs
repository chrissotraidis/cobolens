#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-model-readiness-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/model/config.ts",
      "src/model/privacy.ts",
      "src/model/readiness.ts",
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
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout);
    process.stderr.write(compile.stderr);
    process.exit(compile.status ?? 1);
  }

  const require = createRequire(resolve(tempRoot, "smoke.cjs"));
  const { DEFAULT_MODEL_SETTINGS } = require(compiledModule("config.js"));
  const { checkOllamaReadiness } = require(compiledModule("readiness.js"));

  const fastRequests = [];
  global.fetch = async (url, init = {}) => {
    fastRequests.push({ url: String(url), method: init.method ?? "GET" });
    return jsonResponse({ models: [{ name: "llama3.2:latest" }] });
  };
  const fastMessage = await checkOllamaReadiness(DEFAULT_MODEL_SETTINGS, { tagsTimeoutMs: 1000 });

  const fullRequests = [];
  global.fetch = async (url, init = {}) => {
    fullRequests.push({ url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url).endsWith("/tags")) return jsonResponse({ models: [{ name: "llama3.2:latest" }] });
    if (String(url).endsWith("/generate")) return jsonResponse({ response: "Local inference is ready." });
    return new Response("not found", { status: 404 });
  };
  const fullMessage = await checkOllamaReadiness(DEFAULT_MODEL_SETTINGS, {
    verifyGeneration: true,
    tagsTimeoutMs: 1000,
    generationTimeoutMs: 1000,
  });

  global.fetch = async () => jsonResponse({ models: [{ name: "other-model:latest" }] });
  const missingModel = await rejects(() => checkOllamaReadiness(DEFAULT_MODEL_SETTINGS, { tagsTimeoutMs: 1000 }));

  global.fetch = async (url) => {
    if (String(url).endsWith("/tags")) return jsonResponse({ models: [{ name: "llama3.2:latest" }] });
    return jsonResponse({ response: "" });
  };
  const emptyGeneration = await rejects(() =>
    checkOllamaReadiness(DEFAULT_MODEL_SETTINGS, {
      verifyGeneration: true,
      tagsTimeoutMs: 1000,
      generationTimeoutMs: 1000,
    }),
  );

  const assertions = [
    ["fast readiness checks tags only", fastRequests.length === 1 && fastRequests[0].url.endsWith("/api/tags")],
    ["fast readiness returns installed model", fastMessage.includes("llama3.2")],
    ["full readiness checks generation", fullRequests.some((request) => request.url.endsWith("/api/generate"))],
    ["full readiness posts configured model", fullRequests.some((request) => request.body?.model === "llama3.2")],
    ["full readiness reports generation text", fullMessage.includes("test generation returned text")],
    ["missing configured model rejects", missingModel.includes("is not installed")],
    ["empty generation rejects", emptyGeneration.includes("returned no text")],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Model readiness smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(JSON.stringify({ checks: Object.fromEntries(assertions) }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function compiledModule(filename) {
  const nested = resolve(tempRoot, "model", filename);
  return existsSync(nested) ? nested : resolve(tempRoot, filename);
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function rejects(fn) {
  try {
    await fn();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
