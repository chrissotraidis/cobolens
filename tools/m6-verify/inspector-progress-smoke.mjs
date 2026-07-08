#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, symlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-inspector-progress-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  symlinkSync(
    resolve(repoRoot, "node_modules"),
    resolve(tempRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );

  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/inspector/aiProgress.ts",
      "src/inspector/summaryProgress.ts",
      "src/model/config.ts",
      "src/model/readiness.ts",
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
  const aiProgressPath = existsSync(resolve(tempRoot, "inspector", "aiProgress.js"))
    ? resolve(tempRoot, "inspector", "aiProgress.js")
    : resolve(tempRoot, "aiProgress.js");
  const summaryProgressPath = existsSync(resolve(tempRoot, "inspector", "summaryProgress.js"))
    ? resolve(tempRoot, "inspector", "summaryProgress.js")
    : resolve(tempRoot, "summaryProgress.js");
  const { aiProgressDetail } = require(aiProgressPath);
  const { bulkSummaryProgressLabel } = require(summaryProgressPath);

  const ollamaSettings = {
    provider: "ollama",
    model: "llama3.2",
    embeddingModel: "nomic-embed-text",
    baseUrl: "http://127.0.0.1:11434",
    privacyMode: "local",
    rosettaLanguage: "python",
  };
  const openaiSettings = {
    provider: "openai",
    model: "gpt-5-mini",
    embeddingModel: "",
    baseUrl: "",
    privacyMode: "cloud",
    rosettaLanguage: "python",
  };

  const assertions = [
    [
      "streaming progress names draft text and final citation checking",
      aiProgressDetail(ollamaSettings, 1, true) ===
        "Streaming draft text. Final citations are checked before the answer is trusted.",
    ],
    [
      "local Ollama progress starts with local privacy copy",
      aiProgressDetail(ollamaSettings, 0) === "Using local Ollama; no code leaves this machine.",
    ],
    [
      "local Ollama progress explains first-token wait after a short delay",
      aiProgressDetail(ollamaSettings, 8) === "Waiting for first local model text; code stays on this machine.",
    ],
    [
      "local Ollama progress keeps Stop and graph-answer fallback visible after a longer wait",
      aiProgressDetail(ollamaSettings, 20).includes("you can stop the request without losing the graph answer path"),
    ],
    [
      "local Ollama progress suggests the small model after an extended wait",
      aiProgressDetail(ollamaSettings, 70).includes("try llama3.2:1b or a smaller model"),
    ],
    [
      "cloud progress names provider and retrieved-slice boundary",
      aiProgressDetail(openaiSettings, 0) === "Using OpenAI with cited graph context." &&
        aiProgressDetail(openaiSettings, 8) === "Waiting on OpenAI; only the retrieved code slice was sent.",
    ],
    [
      "bulk summary progress labels graph fallbacks with singular and plural copy",
      bulkSummaryProgressLabel(0, 4, 0) === "0/4" &&
        bulkSummaryProgressLabel(2, 4, 1) === "2/4 (1 graph fallback)" &&
        bulkSummaryProgressLabel(4, 4, 2) === "4/4 (2 graph fallbacks)",
    ],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Inspector progress smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        localExtendedWait: aiProgressDetail(ollamaSettings, 70),
        fallbackLabel: bulkSummaryProgressLabel(4, 4, 2),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
