#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const audit = await readFile(resolve(repoRoot, "docs", "v1-readiness-audit.md"), "utf8");

const checks = {
  "audit names PRD as source of truth": audit.includes("`docs/COBOL-Lens-PRD.md`"),
  "audit has current verdict": audit.includes("Current verdict:"),
  "audit lists evidence commands": audit.includes("## Evidence Commands") && audit.includes("npm run v1:readiness"),
  "audit accounts for all FR ids": Array.from({ length: 32 }, (_, index) => `FR-${index + 1}`).every((id) =>
    audit.includes(`| ${id} `),
  ),
  "audit distinguishes partial coverage": audit.includes("Partial/Should") && audit.includes("Not implemented/guardrail noted"),
  "audit caveats embeddings": audit.includes("Vector embeddings are not implemented"),
  "audit caveats Windows packaging": audit.includes("Windows packaging"),
  "audit documents local Ollama risk": audit.includes("Local Ollama quality and speed"),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`V1 PRD coverage smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(JSON.stringify({ checks }, null, 2));
