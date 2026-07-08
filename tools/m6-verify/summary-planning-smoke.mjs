#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-summary-planning-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/inspector/summaryPlanning.ts",
      "src/export/docs.ts",
      "src/lib/graphSelectors.ts",
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
  const planningPath = existsSync(resolve(tempRoot, "inspector", "summaryPlanning.js"))
    ? resolve(tempRoot, "inspector", "summaryPlanning.js")
    : resolve(tempRoot, "summaryPlanning.js");
  const { estimateBulkSummaryTokens, summaryGenerationNodes } = require(planningPath);
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const nodes = summaryGenerationNodes(graph);

  const assertions = [
    ["empty summary planning has no nodes", summaryGenerationNodes(null).length === 0],
    [
      "summary planning keeps source-backed program, paragraph, and copybook units",
      shallowEqual(nodes.map((node) => node.id), [
        "copy:CUSTOMER",
        "copy:REPORT",
        "para:LINEAGE/BUILD-REPORT",
        "prog:LINEAGE",
      ]),
    ],
    ["summary planning excludes external programs", !nodes.some((node) => node.external || !node.file)],
    ["bulk summary estimate preserves current token heuristic", estimateBulkSummaryTokens(nodes) === 3633],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Summary planning smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        summaryNodes: nodes.length,
        bulkTokenEstimate: estimateBulkSummaryTokens(nodes),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function shallowEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
