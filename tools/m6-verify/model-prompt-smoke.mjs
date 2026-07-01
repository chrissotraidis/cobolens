#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-model-prompt-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/model/prompts.ts",
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
  const { groundedAnswerSystemPrompt } = require(resolve(tempRoot, "prompts.js"));
  const prompt = groundedAnswerSystemPrompt("JavaScript");
  const checks = {
    "mentions Rosetta language": prompt.includes("JavaScript terms"),
    "keeps graph-only grounding": prompt.includes("Use only the provided graph relationships and source excerpts."),
    "uses selected symbol for pronouns": prompt.includes("use the Selected symbol from the context as the referent"),
    "requires relationship direction": prompt.includes("Use relationship direction exactly as listed in Graph relationships."),
    "requires citations": prompt.includes("Cite file:line or file:start-end for every concrete claim."),
    "forbids footnote citations": prompt.includes("never use bracketed footnotes like [1]"),
    "requires inline behavioral citations": prompt.includes("Every sentence that states behavior"),
    "distinguishes files from databases": prompt.includes("Do not call a COBOL file a database"),
    "forbids invented graph facts": prompt.includes("Never invent files, nodes, edges, jobs, datasets, or line numbers."),
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Model prompt smoke failed: ${failed.join(", ")}`);
    console.error(prompt);
    process.exit(1);
  }

  console.log(JSON.stringify({ promptBytes: Buffer.byteLength(prompt), checks }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
