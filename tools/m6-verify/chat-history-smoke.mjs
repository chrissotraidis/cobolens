#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-chat-history-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/inspector/chatHistory.ts",
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
  const historyPath = existsSync(resolve(tempRoot, "inspector", "chatHistory.js"))
    ? resolve(tempRoot, "inspector", "chatHistory.js")
    : resolve(tempRoot, "chatHistory.js");
  const { CHAT_HISTORY_LIMIT, rememberRecentChatAnswer } = require(historyPath);
  const answers = Array.from({ length: 8 }, (_, index) => answer(`Question ${index}`, `Answer ${index}`));
  const capped = answers.reduce((history, next) => rememberRecentChatAnswer(history, next), []);
  const duplicateFirst = answer("Question 5", "Answer 5");
  const deduped = rememberRecentChatAnswer(capped, duplicateFirst);
  const sameQuestionDifferentText = rememberRecentChatAnswer(deduped, answer("Question 5", "Different answer"));

  const assertions = [
    ["history limit is stable", CHAT_HISTORY_LIMIT === 6],
    ["newest answers are first", capped[0].question === "Question 7" && capped[1].question === "Question 6"],
    ["history caps to the recent limit", capped.length === CHAT_HISTORY_LIMIT && capped.at(-1).question === "Question 2"],
    [
      "duplicate question and text moves to the top once",
      deduped[0] === duplicateFirst && deduped.filter((item) => item.question === "Question 5" && item.text === "Answer 5").length === 1,
    ],
    [
      "same question with different text is preserved",
      sameQuestionDifferentText[0].text === "Different answer" &&
        sameQuestionDifferentText.some((item) => item.question === "Question 5" && item.text === "Answer 5"),
    ],
    ["current history is not mutated", capped[0].question === "Question 7"],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Chat history smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        limit: CHAT_HISTORY_LIMIT,
        newest: capped[0].question,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function answer(question, text) {
  return {
    question,
    text,
    citations: [],
    source: "graph",
  };
}
