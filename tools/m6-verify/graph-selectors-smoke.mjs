#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-graph-selectors-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
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
  const selectorsPath = existsSync(resolve(tempRoot, "lib", "graphSelectors.js"))
    ? resolve(tempRoot, "lib", "graphSelectors.js")
    : resolve(tempRoot, "graphSelectors.js");
  const {
    codebaseInventoryCounts,
    firstFocusableNode,
    graphHintSourceUnits,
    graphSearchResults,
    searchResultScore,
    sourceFilesForGraph,
    sourceTreeGroups,
  } = require(selectorsPath);
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const lineage = graph.nodes.find((node) => node.id === "prog:LINEAGE");
  const customerCopybook = graph.nodes.find((node) => node.id === "copy:CUSTOMER");
  const sourceFiles = sourceFilesForGraph(graph);
  const groups = sourceTreeGroups(graph);
  const groupSummary = Object.fromEntries(groups.map((group) => [group.title, group.nodes.map((node) => node.id)]));
  const graphWithOrphans = {
    ...graph,
    nodes: [
      ...graph.nodes,
      { id: "copy:ORPHAN-A", type: "copybook", name: "ORPHAN-A", file: "copybook/ORPHAN-A.cpy", lines: [1, 3] },
      { id: "prog:ORPHAN-B", type: "program", name: "ORPHAN-B", file: "src/ORPHAN-B.cbl", lines: [1, 8] },
      { id: "prog:EXTERNAL-ONLY", type: "program", name: "EXTERNAL-ONLY", external: true },
    ],
  };

  const assertions = [
    [
      "empty inventory counts are stable",
      shallowEqual(codebaseInventoryCounts(null), { programs: 0, copybooks: 0, jobs: 0, steps: 0, external: 0 }),
    ],
    [
      "fixture inventory counts source-backed units and external refs",
      shallowEqual(codebaseInventoryCounts(graph), { programs: 1, copybooks: 2, jobs: 1, steps: 1, external: 3 }),
    ],
    ["first focusable node prefers the source-backed program", firstFocusableNode(graph) === "prog:LINEAGE"],
    [
      "source tree groups stay navigational",
      shallowEqual(groupSummary, {
        Programs: ["prog:LINEAGE"],
        Copybooks: ["copy:CUSTOMER", "copy:REPORT"],
        JCL: ["job:DAILYLN", "step:DAILYLN/STEP010"],
      }),
    ],
    [
      "source file switcher chooses representative source units",
      shallowEqual(
        sourceFiles.map((entry) => [entry.file, entry.node.id]),
        [
          ["copybook/CUSTOMER.cpy", "copy:CUSTOMER"],
          ["copybook/REPORT.cpy", "copy:REPORT"],
          ["jcl/DAILYLN.jcl", "job:DAILYLN"],
          ["src/LINEAGE.cbl", "prog:LINEAGE"],
        ],
      ),
    ],
    ["fixture graph has no graph hint source units", graphHintSourceUnits(graph).length === 0],
    [
      "graph hint source units are sorted and limited",
      shallowEqual(graphHintSourceUnits(graphWithOrphans, 1).map((node) => node.id), ["copy:ORPHAN-A"]),
    ],
    [
      "symbol search keeps exact program matches focused",
      searchResultScore(lineage, "lineage") === 0 && searchResultScore(customerCopybook, "lineage") === null,
    ],
    ["empty graph search has no results", graphSearchResults(null, "customer").length === 0 && graphSearchResults(graph, "   ").length === 0],
    [
      "graph search returns stable ranked symbol results",
      shallowEqual(
        graphSearchResults(graph, "customer").map((node) => node.id),
        [
          "copy:CUSTOMER",
          "data:CUSTOMER-BALANCE",
          "data:CUSTOMER-ID",
          "data:CUSTOMER-NAME",
          "data:CUSTOMER-RECORD",
          "data:CUSTOMER-STATUS",
          "dataset:CUSTOMER-FILE",
          "db2:CUSTOMER_TABLE",
          "dataset:BANK.CUSTOMER.MASTER",
        ],
      ),
    ],
    [
      "graph search respects the visible result limit",
      shallowEqual(graphSearchResults(graph, "cust", 3).map((node) => node.id), [
        "copy:CUSTOMER",
        "data:CUSTOMER-BALANCE",
        "data:CUSTOMER-ID",
      ]),
    ],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Graph selectors smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        counts: codebaseInventoryCounts(graph),
        sourceFiles: sourceFiles.length,
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
