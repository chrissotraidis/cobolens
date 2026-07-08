#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, symlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-model-runtime-"));

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
      "src/model/modelRuntime.ts",
      "src/model/config.ts",
      "src/lib/tauri.ts",
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
  const runtimePath = existsSync(resolve(tempRoot, "model", "modelRuntime.js"))
    ? resolve(tempRoot, "model", "modelRuntime.js")
    : resolve(tempRoot, "modelRuntime.js");
  const {
    friendlyModelError,
    isStoppedModelCall,
    runStreamingModelCall,
    semanticEmbeddingModelKey,
  } = require(runtimePath);

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

  const successTimers = installWindowTimers();
  const previousController = new AbortController();
  let previousAborted = false;
  previousController.signal.addEventListener("abort", () => {
    previousAborted = true;
  });
  const successRef = { current: previousController };
  const successResult = await runStreamingModelCall("Ask", successRef, async (abortSignal, noteFirstToken) => {
    noteFirstToken();
    return abortSignal.aborted ? "aborted" : "ok";
  });

  const timeoutTimers = installWindowTimers();
  const timeoutRef = { current: null };
  const timeoutError = await capturesError(() =>
    runStreamingModelCall("Ask", timeoutRef, async (abortSignal) => {
      timeoutTimers.fireLastTimeout();
      if (abortSignal.aborted) throw new DOMException("Aborted", "AbortError");
      return "unexpected";
    }),
  );

  const stoppedTimers = installWindowTimers();
  const stoppedRef = { current: null };
  const stoppedError = await capturesError(() =>
    runStreamingModelCall("Summary generation", stoppedRef, async (_abortSignal, noteFirstToken) => {
      noteFirstToken();
      stoppedRef.current?.abort();
      throw new DOMException("Aborted", "AbortError");
    }),
  );

  const replacedTimers = installWindowTimers();
  const replacementController = new AbortController();
  const replacedRef = { current: null };
  await runStreamingModelCall("Ask", replacedRef, async (_abortSignal, noteFirstToken) => {
    noteFirstToken();
    replacedRef.current = replacementController;
    return "newer call owns the ref";
  });

  const assertions = [
    [
      "streaming calls abort the previous controller and clear the active ref on success",
      previousAborted === true &&
        successResult === "ok" &&
        successRef.current === null &&
        successTimers.clearedCount >= 1,
    ],
    [
      "first-token timeout aborts with readiness-oriented copy",
      timeoutRef.current === null &&
        timeoutError.includes("did not receive any model text within 30s") &&
        timeoutError.includes("check AI readiness"),
    ],
    [
      "manual stop after streaming begins reads as a stopped call",
      stoppedRef.current === null &&
        stoppedError === "Summary generation was stopped." &&
        isStoppedModelCall(stoppedError),
    ],
    [
      "newer active controllers are not cleared by an older call finishing",
      replacedRef.current === replacementController && replacedTimers.clearedCount >= 1,
    ],
    [
      "friendly model errors distinguish Ollama setup from cloud connectivity",
      friendlyModelError(new Error("Failed to fetch"), ollamaSettings).includes("ollama serve") &&
        friendlyModelError(new Error("Failed to fetch"), openaiSettings).includes("Could not reach OpenAI"),
    ],
    [
      "semantic embedding cache keys prefer the embedding model and fall back to generation model",
      semanticEmbeddingModelKey(ollamaSettings) === "ollama|http://127.0.0.1:11434|nomic-embed-text" &&
        semanticEmbeddingModelKey({ ...ollamaSettings, embeddingModel: "" }) === "ollama|http://127.0.0.1:11434|llama3.2",
    ],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Model runtime smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        timeoutMessage: timeoutError,
        stoppedMessage: stoppedError,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function installWindowTimers() {
  const timers = [];
  const cleared = [];
  global.window = {
    setTimeout(callback, ms) {
      const timer = { callback, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (!timer) return;
      timer.cleared = true;
      cleared.push(timer);
    },
  };
  return {
    get clearedCount() {
      return cleared.length;
    },
    fireLastTimeout() {
      const timer = timers.at(-1);
      if (!timer || timer.cleared) throw new Error("No active timeout to fire");
      timer.callback();
    },
  };
}

async function capturesError(fn) {
  try {
    await fn();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
