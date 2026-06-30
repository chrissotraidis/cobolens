#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-export-docs-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/export/docs.ts",
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
  const { buildDocumentationExport } = require(resolve(tempRoot, "export", "docs.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const docs = buildDocumentationExport(graph, {}, "prog:LINEAGE");
  const assertions = [
    ["graph-derived summaries", docs.markdown.includes("Summary: graph-derived, no model required")],
    ["lineage and impact section", docs.markdown.includes("## Lineage and Impact")],
    ["cited CUSTOMER-ID flow", docs.markdown.includes("CUSTOMER-ID moves-to REPORT-ID at src/LINEAGE.cbl:31")],
    ["no empty generated-summary placeholder", !docs.markdown.includes("No generated summary yet.")],
    ["navigable table of contents", docs.markdown.includes("## Table of Contents")],
    ["links to focused program summary", docs.markdown.includes("- [LINEAGE summary](#summary-lineage)")],
    ["links to lineage section", docs.markdown.includes("- [CUSTOMER-ID lineage](#lineage-customer-id)")],
    ["mermaid diagram", docs.mermaid.includes("flowchart LR")],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Export documentation smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        markdownBytes: Buffer.byteLength(docs.markdown),
        mermaidBytes: Buffer.byteLength(docs.mermaid),
        checks: Object.fromEntries(assertions),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
