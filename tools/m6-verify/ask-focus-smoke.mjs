#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-ask-focus-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/retrieval/askFocus.ts",
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
  const askFocusPath = existsSync(resolve(tempRoot, "retrieval", "askFocus.js"))
    ? resolve(tempRoot, "retrieval", "askFocus.js")
    : resolve(tempRoot, "askFocus.js");
  const { shouldSyncAskFocus } = require(askFocusPath);

  const overviewQuestions = [
    "Codebase overview",
    "Give me an overview of this codebase",
    "Where should I start?",
    "What should I inspect first?",
    "What are the entry points?",
    "What is in this codebase?",
    "How is this codebase structured?",
  ];
  const focusedQuestions = [
    "What depends on CUSTOMER-ID?",
    "Explain the selected symbol",
    "Where is REPORT-RECORD written?",
    "Which program reads CUSTOMER-FILE?",
  ];
  const assertions = [
    ["overview/orientation questions do not auto-refocus the graph", overviewQuestions.every((question) => !shouldSyncAskFocus(question))],
    ["symbol-specific questions can sync Ask focus to evidence", focusedQuestions.every((question) => shouldSyncAskFocus(question))],
    ["matching is case-insensitive and tolerant of surrounding words", !shouldSyncAskFocus("Please show an OVERVIEW OF THIS CODEBASE first")],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Ask focus smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        overviewQuestions: overviewQuestions.length,
        focusedQuestions: focusedQuestions.length,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
