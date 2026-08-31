#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-question-contract-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(resolve(repoRoot, tsc), [
    "src/inspector/questionQuality.ts",
    "--target", "ES2022",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--outDir", tempRoot,
    "--skipLibCheck",
  ], { cwd: repoRoot, encoding: "utf8" });
  if (compile.status !== 0) {
    process.stderr.write(compile.stdout);
    process.stderr.write(compile.stderr);
    process.exit(compile.status ?? 1);
  }

  const require = createRequire(resolve(tempRoot, "smoke.cjs"));
  const { inputQualityMessage } = require(resolve(tempRoot, "questionQuality.js"));
  const askGenerationSource = await readFile(resolve(repoRoot, "src", "inspector", "useAskGeneration.ts"), "utf8");
  const assertions = [
    ["selected-context purpose question is accepted", inputQualityMessage("What does this do?", true) === ""],
    ["selected-context dependency question is accepted", inputQualityMessage("Who calls it?", true) === ""],
    ["context-free vague question is rejected", Boolean(inputQualityMessage("What does this do?", false))],
    ["truly incomplete input is rejected", Boolean(inputQualityMessage("what?", true))],
    ["complete explicit question is accepted", inputQualityMessage("What does LINEAGE do?", false) === ""],
    ["answer completion never changes workspace selection", !askGenerationSource.includes("onSyncFocusNode") && !askGenerationSource.includes("shouldSyncAskFocus")],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Question contract smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ checks: Object.fromEntries(assertions) }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
