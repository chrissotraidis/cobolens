#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appSource = await readFile(resolve(repoRoot, "src", "App.tsx"), "utf8");
const appCss = await readFile(resolve(repoRoot, "src", "App.css"), "utf8");
const graphViewSource = await readFile(resolve(repoRoot, "src", "graph", "GraphView.tsx"), "utf8");

const checks = {
  "workspace exposes skip links before the top bar": appearsInOrder(appSource, [
    'className="workspace"',
    'className="skip-links"',
    'href="#navigator-panel"',
    '<header className="topbar">',
  ]),
  "skip links target the major work areas": includesAll(appSource, [
    'href="#navigator-panel"',
    'href="#dependency-graph"',
    'href="#code-panel"',
    'href="#inspector-panel"',
    'id="navigator-panel"',
    'id="dependency-graph"',
    'id="code-panel"',
    'id="inspector-panel"',
  ]),
  "skip targets are programmatically focusable landmarks": includesAll(appSource, [
    'aria-label="Navigator" tabIndex={-1}',
    'aria-label="Dependency graph"',
    'aria-label="Source code" tabIndex={-1}',
    'aria-label="Inspector" tabIndex={-1}',
  ]),
  "skip links are visually hidden until keyboard focus": includesAll(appCss, [
    ".skip-links",
    "pointer-events: none",
    ".skip-links a:focus-visible",
    "transform: translateY(0)",
    "opacity: 1",
  ]),
  "landmark focus rings are visible": includesAll(appCss, [
    ".left-pane:focus-visible",
    ".graph-pane:focus-visible",
    ".code-panel:focus-visible",
    ".chat-panel:focus-visible",
    "outline: 2px solid rgba(102, 194, 165, 0.88)",
  ]),
  "graph canvas has keyboard-accessible node controls": includesAll(graphViewSource, [
    'aria-label="Visible graph nodes"',
    "aria-current={node.isFocus ? \"true\" : undefined}",
    "`Current focus ${node.label}`",
    "`Focus ${node.label}`",
    "onClick={() => activateVisibleNode(node.id)}",
  ]),
  "graph node list can be toggled with button state": includesAll(appSource, [
    'aria-pressed={showGraphNodeList}',
    'aria-label={showGraphNodeList ? "Hide visible node list" : "Show visible node list"}',
    'className="toggle-button"',
  ]),
  "Ask and citation controls remain named": includesAll(appSource, [
    'aria-label="Ask about the codebase"',
    'aria-label="Suggested questions"',
    "aria-label={`Open citation ${citation.label} at ${citationSite(citation)}`}",
    'aria-live="polite"',
  ]),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) {
  console.error(`Accessibility smoke failed: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(JSON.stringify({ checks }, null, 2));

function includesAll(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

function appearsInOrder(text, fragments) {
  let offset = -1;
  for (const fragment of fragments) {
    const next = text.indexOf(fragment, offset + 1);
    if (next === -1) return false;
    offset = next;
  }
  return true;
}
