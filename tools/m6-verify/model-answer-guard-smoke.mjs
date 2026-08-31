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
      { file: "src/LINEAGE.cbl", line: 26, label: "LINEAGE writes REPORT-RECORD", nodeId: "program:LINEAGE" },
    ],
    prompt: "",
  };

  const cited = "- LINEAGE reads CUSTOMER-FILE (src/LINEAGE.cbl:21).";
  const footnote = enforceGroundedAnswerCitations("LINEAGE reads CUSTOMER-FILE [1].", context);
  const wrappedCitation = enforceGroundedAnswerCitations(
    "- LINEAGE reads CUSTOMER-FILE [1] [[src/LINEAGE.cbl:21]].",
    context,
  );
  const fileCitation = enforceGroundedAnswerCitations(
    "- LINEAGE reads CUSTOMER-FILE at file:src/LINEAGE.cbl:21.",
    context,
  );
  const uncited = enforceGroundedAnswerCitations("LINEAGE reads customer records and writes a report.", context);
  const partial = enforceGroundedAnswerCitations(
    ["LINEAGE reads CUSTOMER-FILE (src/LINEAGE.cbl:21).", "It also writes reports."].join("\n"),
    context,
  );
  const accepted = enforceGroundedAnswerCitations(cited, context);
  const inventedCitation = enforceGroundedAnswerCitations(
    "LINEAGE reads a secret file (src/INVENTED.cbl:999).",
    context,
  );
  const longAnswer = enforceGroundedAnswerCitations(
    [
      "- First supported fact (src/LINEAGE.cbl:21).",
      "- Second supported fact (src/LINEAGE.cbl:21).",
      "- Third supported fact (src/LINEAGE.cbl:21).",
      "- Fourth supported fact (src/LINEAGE.cbl:21).",
    ].join("\n"),
    context,
    { maxClaims: 3 },
  );
  const schedulingContext = {
    focusNodes: [{ id: "job:DAILYLN", type: "jcl-job", name: "DAILYLN", file: "jcl/DAILYLN.jcl", lines: [1, 4] }],
    citations: [
      { file: "jcl/DAILYLN.jcl", line: 1, endLine: 4, label: "DAILYLN", nodeId: "job:DAILYLN" },
      { file: "jcl/DAILYLN.jcl", line: 2, label: "STEP010 runs LINEAGE", nodeId: "step:DAILYLN/STEP010" },
    ],
  };
  const inventedSchedule = enforceGroundedAnswerCitations(
    "- DAILYLN is scheduled daily (jcl/DAILYLN.jcl:2).",
    schedulingContext,
  );
  const wrongNamedArtifact = enforceGroundedAnswerCitations(
    "- LINEAGE reads SECRET-FILE (src/LINEAGE.cbl:21).",
    context,
  );

  // Small local models cite in prose ("at src/LINEAGE.cbl:21") rather than in
  // parentheses; that citation is accepted. Uncited framing is removed while
  // the cited claims remain.
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
    "filters one framing line while preserving cited claims":
      framingPlusCited.guarded === false &&
      framingPlusCited.repaired === true &&
      !framingPlusCited.text.includes("batch COBOL program") &&
      framingPlusCited.text.includes("reads CUSTOMER-FILE") &&
      framingPlusCited.text.includes("writes REPORT-RECORD"),
    "rejects a bare numeric footnote without exact source":
      footnote.guarded === true && footnote.text.includes("no exact source citations"),
    "normalizes a wrapped exact citation while removing numeric footnotes":
      wrappedCitation.guarded === false &&
      wrappedCitation.repaired === true &&
      wrappedCitation.text.includes("(src/LINEAGE.cbl:21)") &&
      !wrappedCitation.text.includes("[1]") &&
      !wrappedCitation.text.includes("[["),
    "normalizes a file-prefixed exact citation":
      fileCitation.guarded === false &&
      fileCitation.repaired === true &&
      fileCitation.text.includes("(src/LINEAGE.cbl:21)"),
    "rejects uncited model text": uncited.guarded === true && uncited.text.includes("no exact source citations"),
    "filters a partially cited answer instead of discarding its cited claim":
      partial.guarded === false &&
      partial.repaired === true &&
      partial.text.includes("reads CUSTOMER-FILE") &&
      !partial.text.includes("writes reports"),
    "filters a mostly-uncited answer and supplements graph evidence":
      mostlyUncited.guarded === false &&
      mostlyUncited.repaired === true &&
      !mostlyUncited.text.includes("business calculations") &&
      mostlyUncited.text.includes("Grounded path evidence"),
    "rejects citations outside retrieved context":
      inventedCitation.guarded === true && inventedCitation.text.includes("citations outside retrieved context"),
    "rejects a scheduling inference that the cited JCL does not establish":
      inventedSchedule.guarded === true && inventedSchedule.text.includes("unsupported scheduling claim"),
    "rejects a named artifact absent from the cited relationship evidence":
      wrongNamedArtifact.guarded === true && wrongNamedArtifact.text.includes("citation does not support named artifacts: SECRET-FILE"),
    "limits a fully cited answer after validating every claim":
      longAnswer.guarded === false &&
      longAnswer.repaired === true &&
      longAnswer.text.includes("Third supported fact") &&
      !longAnswer.text.includes("Fourth supported fact"),
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
