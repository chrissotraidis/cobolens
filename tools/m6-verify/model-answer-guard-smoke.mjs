#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-answer-guard-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/model/answerGuard.ts",
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
  const { enforceGroundedAnswerCitations, hasExactInlineSourceCitation } = require(resolve(tempRoot, "model", "answerGuard.js"));
  const context = {
    focusNodes: [
      { id: "program:LINEAGE", type: "program", name: "LINEAGE", file: "src/LINEAGE.cbl", lines: [1, 47] },
    ],
    edges: [],
    citations: [
      { file: "src/LINEAGE.cbl", line: 1, endLine: 47, label: "LINEAGE source", nodeId: "program:LINEAGE" },
      { file: "src/LINEAGE.cbl", line: 21, label: "LINEAGE reads CUSTOMER-FILE", nodeId: "program:LINEAGE" },
    ],
    prompt: "",
  };

  const cited = "- LINEAGE reads CUSTOMER-FILE (src/LINEAGE.cbl:21).";
  const footnote = enforceGroundedAnswerCitations("LINEAGE reads CUSTOMER-FILE [1].", context);
  const uncited = enforceGroundedAnswerCitations("LINEAGE reads customer records and writes a report.", context);
  const partial = enforceGroundedAnswerCitations(
    ["LINEAGE reads CUSTOMER-FILE (src/LINEAGE.cbl:21).", "It also writes reports."].join("\n"),
    context,
  );
  const accepted = enforceGroundedAnswerCitations(cited, context);

  // Small local models cite in prose ("at src/LINEAGE.cbl:21") rather than in
  // parentheses; that must be accepted, and a single uncited framing line must
  // not discard an otherwise-grounded answer.
  const proseCitation = "LINEAGE reads CUSTOMER-FILE at src/LINEAGE.cbl:21.";
  const proseAccepted = enforceGroundedAnswerCitations(proseCitation, context);
  const framingPlusCited = enforceGroundedAnswerCitations(
    [
      "LINEAGE is a batch COBOL program that builds a daily report.",
      "It reads CUSTOMER-FILE at src/LINEAGE.cbl:21.",
      "It writes REPORT-RECORD at src/LINEAGE.cbl:26.",
    ].join("\n"),
    context,
  );
  const mostlyUncited = enforceGroundedAnswerCitations(
    [
      "LINEAGE processes customer data end to end.",
      "It performs a series of business calculations.",
      "It produces several downstream outputs.",
      "One relationship is at src/LINEAGE.cbl:21.",
    ].join("\n"),
    context,
  );

  const checks = {
    "recognizes exact inline citation": hasExactInlineSourceCitation(cited),
    "recognizes non-parenthesized prose citation": hasExactInlineSourceCitation(proseCitation),
    "does not treat a bare ratio as a citation": !hasExactInlineSourceCitation("The ratio was 1.18:1 overall."),
    "accepts fully cited answer": accepted.text === cited && accepted.guarded === false,
    "accepts prose-cited answer": proseAccepted.guarded === false && proseAccepted.text === proseCitation,
    "accepts one framing line with a cited majority": framingPlusCited.guarded === false,
    "rejects footnote citations": footnote.guarded === true && footnote.text.includes("footnote-style citations"),
    "rejects uncited model text": uncited.guarded === true && uncited.text.includes("no exact source citations"),
    "rejects partially cited answer blocks": partial.guarded === true && partial.text.includes("uncited explanation lines"),
    "rejects mostly-uncited answer": mostlyUncited.guarded === true && mostlyUncited.text.includes("uncited explanation lines"),
    "fallback includes exact source citation": /\(src\/LINEAGE\.cbl:21\)/.test(uncited.text),
    "fallback strips bracketed footnotes": !/\[\d+\]/.test(footnote.text),
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Model answer guard smoke failed: ${failed.join(", ")}`);
    console.error({ footnote, uncited, partial, accepted });
    process.exit(1);
  }

  console.log(JSON.stringify({ checks }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
