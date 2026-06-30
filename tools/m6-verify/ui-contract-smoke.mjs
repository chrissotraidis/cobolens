#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appSource = await readFile(resolve(repoRoot, "src", "App.tsx"), "utf8");
const appCss = await readFile(resolve(repoRoot, "src", "App.css"), "utf8");
const graphViewSource = await readFile(resolve(repoRoot, "src", "graph", "GraphView.tsx"), "utf8");

const checks = [
  [
    "Ask answer renders before suggested-question chips",
    appearsInOrder(appSource, ['className="answer-header"', 'className="answer-response"', 'className="question-chips"']),
  ],
  [
    "Ask response contains progress, error, answer, and empty states",
    includesAll(appSource, [
      '<div className="answer-response">',
      'status === "running"',
      'status === "error"',
      "answer ?",
      "Ask graph questions for instant answers",
    ]),
  ],
  [
    "Ask response has a visible framed style",
    includesAll(appCss, [".answer-response", "min-height: 76px", "background: rgba(17, 21, 26, 0.68)"]),
  ],
  [
    "Ask and summary messages render structured text blocks",
    includesAll(appSource, ["function MessageText", "function textBlocks", 'block.type === "list"']) &&
      includesAll(appCss, [".message-text", ".message-text ul"]),
  ],
  [
    "Inspector tabs reserve enough width for Summary and Impact",
    includesAll(appSource, ['label: "Links"']) &&
      includesAll(appCss, [".inspector-tabs", "minmax(82px, 1.15fr)", "minmax(78px, 1fr)"]),
  ],
  [
    "Relationship source buttons expose section-specific accessible labels",
    includesAll(appSource, [
      "aria-label={`${title}: show ${edgeLabel(edge, graph)}",
      "Depends On",
      "Used By",
      'title="Lineage"',
    ]),
  ],
  [
    "Empty graph canvas offers first-run sample and folder actions",
    includesAll(graphViewSource, [
      'className="graph-empty-card"',
      "Start with the bundled sample or open a COBOL folder.",
      "onOpenSample",
      "canOpenFolder",
    ]) && includesAll(appCss, [".graph-empty-actions", "grid-template-columns: repeat(2, minmax(0, 1fr))"]),
  ],
  [
    "Graph LOD clusters can drill down by expanding their owner",
    includesAll(graphViewSource, [
      "syntheticNodeOwners",
      "ownerId === focusNodeId",
      "else if (ownerId) onSelectNode(ownerId)",
      "expandedNodeIds.has(focusNode.id) ? Number.MAX_SAFE_INTEGER : DIRECT_LIMIT_PER_TYPE",
    ]) && includesAll(appSource, ["function expandNode(nodeId: string)", "onExpandNode={expandNode}"]),
  ],
  [
    "Left navigator exposes a grouped codebase browser",
    includesAll(appSource, [
      "function SourceTree",
      'aria-label="Codebase browser"',
      '["Programs", ["program"]]',
      '["Copybooks", ["copybook"]]',
      '["JCL", ["jcl-job", "jcl-step"]]',
    ]) && includesAll(appCss, [".source-tree-list button.is-active", ".source-tree-heading"]),
  ],
  [
    "Parse health surfaces analyzer dialect metadata",
    includesAll(appSource, ["Dialect: {graph.meta.dialectGuess || \"unknown\"}", "function ParseHealth"]),
  ],
  [
    "Graph hints expose potentially unreferenced source units",
    includesAll(appSource, [
      "function GraphHints",
      'aria-label="Graph hints"',
      "Potentially unreferenced",
      "potentiallyUnreferencedSourceUnits",
    ]) && includesAll(appCss, [".graph-hints", ".hint-list button"]),
  ],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`UI contract smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      checks: Object.fromEntries(checks),
    },
    null,
    2,
  ),
);

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function appearsInOrder(text, needles) {
  let cursor = -1;
  for (const needle of needles) {
    const next = text.indexOf(needle, cursor + 1);
    if (next === -1) return false;
    cursor = next;
  }
  return true;
}
