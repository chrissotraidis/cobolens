#!/usr/bin/env node
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-ollama-ask-"));
const questions = [
  "Explain LINEAGE in plain English for a new developer.",
  "Describe the customer data that LINEAGE reads.",
  "Describe the report data that LINEAGE writes.",
  "How does LINEAGE interact with CUSTOMER_TABLE?",
  "Explain how the daily JCL job reaches LINEAGE.",
  "Explain the recorded data flow for CUSTOMER-ID.",
  "What does BUILD-REPORT do according to the source and graph?",
  "How is RATEAPI connected to LINEAGE?",
  "Which copybooks does LINEAGE use and where?",
  "Summarize the recorded daily job flow for an onboarding developer.",
];

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "module" }));
  await symlink(resolve(repoRoot, "node_modules"), resolve(tempRoot, "node_modules"), "dir");

  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/model/chat.ts",
      "src/model/answerGuard.ts",
      "src/model/config.ts",
      "src/model/privacy.ts",
      "src/model/providers.ts",
      "src/retrieval/context.ts",
      "src/lib/graph.ts",
      "--target",
      "ES2022",
      "--module",
      "ES2022",
      "--moduleResolution",
      "bundler",
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
  await patchCompiledImports("model/chat.js");
  await patchCompiledImports("model/providers.js");
  await patchCompiledImports("retrieval/context.js");

  const { DEFAULT_MODEL_SETTINGS } = await import(compiledModuleUrl("model", "config.js"));
  const { generateGroundedAnswer } = await import(compiledModuleUrl("model", "chat.js"));
  const { retrieveQuestionContext } = await import(compiledModuleUrl("retrieval", "context.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const sourceBundle = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-source.json"), "utf8"));
  const settings = {
    ...DEFAULT_MODEL_SETTINGS,
    model: process.argv[2] ?? DEFAULT_MODEL_SETTINGS.model,
    baseUrl: process.env.OLLAMA_BASE_URL ? `${process.env.OLLAMA_BASE_URL.replace(/\/+$/, "")}/api` : DEFAULT_MODEL_SETTINGS.baseUrl,
  };
  const results = [];
  for (const question of questions) {
    const context = await retrieveQuestionContext({
      graph,
      question,
      readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
    });
    let draftUpdates = 0;
    const startedAt = Date.now();
    const answer = await generateGroundedAnswer({
      question,
      context,
      settings,
      onTextDelta: () => {
        draftUpdates += 1;
      },
    });
    results.push({
      question,
      answer,
      context,
      draftUpdates,
      elapsedMs: Date.now() - startedAt,
    });
  }

  const repeated = await runRepeatedQuestion({
    question: questions[0],
    graph,
    sourceBundle,
    settings,
    retrieveQuestionContext,
    generateGroundedAnswer,
  });
  const cancellation = await runCancellationCheck({
    question: questions[0],
    graph,
    sourceBundle,
    settings,
    retrieveQuestionContext,
    generateGroundedAnswer,
  });

  const checks = {
    "ten representative Local AI questions completed": results.length === 10,
    "every Local AI question returned source-cited text":
      results.every(({ answer }) => answer.text.length > 0 && /[\w./-]+\.[A-Za-z][A-Za-z0-9]*:\d+/.test(answer.text)),
    "every Local AI question streamed draft updates": results.every(({ draftUpdates }) => draftUpdates > 0),
    "at least nine Local AI answers retain source-backed model content":
      results.filter(({ answer }) => !answer.guarded).length >= 9 &&
      results.some(({ answer }) => answer.repaired),
    "any full graph fallback is rare, explicit, and source-cited":
      results.filter(({ answer }) => answer.guarded).length <= 1 &&
      results
        .filter(({ answer }) => answer.guarded)
        .every(({ answer }) =>
          answer.text.includes("Local AI draft failed citation checks") &&
          /[\w./-]+\.[A-Za-z][A-Za-z0-9]*:\d+/.test(answer.text),
        ),
    "Local AI answers avoid generic compiler hallucination":
      results.every(({ answer }) => !/\b(compiler optimization|recompil\w*)\b/i.test(answer.text)),
    "retrieval supplied clickable citations for every question":
      results.every(({ context }) => context.citations.length > 0),
    "the same question returns a grounded answer again in the same model session":
      repeated.text.length > 0 &&
      /[\w./-]+\.[A-Za-z][A-Za-z0-9]*:\d+/.test(repeated.text) &&
      (!repeated.guarded || repeated.text.includes("Local AI draft failed citation checks")),
    "live Local AI cancellation settles promptly after abort":
      cancellation.aborted && cancellation.settled && cancellation.elapsedAfterAbortMs < 5_000,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Ollama Ask smoke failed: ${failed.join(", ")}`);
    console.error(JSON.stringify({
      results: results.map(({ question, answer }) => ({ question, answer })),
      repeated,
      cancellation,
    }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        model: settings.model,
        questions: results.map(({ question, answer, draftUpdates, elapsedMs }) => ({
          question,
          guarded: Boolean(answer.guarded),
          repaired: Boolean(answer.repaired),
          retried: Boolean(answer.retried),
          answerBytes: Buffer.byteLength(answer.text),
          draftUpdates,
          elapsedMs,
        })),
        repeated: {
          guarded: Boolean(repeated.guarded),
          repaired: Boolean(repeated.repaired),
          retried: Boolean(repeated.retried),
          answerBytes: Buffer.byteLength(repeated.text),
        },
        cancellation,
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function runRepeatedQuestion({
  question,
  graph,
  sourceBundle,
  settings,
  retrieveQuestionContext,
  generateGroundedAnswer,
}) {
  const context = await retrieveQuestionContext({
    graph,
    question,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  return generateGroundedAnswer({ question, context, settings });
}

async function runCancellationCheck({
  question,
  graph,
  sourceBundle,
  settings,
  retrieveQuestionContext,
  generateGroundedAnswer,
}) {
  const context = await retrieveQuestionContext({
    graph,
    question,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const controller = new AbortController();
  let abortedAt = 0;
  const outcome = generateGroundedAnswer({
    question,
    context,
    settings,
    abortSignal: controller.signal,
    onFirstToken: () => {
      abortedAt = Date.now();
      controller.abort();
    },
  })
    .then(() => "resolved")
    .catch(() => "rejected");
  const settled = await Promise.race([
    outcome,
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 5_000)),
  ]);
  return {
    aborted: controller.signal.aborted,
    settled: settled !== "timeout",
    outcome: settled,
    elapsedAfterAbortMs: abortedAt ? Date.now() - abortedAt : 5_000,
  };
}

function compiledModuleUrl(folder, filename) {
  return pathToFileURL(resolve(tempRoot, folder, filename)).href;
}

function sourceExcerpt(sourceBundle, node) {
  if (!node.file) {
    throw new Error(`Node ${node.id} has no source file.`);
  }
  const text = sourceBundle[node.file];
  if (text == null) {
    throw new Error(`Source ${node.file} is unavailable.`);
  }
  const lines = text.split(/\r?\n/);
  const startLine = node.lines?.[0] ?? 1;
  const endLine = node.lines?.[1] ?? startLine;
  const safeStart = Math.max(1, startLine);
  const safeEnd = Math.min(lines.length, Math.max(safeStart, endLine));
  return {
    file: node.file,
    startLine: safeStart,
    endLine: safeEnd,
    truncated: false,
    text: lines
      .slice(safeStart - 1, safeEnd)
      .map((line, index) => `${String(safeStart + index).padStart(5, " ")} ${line}`)
      .join("\n"),
  };
}

async function patchCompiledImports(path) {
  const target = resolve(tempRoot, path);
  if (!existsSync(target)) return;
  const current = await readFile(target, "utf8");
  const patched = current
    .replaceAll('from "./providers"', 'from "./providers.js"')
    .replaceAll('from "./answerGuard"', 'from "./answerGuard.js"')
    .replaceAll('from "./prompts"', 'from "./prompts.js"')
    .replaceAll('from "./privacy"', 'from "./privacy.js"')
    .replaceAll('from "./config"', 'from "./config.js"')
    .replaceAll('from "../lib/graph"', 'from "../lib/graph.js"')
    .replaceAll('from "../retrieval/context"', 'from "../retrieval/context.js"');
  if (patched !== current) await writeFile(target, patched);
}
