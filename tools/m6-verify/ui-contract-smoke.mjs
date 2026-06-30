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
    "Inspector tabs reserve enough width for Summary and Impact",
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
