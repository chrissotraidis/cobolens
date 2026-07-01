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
  const readQuestion = "What files does LINEAGE read?";
  const readContext = await retrieveQuestionContext({
    graph,
    question: readQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const readAnswer = graphAnswerFallback(graph, readQuestion, readContext);
  const readByQuestion = "Who reads CUSTOMER-FILE?";
  const readByContext = await retrieveQuestionContext({
    graph,
    question: readByQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const readByAnswer = graphAnswerFallback(graph, readByQuestion, readByContext);
  const writeQuestion = "What does LINEAGE write?";
  const writeContext = await retrieveQuestionContext({
    graph,
    question: writeQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const writeAnswer = graphAnswerFallback(graph, writeQuestion, writeContext);
  const writtenByQuestion = "Who writes REPORT-RECORD?";
  const writtenByContext = await retrieveQuestionContext({
    graph,
    question: writtenByQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const writtenByAnswer = graphAnswerFallback(graph, writtenByQuestion, writtenByContext);
  const flowQuestion = "Where does CUSTOMER-ID flow?";
  const flowContext = await retrieveQuestionContext({
    graph,
    question: flowQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const flowAnswer = graphAnswerFallback(graph, flowQuestion, flowContext);
  const explainQuestion = "Explain LINEAGE from the graph.";
  const typedBusinessLogicQuestion = "Explain the business logic in LINEAGE for a new developer";
  const typedPlainEnglishQuestion = "Explain LINEAGE in plain English for a new developer.";
  const explainContext = await retrieveQuestionContext({
    graph,
    question: explainQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const explainAnswer = graphAnswerFallback(graph, explainQuestion, explainContext);
  const customerMasterQuestion = "What uses the customer master file?";
  const customerMasterContext = await retrieveQuestionContext({
    graph,
    question: customerMasterQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const customerMasterAnswer = graphAnswerFallback(graph, customerMasterQuestion, customerMasterContext);
  const customerMasterFeedQuestion = "How does BANK.CUSTOMER.MASTER feed into LINEAGE?";
  const customerMasterFeedContext = await retrieveQuestionContext({
    graph,
    question: customerMasterFeedQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const customerMasterFeedAnswer = graphAnswerFallback(graph, customerMasterFeedQuestion, customerMasterFeedContext);
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
  const orientationQuestion = "What should I inspect first in this codebase?";
  const orientationContext = await retrieveQuestionContext({
    graph,
    question: orientationQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const orientationAnswer = graphAnswerFallback(graph, orientationQuestion, orientationContext);
  const codebaseOverviewQuestion = "Give me a codebase overview.";
  const codebaseOverviewContext = await retrieveQuestionContext({
    graph,
    question: codebaseOverviewQuestion,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const codebaseOverviewAnswer = graphAnswerFallback(graph, codebaseOverviewQuestion, codebaseOverviewContext);
  const selectedLineage = graph.nodes.find((node) => node.name === "LINEAGE" && node.type === "program");
  const selectedProgramQuestion = "What does this program do in plain English?";
  const selectedProgramContext = await retrieveQuestionContext({
    graph,
    question: selectedProgramQuestion,
    preferredNode: selectedLineage,
    readExcerpt: async (node) => sourceExcerpt(sourceBundle, node),
  });
  const selectedProgramAnswer = graphAnswerFallback(graph, selectedProgramQuestion, selectedProgramContext);
  const assertions = [
    ["question classified as graph-only", isGraphQuestion(question)],
    ["call question classified as graph-only", isGraphQuestion(callQuestion)],
    ["flow question classified as graph-only", isGraphQuestion(flowQuestion)],
    ["where question classified as graph-only", isGraphQuestion(whereQuestion)],
    ["uses question classified as graph-only", isGraphQuestion(usesQuestion)],
    ["explain question classified as graph-only", isGraphQuestion(explainQuestion)],
    ["read question classified as graph-only", isGraphQuestion(readQuestion)],
    ["read-by question classified as graph-only", isGraphQuestion(readByQuestion)],
    ["write question classified as graph-only", isGraphQuestion(writeQuestion)],
    ["written-by question classified as graph-only", isGraphQuestion(writtenByQuestion)],
    ["orientation question classified as graph-only", isGraphQuestion(orientationQuestion)],
    ["codebase overview question classified as graph-only", isGraphQuestion(codebaseOverviewQuestion)],
    ["selected-symbol overview question classified as graph-only", isGraphQuestion(selectedProgramQuestion)],
    ["explicit graph explanation stays graph-only", isGraphQuestion(explainQuestion)],
    ["typed business logic explanation uses model route", !isGraphQuestion(typedBusinessLogicQuestion)],
    ["typed plain-English explanation uses model route", !isGraphQuestion(typedPlainEnglishQuestion)],
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
    ["matched program location includes range", whereAnswer.text.includes("LINEAGE (program) at src/LINEAGE.cbl:1-47")],
    ["reports recorded locations", whereAnswer.text.includes("Recorded locations: src/LINEAGE.cbl:1")],
    ["cites matched location", whereAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 1)],
    ["reports runtime transfer answer", callAnswer.text.includes("Calls or transfers: LINK RATEAPI, RATEAUDIT.")],
    ["prioritizes runtime transfer relationship", callAnswer.text.includes("- LINEAGE executes LINK RATEAPI at src/LINEAGE.cbl:40")],
    ["reports plain COBOL call relationship", callAnswer.text.includes("- LINEAGE CALLS RATEAUDIT at src/LINEAGE.cbl:43")],
    ["call answer omits unrelated copybook edges", !callAnswer.text.includes("COPIES CUSTOMER") && !callAnswer.text.includes("COPIES REPORT")],
    ["call citations stay focused", !callAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 11)],
    ["cites runtime transfer", callAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 40)],
    ["cites plain COBOL call", callAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 43)],
    ["read answer reports only recorded reads", readAnswer.text.includes("Reads: CUSTOMER-FILE.")],
    ["read answer reports no incoming readers for program", readAnswer.text.includes("Read by: none recorded.")],
    ["read answer cites read relationship", readAnswer.text.includes("- LINEAGE reads CUSTOMER-FILE at src/LINEAGE.cbl:21")],
    ["read answer omits write/call relationships", !readAnswer.text.includes("writes REPORT-RECORD") && !readAnswer.text.includes("executes LINK RATEAPI")],
    ["read answer citations stay focused", readAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 21) && !readAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 26)],
    ["read-by question matches logical file", readByContext.focusNodes[0]?.name === "CUSTOMER-FILE"],
    ["read-by answer reports incoming reader", readByAnswer.text.includes("Read by: LINEAGE.")],
    ["read-by answer cites incoming read", readByAnswer.text.includes("- LINEAGE reads CUSTOMER-FILE at src/LINEAGE.cbl:21")],
    ["write answer reports recorded writes", writeAnswer.text.includes("Writes or updates: REPORT-RECORD.")],
    ["write answer reports no incoming writers for program", writeAnswer.text.includes("Written or updated by: none recorded.")],
    ["write answer omits read/call relationships", !writeAnswer.text.includes("reads CUSTOMER-FILE") && !writeAnswer.text.includes("executes LINK RATEAPI")],
    ["written-by question matches report record", writtenByContext.focusNodes[0]?.name === "REPORT-RECORD"],
    ["written-by answer reports incoming writer", writtenByAnswer.text.includes("Written or updated by: LINEAGE.")],
    ["written-by answer cites incoming write", writtenByAnswer.text.includes("- LINEAGE writes REPORT-RECORD at src/LINEAGE.cbl:26")],
    ["reports flow source", flowAnswer.text.includes("Flow sources or definitions: CUSTOMER.")],
    ["reports flow destination", flowAnswer.text.includes("Flow destinations: REPORT-ID.")],
    ["cites flow destination", flowAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 31)],
    ["explain answer includes graph-derived brief", explainAnswer.text.includes("Graph-derived brief:")],
    ["explain answer reports incoming and outgoing counts", explainAnswer.text.includes("1 incoming and 10 outgoing relationships")],
    ["explain answer cites matched source", explainAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 1)],
    ["natural customer master phrase matches physical dataset", customerMasterContext.focusNodes[0]?.name === "BANK.CUSTOMER.MASTER"],
    ["customer master answer cites JCL DD mapping", customerMasterAnswer.text.includes("CUSTIN uses-dd BANK.CUSTOMER.MASTER at jcl/DAILYLN.jcl:3")],
    ["feed-into dataset question classified as graph-only", isGraphQuestion(customerMasterFeedQuestion)],
    ["feed-into question matches dataset then program", customerMasterFeedContext.focusNodes[0]?.name === "BANK.CUSTOMER.MASTER" && customerMasterFeedContext.focusNodes[1]?.name === "LINEAGE"],
    ["feed-into answer shows connection path", customerMasterFeedAnswer.text.includes("Connection path from BANK.CUSTOMER.MASTER to LINEAGE:")],
    ["feed-into path includes JCL DD mapping", customerMasterFeedAnswer.text.includes("CUSTIN uses-dd BANK.CUSTOMER.MASTER at jcl/DAILYLN.jcl:3")],
    ["feed-into path includes COBOL file assignment", customerMasterFeedAnswer.text.includes("CUSTOMER-FILE assigned-to CUSTIN at src/LINEAGE.cbl:6")],
    ["feed-into path includes program read", customerMasterFeedAnswer.text.includes("LINEAGE reads CUSTOMER-FILE at src/LINEAGE.cbl:21")],
    ["feed-into answer cites the read edge", customerMasterFeedAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 21)],
    ["natural daily report phrase matches physical dataset", dailyReportContext.focusNodes[0]?.name === "BANK.REPORT.DAILY"],
    ["daily report answer cites report DD mapping", dailyReportAnswer.text.includes("RPTFILE uses-dd BANK.REPORT.DAILY at jcl/DAILYLN.jcl:4")],
    ["natural report file phrase matches logical COBOL file", logicalReportContext.focusNodes[0]?.name === "REPORT-FILE"],
    ["logical report answer cites COBOL to JCL assignment", logicalReportAnswer.text.includes("REPORT-FILE assigned-to RPTFILE at src/LINEAGE.cbl:7")],
    ["unknown symbol has no matched focus", unknownContext.focusNodes.length === 0],
    ["unknown symbol says it could not match", unknownAnswer.text.includes("I could not match that question to a symbol in the graph.")],
    ["unknown symbol has no citations", unknownAnswer.citations.length === 0],
    ["orientation answer is graph-only", orientationAnswer.text.includes("I answered from the graph without using a model.")],
    ["orientation answer recommends JCL entry wiring", orientationAnswer.text.includes("STEP010 RUNS LINEAGE at jcl/DAILYLN.jcl:2")],
    ["orientation answer points to high-connection source units", orientationAnswer.text.includes("LINEAGE (program) has")],
    ["orientation answer cites the entry edge", orientationAnswer.citations.some((citation) => citation.file === "jcl/DAILYLN.jcl" && citation.line === 2)],
    ["codebase overview answer is graph-only", codebaseOverviewAnswer.text.includes("I answered from the graph without using a model.")],
    ["codebase overview gives inventory", codebaseOverviewAnswer.text.includes("I found 1 source program, 2 copybooks, and 1 JCL job.")],
    ["codebase overview has citations", codebaseOverviewAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 1)],
    ["selected-symbol pronoun question focuses selected node", selectedProgramContext.focusNodes[0]?.id === selectedLineage?.id],
    ["selected-symbol pronoun question uses selected node only", selectedProgramContext.focusNodes.length === 1],
    ["selected-symbol overview answer is graph-only", selectedProgramAnswer.text.includes("I answered from the graph without using a model.")],
    ["selected-symbol overview answer includes graph brief", selectedProgramAnswer.text.includes("Graph-derived brief:")],
    ["selected-symbol overview answer cites source", selectedProgramAnswer.citations.some((citation) => citation.file === "src/LINEAGE.cbl" && citation.line === 1)],
    ["selected-symbol context labels selected symbol", selectedProgramContext.prompt.includes("Selected symbol: LINEAGE (program) src/LINEAGE.cbl:1-47")],
    ["selected-symbol context labels source excerpts", selectedProgramContext.prompt.includes("Source excerpt for LINEAGE (program) at src/LINEAGE.cbl:1-47")],
    ["selected-symbol context includes grounding rules", selectedProgramContext.prompt.includes("Use relationship direction exactly as listed.")],
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
