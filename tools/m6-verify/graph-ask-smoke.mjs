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
  const lineageQuestion = "What depends on LINEAGE?";
  const lineageContext = await retrieveQuestionContext({
    graph,
    question: lineageQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const lineageAnswer = graphAnswerFallback(graph, lineageQuestion, lineageContext);
  const usesQuestion = "Who uses CUSTOMER?";
  const usesContext = await retrieveQuestionContext({
    graph,
    question: usesQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const usesAnswer = graphAnswerFallback(graph, usesQuestion, usesContext);
  const whereQuestion = "Where does LINEAGE happen?";
  const whereContext = await retrieveQuestionContext({
    graph,
    question: whereQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const whereAnswer = graphAnswerFallback(graph, whereQuestion, whereContext);
  const callQuestion = "What does LINEAGE call?";
  const callContext = await retrieveQuestionContext({
    graph,
    question: callQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const callAnswer = graphAnswerFallback(graph, callQuestion, callContext);
  const flowQuestion = "Where does CUSTOMER-ID flow?";
  const flowContext = await retrieveQuestionContext({
    graph,
    question: flowQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const flowAnswer = graphAnswerFallback(graph, flowQuestion, flowContext);
  const customerMasterQuestion = "What uses the customer master file?";
  const customerMasterContext = await retrieveQuestionContext({
    graph,
    question: customerMasterQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const customerMasterAnswer = graphAnswerFallback(graph, customerMasterQuestion, customerMasterContext);
  const dailyReportQuestion = "What uses the daily report dataset?";
  const dailyReportContext = await retrieveQuestionContext({
    graph,
    question: dailyReportQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const dailyReportAnswer = graphAnswerFallback(graph, dailyReportQuestion, dailyReportContext);
  const logicalReportQuestion = "Where does the report file flow?";
  const logicalReportContext = await retrieveQuestionContext({
    graph,
    question: logicalReportQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const logicalReportAnswer = graphAnswerFallback(graph, logicalReportQuestion, logicalReportContext);
  const unknownQuestion = "Where does FROBULATOR happen?";
  const unknownContext = await retrieveQuestionContext({
    graph,
    question: unknownQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const unknownAnswer = graphAnswerFallback(graph, unknownQuestion, unknownContext);
  const assertions = [
    ["question classified as graph-only", isGraphQuestion(question)],
    ["call question classified as graph-only", isGraphQuestion(callQuestion)],
    ["flow question classified as graph-only", isGraphQuestion(flowQuestion)],
    ["where question classified as graph-only", isGraphQuestion(whereQuestion)],
    ["uses question classified as graph-only", isGraphQuestion(usesQuestion)],
    ["matched CUSTOMER-ID", answer.text.includes("CUSTOMER-ID (data-item) at copybook/CUSTOMER.cpy:2")],
    ["reports upstream definition", answer.text.includes("Upstream or used by: CUSTOMER.")],
    ["reports downstream impact", answer.text.includes("Downstream impact: REPORT-ID.")],
    ["cites move relationship", answer.text.includes("CUSTOMER-ID moves-to REPORT-ID at src/LINEAGE.cbl:31")],
    ["reports JCL users before display limit", lineageAnswer.text.includes("Upstream or used by: STEP010.")],
    ["prioritizes incoming dependency relationship", lineageAnswer.text.includes("STEP010 RUNS LINEAGE at jcl/DAILYLN.jcl:2")],
    ["program dependency answer stays focused on incoming users", !lineageAnswer.text.includes("Downstream impact:")],
    ["cites incoming JCL dependency", lineageAnswer.citations.some((citation) => citation.file === "jcl/DAILYLN.jcl" && citation.line === 2)],
    ["program dependency citations stay focused", !lineageAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 40)],
    ["reports copybook where-used", usesAnswer.text.includes("Upstream or used by: LINEAGE")],
    ["cites copybook usage", usesAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 11)],
    ["reports recorded locations", whereAnswer.text.includes("Recorded locations: src/LINEAGE.cbl:1")],
    ["cites matched location", whereAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 1)],
    ["reports runtime transfer answer", callAnswer.text.includes("Calls or runtime transfers: LINK RATEAPI, RATEAUDIT.")],
    ["prioritizes runtime transfer relationship", callAnswer.text.includes("- LINEAGE executes LINK RATEAPI at src/LINEAGE.cbl:40")],
    ["reports plain COBOL call relationship", callAnswer.text.includes("- LINEAGE CALLS RATEAUDIT at src/LINEAGE.cbl:43")],
    ["call answer omits unrelated copybook edges", !callAnswer.text.includes("COPIES CUSTOMER") && !callAnswer.text.includes("COPIES REPORT")],
    ["call citations stay focused", !callAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 11)],
    ["cites runtime transfer", callAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 40)],
    ["cites plain COBOL call", callAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 43)],
    ["reports flow source", flowAnswer.text.includes("Flow sources or definitions: CUSTOMER.")],
    ["reports flow destination", flowAnswer.text.includes("Flow destinations: REPORT-ID.")],
    ["cites flow destination", flowAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 31)],
    ["natural customer master phrase matches physical dataset", customerMasterContext.focusNodes[0]?.name === "BANK.CUSTOMER.MASTER"],
    ["customer master answer cites JCL DD mapping", customerMasterAnswer.text.includes("CUSTIN uses-dd BANK.CUSTOMER.MASTER at jcl/DAILYLN.jcl:3")],
    ["natural daily report phrase matches physical dataset", dailyReportContext.focusNodes[0]?.name === "BANK.REPORT.DAILY"],
    ["daily report answer cites report DD mapping", dailyReportAnswer.text.includes("RPTFILE uses-dd BANK.REPORT.DAILY at jcl/DAILYLN.jcl:4")],
    ["natural report file phrase matches logical COBOL file", logicalReportContext.focusNodes[0]?.name === "REPORT-FILE"],
    ["logical report answer cites COBOL to JCL assignment", logicalReportAnswer.text.includes("REPORT-FILE assigned-to RPTFILE at src/LINEAGE.cbl:7")],
    ["unknown symbol has no matched focus", unknownContext.focusNodes.length === 0],
    ["unknown symbol says it could not match", unknownAnswer.text.includes("I could not match that question to a symbol in the graph.")],
    ["unknown symbol has no citations", unknownAnswer.citations.length === 0],
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
