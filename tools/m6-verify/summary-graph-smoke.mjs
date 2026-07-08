#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-summary-graph-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/inspector/summaryGraph.ts",
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
  const summaryGraphPath = existsSync(resolve(tempRoot, "inspector", "summaryGraph.js"))
    ? resolve(tempRoot, "inspector", "summaryGraph.js")
    : resolve(tempRoot, "summaryGraph.js");
  const {
    graphBackedSummaryFallback,
    nodeGraphOverview,
    selectedNodeGraphAnswer,
    summaryEvidenceCitations,
  } = require(summaryGraphPath);
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));

  const program = findNode(graph, "prog:LINEAGE");
  const logicalFile = findNode(graph, "dataset:CUSTOMER-FILE");
  const dd = findNode(graph, "dd:CUSTIN");
  const physicalDataset = findNode(graph, "dataset:BANK.CUSTOMER.MASTER");
  const externalProgram = findNode(graph, "prog:RATEAPI");

  const programOverview = nodeGraphOverview(program, graph);
  const logicalFileOverview = nodeGraphOverview(logicalFile, graph);
  const ddOverview = nodeGraphOverview(dd, graph);
  const physicalDatasetOverview = nodeGraphOverview(physicalDataset, graph);
  const externalOverview = nodeGraphOverview(externalProgram, graph);
  const programEvidence = summaryEvidenceCitations(program, graph);
  const externalEvidence = summaryEvidenceCitations(externalProgram, graph);
  const selectedAnswer = selectedNodeGraphAnswer(program, graph);
  const fallback = graphBackedSummaryFallback(
    graph,
    program,
    {
      nodeId: program.id,
      text: "stale uncited model text",
      provider: "ollama",
      model: "llama3.2",
    },
    "missing citations",
  );

  const assertions = [
    [
      "program overview reports location and relationship counts",
      programOverview.includes("LINEAGE is a program.") &&
        programOverview.includes("Source: src/LINEAGE.cbl:1.") &&
        programOverview.includes("1 incoming and 10 outgoing relationships") &&
        programOverview.includes("4 lineage relationships"),
    ],
    [
      "logical COBOL file overview names its DD and physical dataset bridge",
      logicalFileOverview.includes("COBOL SELECT maps this logical file to DD CUSTIN") &&
        logicalFileOverview.includes("dataset BANK.CUSTOMER.MASTER"),
    ],
    [
      "JCL DD and physical dataset overviews explain both sides of the bridge",
      ddOverview.includes("This DD bridges COBOL CUSTOMER-FILE to physical dataset BANK.CUSTOMER.MASTER") &&
        physicalDatasetOverview.includes("JCL DD CUSTIN connects COBOL CUSTOMER-FILE to this dataset"),
    ],
    [
      "external nodes stay honest about source location",
      externalOverview.includes("outside this codebase") && externalOverview.includes("Source: external."),
    ],
    [
      "summary evidence starts from source and caps cited graph facts",
      programEvidence.length === 6 &&
        programEvidence[0].label === "LINEAGE source" &&
        programEvidence[0].file === "src/LINEAGE.cbl" &&
        programEvidence[0].line === 1 &&
        programEvidence[0].endLine === 47 &&
        programEvidence.some((citation) => citation.label === "LINEAGE writes REPORT-RECORD"),
    ],
    [
      "external evidence omits missing source but keeps graph relationship citations",
      externalEvidence.length === 1 &&
        externalEvidence[0].label === "LINK RATEAPI links RATEAPI" &&
        externalEvidence[0].file === "src/LINEAGE.cbl",
    ],
    [
      "selected graph answer includes orientation, compact related nodes, and evidence highlights",
      selectedAnswer.text.includes("I answered from the graph") &&
        selectedAnswer.text.includes("Used by or reached from: STEP010") &&
        selectedAnswer.text.includes("CUSTOMER_TABLE +2 more") &&
        selectedAnswer.text.includes("Evidence highlights:") &&
        selectedAnswer.citations[0].label === "LINEAGE source" &&
        selectedAnswer.citations.every((citation) => citation.file && citation.line),
    ],
    [
      "selected graph answer citations are deduped by source range",
      selectedAnswer.citations.length === citationKeys(selectedAnswer.citations).size,
    ],
    [
      "guarded summary fallback preserves metadata and replaces text with graph-backed copy",
      fallback.nodeId === program.id &&
        fallback.provider === "ollama" &&
        fallback.model === "llama3.2" &&
        fallback.guarded === true &&
        fallback.guardReason === "missing citations" &&
        fallback.text.includes("Model note: missing citations") &&
        !fallback.text.includes("stale uncited model text"),
    ],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Summary graph smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        programEvidence: programEvidence.length,
        selectedCitations: selectedAnswer.citations.length,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function findNode(graph, id) {
  const match = graph.nodes.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Fixture node ${id} not found`);
  return match;
}

function citationKeys(citations) {
  return new Set(citations.map((citation) => `${citation.file}:${citation.line}:${citation.endLine ?? ""}`));
}
