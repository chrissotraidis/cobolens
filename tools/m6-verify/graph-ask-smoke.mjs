#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-graph-ask-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/retrieval/context.ts",
      "src/retrieval/graphAnswer.ts",
      "src/lib/graph.ts",
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
  const { retrieveQuestionContext } = require(resolve(tempRoot, "retrieval", "context.js"));
  const { graphAnswerFallback, isGraphQuestion } = require(resolve(tempRoot, "retrieval", "graphAnswer.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const sourceBundle = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-source.json"), "utf8"));
  const question = "What depends on CUSTOMER-ID?";
  const context = await retrieveQuestionContext({
    graph,
    question,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const answer = graphAnswerFallback(graph, question, context);
  const assertions = [
    ["question classified as graph-only", isGraphQuestion(question)],
    ["matched CUSTOMER-ID", answer.text.includes("CUSTOMER-ID (data-item) at copybook/CUSTOMER.cpy:2")],
    ["reports upstream definition", answer.text.includes("Upstream or used by: CUSTOMER.")],
    ["reports downstream impact", answer.text.includes("Downstream impact: REPORT-ID.")],
    ["cites move relationship", answer.text.includes("CUSTOMER-ID moves-to REPORT-ID at src/LINEAGE.cbl:31")],
    ["keeps model out of graph answer", !answer.text.includes("Model note")],
    ["has clickable citations", answer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 31)],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Graph Ask smoke failed: ${failed.join(", ")}`);
    console.error(answer.text);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        answerBytes: Buffer.byteLength(answer.text),
        citationCount: answer.citations.length,
        checks: Object.fromEntries(assertions),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
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
