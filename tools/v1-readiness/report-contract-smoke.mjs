#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = await readFile(resolve(repoRoot, "tools", "v1-readiness", "run.mjs"), "utf8");
const readme = await readFile(resolve(repoRoot, "tools", "v1-readiness", "README.md"), "utf8");

const checks = {
  "ready requires required gates": source.includes("ready: requiredPassed && optionalEvidenceClean && optionalEvidenceComplete"),
  "ready requires optional failures clean": source.includes("const optionalEvidenceClean = failedOptional.length === 0"),
  "ready requires optional skips complete": source.includes("const optionalEvidenceComplete = skippedOptional.length === 0"),
  "runner includes PRD coverage audit": source.includes('required("V1 PRD coverage audit"') && source.includes("prd-coverage-smoke.mjs"),
  "exit code follows required gates only": source.includes("process.exit(report.requiredPassed ? 0 : 1)"),
  "report exposes optional clean flag": source.includes("optionalEvidenceClean"),
  "report exposes optional complete flag": source.includes("optionalEvidenceComplete"),
  "docs explain PRD coverage audit": readme.includes("PRD-coverage smoke checks `docs/v1-readiness-audit.md`"),
  "docs explain stricter ready field": readme.includes("The final `ready` field is stricter"),
  "docs explain required-gate exit code": readme.includes("Only required-gate failure exits non-zero"),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`V1 readiness report contract smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(JSON.stringify({ checks }, null, 2));
