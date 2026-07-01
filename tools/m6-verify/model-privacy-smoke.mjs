#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-model-privacy-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/model/config.ts",
      "src/model/privacy.ts",
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
  const { DEFAULT_MODEL_SETTINGS, settingsForProvider } = require(compiledModule("config.js"));
  const { assertLocalOllamaUrl, normalizeOllamaBaseUrl } = require(compiledModule("privacy.js"));

  const assertions = [
    ["default provider is local Ollama", DEFAULT_MODEL_SETTINGS.provider === "ollama" && DEFAULT_MODEL_SETTINGS.privacyMode === "local"],
    ["localhost is accepted", doesNotThrow(() => assertLocalOllamaUrl("http://localhost:11434"))],
    ["127.0.0.1 is accepted", doesNotThrow(() => assertLocalOllamaUrl("http://127.0.0.1:11434/api"))],
    ["ipv6 localhost is accepted", doesNotThrow(() => assertLocalOllamaUrl("http://[::1]:11434/api"))],
    ["remote Ollama is rejected", throws(() => assertLocalOllamaUrl("http://192.168.1.10:11434/api"))],
    ["https localhost is rejected", throws(() => assertLocalOllamaUrl("https://localhost:11434/api"))],
    ["ftp localhost is rejected", throws(() => assertLocalOllamaUrl("ftp://localhost:11434/api"))],
    ["https remote is rejected", throws(() => assertLocalOllamaUrl("https://ollama.example.com/api"))],
    ["ollama base url normalizes api suffix", normalizeOllamaBaseUrl("http://127.0.0.1:11434") === "http://127.0.0.1:11434/api"],
    ["ollama provider selects local mode", settingsForProvider(DEFAULT_MODEL_SETTINGS, "ollama").privacyMode === "local"],
    ["cloud providers select cloud mode", settingsForProvider(DEFAULT_MODEL_SETTINGS, "openai").privacyMode === "cloud"],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Model privacy smoke failed: ${failed.join(", ")}`);
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

function doesNotThrow(fn) {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

function throws(fn) {
  return !doesNotThrow(fn);
}
