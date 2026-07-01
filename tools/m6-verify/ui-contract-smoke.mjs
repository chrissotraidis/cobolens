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
    "Ask composer appears before response and suggestions",
    appearsInOrder(appSource, ['className="answer-header"', 'className="chat-composer"', 'className="answer-response"', 'className="question-chips"']),
  ],
  [
    "Ask response contains progress, error, answer, and empty states",
    includesAll(appSource, [
      'className="answer-response"',
      'status === "running"',
      'status === "error"',
      "answer ?",
      "Graph shortcuts answer without a model",
    ]),
  ],
  [
    "Ask answer subtitle follows the displayed answer, not stale draft text",
    includesAll(appSource, [
      "const answerWasModelQuestion = Boolean(answer && !isGraphQuestion(answer.question))",
      "answer?.fallbackReason",
      "Answered from the graph",
      "Graph-grounded answer",
    ]) && !appSource.includes("Graph-grounded fallback; model answer unavailable"),
  ],
  [
    "Program Ask suggestions include concrete read/write graph questions",
    includesAll(appSource, [
      '"Give me a codebase overview."',
      "selectedNodeOverviewQuestion(node)",
      "`What files does ${name} read?`",
      "`What does ${name} write?`",
    ]),
  ],
  [
    "Ask suggestions expose a graph-only codebase overview first",
    includesAll(appSource, [
      'const overviewQuestion = "Give me a codebase overview."',
      "return [overviewQuestion, selectedOverview, `What depends on ${name}?`",
      "return [overviewQuestion, selectedOverview, `Where does ${name} flow?`",
      "`What does this ${type} do in plain English?`",
      "shouldSyncAskFocus(question)",
      "codebase\\s+overview",
    ]) &&
      appearsInOrder(appSource, ["{starterQuestions.map((question) => (", "{explainQuestion ? ("]) &&
      includesAll(appCss, [".question-chips button small", "text-transform: uppercase"]),
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
    "Ask keeps a bounded recent-answer trail with citations",
    includesAll(appSource, [
      "const [chatHistory, setChatHistory] = useState<ChatAnswer[]>([])",
      "function rememberChatAnswer(answer: ChatAnswer)",
      "function restoreChatAnswer(answer: ChatAnswer)",
      "fallbackReason?: string",
      'aria-label="Recent Ask answers"',
      "<summary>",
      "item.citations.length",
    ]) && includesAll(appCss, [".answer-history", ".answer-history summary", ".answer-history-list button"]),
  ],
  [
    "Ask answers read as a labeled question and answer exchange",
    includesAll(appSource, [
      'className="answer-turn"',
      "<span>Question</span>",
      "<span>Answer</span>",
      "MessageText text={answer.text}",
    ]) && includesAll(appCss, [".answer-turn", ".answer-turn > span", ".answer-turn > strong"]),
  ],
  [
    "Summary can seed a cited Ask explanation for the selected node",
    includesAll(appSource, [
      "function explainSelectedNode()",
      "function askAboutSelectedNode()",
      "function selectedNodeGraphAnswer",
      "I matched the selected",
      "Open Ask with a cited graph explanation",
      "Explain from graph",
      "Ask follow-up",
      "onExplainNode={explainSelectedNode}",
      "onAskFollowUp={askAboutSelectedNode}",
      "setChatQuestion(`Explain ${selectedNode.name} in plain English.`)",
      "setChatAnswer(null)",
      'setChatStatus("idle")',
    ]) && includesAll(appCss, [".summary-action-buttons", "grid-template-columns: repeat(2, minmax(0, 1fr))", ".summary-wide-action"]),
  ],
  [
    "Guarded AI summaries are clearly labeled as graph fallbacks",
    includesAll(appSource, [
      "state.summary.guarded",
      "Showing a cited graph answer because",
      'className="summary-guard-note"',
      'role="status"',
    ]) && includesAll(appCss, [".summary-guard-note", "rgba(229, 199, 95, 0.08)"]),
  ],
  [
    "Ask clearly distinguishes graph shortcuts from AI-backed questions",
    includesAll(appSource, [
      'className="answer-modes"',
      "Graph instant",
      "when needed",
      "Ask Graph",
      "modelReadiness.status !== \"idle\"",
      'className={`ask-readiness ${modelReadiness.status}`}',
      "Ready to ask",
      "Ready to answer instantly from the dependency graph.",
      "Use a graph shortcut for instant cited answers",
      "EvidenceList citations={answer.citations.slice(0, 8)}",
    ]) && includesAll(appCss, [".answer-modes", ".answer-modes span.is-active", ".ask-readiness.error"]),
  ],
  [
    "AI panel shows honest usage and bulk token estimate before model calls",
    includesAll(appSource, [
      'aria-label="AI usage and token estimate"',
      "Cloud calls this session",
      "Bulk summary input estimate",
      "Graph answers need no model",
      "send cited context to",
    ]) && includesAll(appCss, [".ai-usage", ".ai-usage p"]),
  ],
  [
    "Check AI verifies local generation without slowing every model call preflight",
    includesAll(appSource, [
      "Checking local generation with a quick probe",
      "inspectOllamaReadiness",
      "installedModels: readiness.installedModels",
      "suggestedModel: details.suggestedModel",
      "installedModels: isCloudProvider(modelSettings.provider) ? [] : current.installedModels",
      "For a smaller local test model, run:",
      "isSameOllamaModel(model, settings.model)",
      "ollamaReadinessDetails",
      "verifyGeneration: true",
      "generationTimeoutMs: MODEL_READINESS_TIMEOUT_MS",
      "const readiness = await inspectOllamaReadiness(modelSettings);",
      "installedModels: readiness.installedModels",
    ]) && includesAll(appSource, ['from "./model/readiness"', 'aria-label="Installed Ollama models"']) && includesAll(appCss, [".model-chips", ".model-chips button", ".model-install-hint"]),
  ],
  [
    "Ask composer remains available while reading answers",
    includesAll(appSource, ['inspectorTab === "ask" ? " is-ask-focused"', "autoFocus"]) &&
      appearsInOrder(appSource, ['<div className="chat-composer"', '<div className="answer-response"']) &&
      includesAll(appCss, [
        ".right-pane.is-ask-focused",
        "minmax(132px, 0.46fr) minmax(430px, 1.54fr)",
        ".chat-composer",
        "position: sticky",
        "top: -6px",
        "grid-template-columns: minmax(0, 1fr) 86px",
      ]),
  ],
  [
    "Inspector opens on Overview and keeps Ask as the conversational follow-up",
    includesAll(appSource, [
      'useState<InspectorTab>("summary")',
      'setInspectorTab("summary")',
      'label: "Overview"',
      'label: "Ask"',
      'label: "Links"',
      "aria-label={tab.badge ? `${tab.label} (${tab.badge})` : tab.label}",
    ]) &&
      appearsInOrder(appSource, ['{ id: "summary", label: "Overview"', '{ id: "ask", label: "Ask" }']) &&
      includesAll(appCss, [".inspector-tabs", "minmax(94px, 1.18fr)", "minmax(78px, 1fr)"]),
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
    "Relationship citations open the relationship detail",
    includesAll(appSource, [
      "const citedEdge = graph?.edges.find",
      "edgeLabel(edge, graph) === citation.label",
      "setSelectedEdge(citedEdge)",
      "preserveInspectorTab",
      'setInspectorTab("relationship")',
    ]),
  ],
  [
    "Ask evidence citations keep the answer visible while focusing code",
    includesAll(appSource, [
      "onOpenCitation={(citation) => jumpToCitation(citation, false, true)}",
      "const preserveInspectorForEdgeRef = useRef(false)",
      "if (preserveInspectorForEdgeRef.current)",
      "preserveInspectorForEdgeRef.current = false",
      "function jumpToCitation(citation: Citation, keepEdge = false, preserveInspectorTab = false)",
      "if (preserveInspectorTab) preserveInspectorForEdgeRef.current = true",
      'if (!preserveInspectorTab) setInspectorTab("relationship")',
    ]),
  ],
  [
    "Selected relationship detail explains endpoints and can refocus either node",
    includesAll(appSource, [
      "const fromNode = graph.nodes.find",
      "const toNode = graph.nodes.find",
      'className="relationship-flow"',
      'aria-label="Relationship endpoints"',
      "aria-label={`Focus relationship source ${fromName}`}",
      "aria-label={`Focus relationship target ${toName}`}",
      "onFocusNode(edge.from)",
      "onFocusNode(edge.to)",
      "This graph relationship records",
    ]) && includesAll(appCss, [".relationship-flow", ".relationship-node-button", ".relationship-edge-type"]),
  ],
  [
    "Empty graph canvas offers first-run sample and treats folder open as desktop-only in browser preview",
    includesAll(graphViewSource, [
      'className="graph-empty-card"',
      "Start with the bundled sample or open a COBOL folder.",
      "onOpenSample",
      "canOpenFolder",
      "Open Folder runs in the desktop app.",
    ]) && includesAll(appCss, [".graph-empty-actions", ".graph-empty-actions span"]),
  ],
  [
    "Browser preview does not render desktop-only ingest actions as disabled primary buttons",
    includesAll(appSource, [
      "desktopAvailable ?",
      "Open Folder, Re-scan, and scan settings run in the desktop app.",
      'className="desktop-preview-note"',
      "{desktopAvailable ? (",
      "<ScanSettingsPanel",
    ]) && includesAll(appCss, [".desktop-preview-note", "background: rgba(125, 137, 150, 0.07)"]),
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
    "Graph toolbar explains when the focused slice has no hidden direct neighbors",
    includesAll(appSource, [
      "focusedNode ? (",
      'const expandButtonLabel = focusExpanded ? "Collapse" : focusExpansion.hiddenByLimit ? "Expand" : "Focus complete"',
      "No hidden direct neighbors for this focus; use search or the Codebase browser to jump elsewhere.",
      "{focusedNode.name}",
      "aria-label={expandButtonTitle}",
    ]) && includesAll(appCss, [".graph-toolbar button", "min-width: 112px"]),
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
    "Symbol search keeps fuzzy matching focused on symbol names",
    includesAll(appSource, [
      "function searchResultScore(node: GraphNode, query: string)",
      "matchesFuzzy(name, needle)",
      "return null",
      "No matching symbols.",
    ]) &&
      !appSource.includes('matchesFuzzy(`${node.name} ${node.id} ${node.type}`, query)'),
  ],
  [
    "Left navigator keeps graph filters before secondary status panels",
    appearsInOrder(appSource, [
      "<h2>Symbols</h2>",
      "<h2>Legend & Filters</h2>",
      "<SourceTree",
      "<h2>Inventory</h2>",
      "<ModelSettingsPanel",
    ]) && includesAll(appSource, ['className="filter-grid"']) && includesAll(appCss, [".filter-grid", "repeat(2, minmax(0, 1fr))"]),
  ],
  [
    "Inventory distinguishes source-backed codebase units from external graph references",
    includesAll(appSource, [
      'if (node.external || !node.file) return acc;',
      'Metric label="Source programs"',
      'Metric label="External refs"',
      'Metric label="JCL jobs"',
    ]),
  ],
  [
    "Parse health surfaces analyzer dialect metadata",
    includesAll(appSource, ["Dialect: {graph.meta.dialectGuess || \"unknown\"}", "function ParseHealth"]),
  ],
  [
    "Parse health warning rows can jump to cited source lines",
    includesAll(appSource, [
      "onOpenWarning={jumpToCitation}",
      "onOpenWarning: (citation: Citation) => void",
      "parseErrorSite(error)",
      'label: "Parse warning"',
    ]) && includesAll(appCss, [".parse-warning-list button", "text-decoration: underline"]),
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
