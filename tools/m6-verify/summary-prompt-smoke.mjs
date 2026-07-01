#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const summariesSource = await readFile(resolve(repoRoot, "src", "model", "summaries.ts"), "utf8");

const checks = {
  "local summary budget is smaller than cloud budget":
    summariesSource.includes("const LOCAL_SUMMARY_MAX_OUTPUT_TOKENS = 260") &&
    summariesSource.includes("const CLOUD_SUMMARY_MAX_OUTPUT_TOKENS = 420"),
  "summary generation uses provider-aware budget": summariesSource.includes("maxOutputTokens: summaryMaxOutputTokens(settings)"),
  "Ollama summary prompt asks for brief answers": summariesSource.includes("keep local Ollama summaries brief so they return quickly"),
  "summary system forbids footnote citations": summariesSource.includes("never use bracketed footnotes like [1]"),
  "summary prompt requires citation-ended units": summariesSource.includes("End every bullet or sentence with an exact inline source citation"),
  "cloud summary prompt keeps fuller answer allowance": summariesSource.includes("Summarize this unit in 2-4 direct sentences."),
  "summary system uses only graph and source": summariesSource.includes("Use only the provided graph facts and source excerpt."),
  "summary system requires citations": summariesSource.includes("Cite file:line or file:start-end for every concrete claim."),
  "summary prompt starts with proven graph facts": summariesSource.includes("Start with what the graph proves about this unit"),
  "summary prompt requires cited relationships": summariesSource.includes("mention at least one relationship with its exact file:line citation"),
  "summary prompt forbids invented purpose": summariesSource.includes("Do not invent dependencies, business purpose, or business rules."),
  "summary output is citation guarded": summariesSource.includes("guardUnitSummaryText") &&
    summariesSource.includes("artifactLabel: \"model summary\""),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`Summary prompt smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(JSON.stringify({ checks }, null, 2));
