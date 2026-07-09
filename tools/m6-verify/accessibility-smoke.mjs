#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appSource = await readFile(resolve(repoRoot, "src", "App.tsx"), "utf8");
const appShellSource = await readFile(resolve(repoRoot, "src", "AppShell.tsx"), "utf8");
const topBarSource = await readFile(resolve(repoRoot, "src", "topbar", "TopBar.tsx"), "utf8");
const navigatorRailSource = await readFile(resolve(repoRoot, "src", "navigator", "NavigatorRail.tsx"), "utf8");
const workspaceSource = await readFile(resolve(repoRoot, "src", "workspace", "WorkspacePane.tsx"), "utf8");
const workspaceSkipLinksSource = await readFile(resolve(repoRoot, "src", "workspace", "WorkspaceSkipLinks.tsx"), "utf8");
const inspectorPaneSource = await readFile(resolve(repoRoot, "src", "inspector", "InspectorPane.tsx"), "utf8");
const inspectorTabsSource = await readFile(resolve(repoRoot, "src", "inspector", "InspectorTabs.tsx"), "utf8");
const chatAnswerPanelSource = await readFile(resolve(repoRoot, "src", "inspector", "ChatAnswerPanel.tsx"), "utf8");
const summaryDockSource = await readFile(resolve(repoRoot, "src", "inspector", "SummaryDock.tsx"), "utf8");
const messagePartsSource = await readFile(resolve(repoRoot, "src", "inspector", "MessageParts.tsx"), "utf8");
const uiSource = `${appSource}\n${appShellSource}\n${topBarSource}\n${navigatorRailSource}\n${workspaceSource}\n${workspaceSkipLinksSource}\n${inspectorPaneSource}\n${inspectorTabsSource}\n${chatAnswerPanelSource}\n${summaryDockSource}\n${messagePartsSource}`;
const appCss = await readFile(resolve(repoRoot, "src", "App.css"), "utf8");
const graphViewSource = await readFile(resolve(repoRoot, "src", "graph", "GraphView.tsx"), "utf8");

const checks = {
  "workspace exposes skip links before the top bar": appearsInOrder(appShellSource, [
    'className="workspace"',
    '<WorkspaceSkipLinks',
    '<TopBar',
  ]) && includesAll(workspaceSkipLinksSource, ['className="skip-links"', 'href="#navigator-panel"']),
  "skip links target the major work areas": includesAll(uiSource, [
    'href="#navigator-panel"',
    'href="#dependency-graph"',
    'href="#inspector-panel"',
    'id="navigator-panel"',
    'id="dependency-graph"',
    'id="inspector-panel"',
  ]),
  "skip targets are programmatically focusable landmarks": includesAll(uiSource, [
    'aria-label="Navigator" tabIndex={-1}',
    'aria-label="Workspace"',
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
  "graph node list can be toggled with button state": includesAll(uiSource, [
    'aria-pressed={showGraphNodeList}',
    'aria-label={showGraphNodeList ? "Hide the list of visible nodes" : "List the nodes visible on the map"}',
    'className="toggle-button"',
  ]),
  "Ask and citation controls remain named": includesAll(uiSource, [
    'aria-label="Ask about the codebase"',
    'aria-label="Answer route"',
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
