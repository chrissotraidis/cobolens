#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoot = await mkdtemp(resolve(tmpdir(), "cobolens-citation-focus-"));

try {
  await writeFile(resolve(tempRoot, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = process.platform === "win32" ? "node_modules/.bin/tsc.cmd" : "node_modules/.bin/tsc";
  const compile = spawnSync(
    resolve(repoRoot, tsc),
    [
      "src/source/citationFocus.ts",
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
  const { edgeLabel } = require(resolve(tempRoot, "lib", "graph.js"));
  const { resolveCitationTarget } = require(resolve(tempRoot, "source", "citationFocus.js"));
  const graph = JSON.parse(await readFile(resolve(repoRoot, "public", "m6-bakeoff-graph.json"), "utf8"));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const movementEdge = graph.edges.find(
    (edge) => edge.type === "moves-to" && edge.site?.file === "src/LINEAGE.cbl" && edge.site.line === 31,
  );
  if (!movementEdge) {
    console.error("Citation focus smoke failed: fixture is missing CUSTOMER-ID movement edge");
    process.exit(1);
  }

  const movementCitation = {
    file: movementEdge.site.file,
    line: movementEdge.site.line,
    label: edgeLabel(movementEdge, graph),
  };
  const edgeFallback = resolveCitationTarget({ graph, nodeById, citation: movementCitation });
  const explicitNode = resolveCitationTarget({
    graph,
    nodeById,
    citation: { ...movementCitation, nodeId: "data:REPORT-ID" },
  });
  const rangeFallback = resolveCitationTarget({
    graph,
    nodeById,
    citation: { file: "src/LINEAGE.cbl", line: 21, label: "LINEAGE source" },
  });
  const wrongLabel = resolveCitationTarget({
    graph,
    nodeById,
    citation: { ...movementCitation, label: "CUSTOMER-ID reads REPORT-ID" },
  });
  const missing = resolveCitationTarget({
    graph,
    nodeById,
    citation: { file: "src/MISSING.cbl", line: 1, label: "Missing source" },
  });

  const assertions = [
    ["edge citation resolves matching relationship", edgeFallback.edge === movementEdge],
    ["edge citation falls back to edge source node", edgeFallback.node?.id === movementEdge.from],
    ["explicit node id wins over edge source fallback", explicitNode.edge === movementEdge && explicitNode.node?.id === "data:REPORT-ID"],
    ["source-line citation falls back to containing node", !rangeFallback.edge && rangeFallback.node?.id === "prog:LINEAGE"],
    ["relationship labels must match before selecting an edge", !wrongLabel.edge && wrongLabel.node?.id === "prog:LINEAGE"],
    ["unknown citation has no target", !missing.edge && !missing.node],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    console.error(`Citation focus smoke failed: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        checked: assertions.length,
        relationship: movementCitation.label,
        sourceFallback: `${rangeFallback.node.name}:${rangeFallback.node.lines.join("-")}`,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
