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
      "Ask a graph question or type a broader explanation",
    ]),
  ],
  [
    "Ask answer subtitle follows the displayed answer, not stale draft text",
    includesAll(appSource, [
      "const answerWasModelQuestion = Boolean(answer && !isGraphQuestion(answer.question))",
      "answer?.fallbackReason",
      "Answered from the graph",
      "Cited graph fallback",
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
      "`Explain ${node.name} in plain English.`",
      "shouldSyncAskFocus(question)",
      "codebase\\s+overview",
    ]) &&
      includesAll(appSource, ["{visibleStarterQuestions.map((question) => {", "PROVIDER_LABELS[settings.provider]"]) &&
      !appSource.includes("const explainQuestion =") &&
      includesAll(appCss, [".question-chips button small", "text-transform: uppercase"]),
  ],
  [
    "Guarded Ask answers use the richer graph fallback",
    includesAll(appSource, [
      "answer.guarded",
      "graphAnswerFallback(",
      "graph,",
      "question,",
      "answerContext,",
      "model answer had ${answer.guardReason ?? \"citation issues\"}",
      "text: displayedAnswer.text",
      "citations: displayedAnswer.citations",
      'source: answer.guarded ? "graph" : "model"',
    ]),
  ],
  [
    "Ask response has a visible framed style",
    includesAll(appCss, [".answer-response", "min-height: 84px", "background: rgba(17, 21, 26, 0.68)"]),
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
    "Summary can show a cited graph explanation for the selected node",
    includesAll(appSource, [
      "function explainSelectedNode()",
      "function askAboutSelectedNode()",
      "function selectedNodeGraphAnswer",
      "I matched the selected",
      'provider: "graph"',
      'model: "deterministic"',
      "answered from graph facts without a model",
      "Return Summary to the cited graph overview",
      "Use graph overview",
      "Ask follow-up",
      "plain-English follow-up for this symbol",
      "onExplainNode={explainSelectedNode}",
      "onAskFollowUp={askAboutSelectedNode}",
      "setChatQuestion(`Explain ${selectedNode.name} in plain English.`)",
      "setChatAnswer(null)",
      'setChatStatus("idle")',
      'setInspectorTab("summary")',
    ]) && includesAll(appCss, [".summary-action-buttons", "grid-template-columns: repeat(2, minmax(0, 1fr))", ".summary-wide-action"]),
  ],
  [
    "Guarded AI summaries are clearly labeled as graph fallbacks",
    includesAll(appSource, [
      "state.summary.guarded",
      "Showing a cited graph overview:",
      "graphBackedSummaryFallback",
      "model summary had ${summary.guardReason ?? \"citation issues\"}",
      "Model note: ${reason}",
      'className="summary-guard-note"',
      'role="status"',
    ]) && includesAll(appCss, [".summary-guard-note", "rgba(229, 199, 95, 0.08)"]),
  ],
  [
    "Bulk summaries continue after model fallback but stop on explicit cancel",
    includesAll(appSource, [
      'type SummaryGenerationResult = "ready" | "fallback" | "stopped"',
      "let fallbackCount = 0",
      "generated === \"stopped\"",
      "generated === \"fallback\"",
      "bulkSummaryProgressLabel(index + 1, summaryNodes.length, fallbackCount)",
      "function isStoppedModelCall(message: string)",
      "function bulkSummaryProgressLabel(done: number, total: number, fallbackCount: number)",
      "if (isStoppedModelCall(fallbackReason))",
      "[node.id]: { status: \"error\", error: fallbackReason }",
      "[node.id]: { status: \"ready\", summary: fallbackSummary }",
      "return \"fallback\";",
      "graph fallback${fallbackCount === 1 ? \"\" : \"s\"}",
      "setBulkSummaryStatus(`Stopped at ${index}/${summaryNodes.length}`)",
    ]),
  ],
  [
    "Ask clearly distinguishes graph shortcuts from AI-backed questions",
    includesAll(appSource, [
      "const activeRouteLabel = workingWithModel",
      "AI answer",
      "Graph answer",
      "Instant, cited answer from the dependency graph.",
      "gets only the retrieved, cited source context.",
      'className={`answer-route ${workingWithModel ? "model" : "graph"}`}',
      "Ask Graph",
      "Ask AI",
      "modelReadiness.status !== \"idle\"",
      'className={`ask-readiness ${modelReadiness.status}`}',
      "Ready to ask",
      "Ready to answer instantly from the dependency graph.",
      "Ask about data flow, dependencies, files, or behavior.",
      "Still waiting on local Ollama; this request times out at 45s.",
      "Stop is available",
      "try ${RECOMMENDED_SMALL_OLLAMA_MODEL}",
      "const visibleStarterQuestions = starterQuestions.filter((starterQuestion) => starterQuestion !== answer?.question)",
      'const starterQuestionsLabel = answer ? "Ask another cited question" : "Try a cited question"',
      "{visibleStarterQuestions.map((question) => {",
      "const graphQuestion = isGraphQuestion(question)",
      "Answer instantly from the graph",
      "Prepare ${PROVIDER_LABELS[settings.provider]} prompt",
      "aria-label={`${chipAction}: ${question}`}",
      "if (!isGraphQuestion(question))",
      'setChatStatus("idle")',
      "if (isStoppedModelCall(fallbackReason))",
      'setChatError(fallbackReason)',
      'setChatStatus("error")',
      "EvidenceList citations={answer.citations.slice(0, 8)}",
      'aria-label="Current Ask focus"',
      "focusLinkCount",
    ]) && appearsInOrder(appSource, [
      "const fallbackReason = friendlyModelError(err, modelSettings);",
      "if (isStoppedModelCall(fallbackReason))",
      "if (context)",
    ]) && includesAll(appCss, [".answer-route", ".answer-route.graph", ".answer-route.model", ".ask-readiness.error", ".ask-focus-strip"]),
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
      "function refreshInstalledModels()",
      "Reading installed Ollama models",
      "Refresh models",
      "installedModels: readiness.installedModels",
      "suggestedModel: details.suggestedModel",
      "installedModels: isCloudProvider(modelSettings.provider) ? [] : current.installedModels",
      "RECOMMENDED_SMALL_OLLAMA_MODEL",
      "function prioritizedOllamaModels(models: string[], currentModel: string)",
      'const badge = isCurrent ? "Current" : isRecommendedSmall ? "Fast local" : ""',
      'aria-label={`${isCurrent ? "Current model" : "Use model"} ${model}${isRecommendedSmall ? ", recommended small local model" : ""}`}',
      'className="model-chip-name"',
      "For a smaller local test model, run:",
      "isSameOllamaModel(model, settings.model)",
      "ollamaReadinessDetails",
      "verifyGeneration: true",
      "generationTimeoutMs: MODEL_READINESS_TIMEOUT_MS",
      "const readiness = await inspectOllamaReadiness(modelSettings);",
      "installedModels: readiness.installedModels",
    ]) && includesAll(appSource, ['from "./model/readiness"', 'aria-label="Installed Ollama models"']) && includesAll(appCss, [".model-chips", ".model-chip-name", ".model-chips button small", ".model-install-hint", ".button-row.two"]),
  ],
  [
    "Right pane remains usable at default desktop browser widths",
    includesAll(appCss, [
      "@media (max-width: 1280px) and (min-width: 901px)",
      "minmax(360px, 33vw)",
      ".shell.is-ask-focused",
      "minmax(410px, 46vw)",
      "white-space: pre-wrap",
      "overflow-wrap: anywhere",
    ]),
  ],
  [
    "Tablet and mobile breakpoints keep code and graph toolbar usable",
    includesAll(appCss, [
      "@media (max-width: 900px)",
      "@media (max-width: 760px)",
      ".source-line-text",
      "white-space: pre-wrap",
      ".button-row.two",
      "grid-template-columns: minmax(0, 1fr);",
      ".graph-toolbar button",
      "min-width: 88px",
    ]),
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
        "top: 0",
        "grid-template-columns: minmax(0, 1fr) 92px",
      ]),
  ],
  [
    "Inspector opens on Summary and keeps Ask as the conversational follow-up",
    includesAll(appSource, [
      'useState<InspectorTab>("summary")',
      'setInspectorTab("summary")',
      'label: "Summary"',
      'label: "Ask"',
      'label: "Links"',
      "aria-label={tab.badge ? `${tab.label} (${tab.badge})` : tab.label}",
    ]) &&
      appearsInOrder(appSource, ['{ id: "summary", label: "Summary"', '{ id: "ask", label: "Ask" }']) &&
      includesAll(appCss, [".inspector-tabs", "minmax(92px, 1fr)", "minmax(74px, 0.8fr)"]),
  ],
  [
    "Scrollable panes use dark native scrollbars",
    includesAll(appCss, ["scrollbar-color: #303843 #101419", "*::-webkit-scrollbar-thumb", "background: #303843"]),
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
      "focusedCitation={Boolean(",
      'className={`source-view${focusedCitation ? " has-focused-citation" : ""}`}',
      'className="source-focus-note"',
      "Focused citation: {snippet.file}:{snippet.highlightLine}",
      "Focused citation line",
    ]) && includesAll(appCss, [".source-view.has-focused-citation", ".source-focus-note", ".sr-only"]),
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
    "Empty graph canvas guides first-run sample/folder, optional AI, and desktop-only folder open",
    includesAll(graphViewSource, [
      'className="graph-empty-card"',
      "First run",
      "Start with the bundled sample or open a COBOL folder. AI is optional; the map and cited source work first.",
      'className="graph-empty-steps"',
      "Load a sample or folder.",
      "Inspect the dependency map.",
      "Add a model later for Summary and Ask.",
      "onOpenSample",
      "canOpenFolder",
      "Open Folder runs in the desktop app.",
    ]) &&
      includesAll(appSource, ['className={`graph-pane${focusedNode ? "" : " is-empty"}`}', "focusedNode ? ("]) &&
      includesAll(appCss, [".graph-pane.is-empty", ".graph-empty-actions", ".graph-empty-actions span", ".graph-empty-steps"]),
  ],
  [
    "Browser preview does not render desktop-only ingest actions as disabled primary buttons and shows the first-run path",
    includesAll(appSource, [
      "desktopAvailable ?",
      "Open Folder, Re-scan, and scan settings run in the desktop app.",
      'className="desktop-preview-note"',
      'className="first-run-guide"',
      "Explore the map and cited source without AI.",
      "Add Ollama or a cloud key when you want Summary and Ask.",
      "{desktopAvailable ? (",
      "<ScanSettingsPanel",
    ]) && includesAll(appCss, [".desktop-preview-note", "background: rgba(125, 137, 150, 0.07)", ".first-run-guide"]),
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
    "Graph slice has keyboard-accessible visible node controls",
    includesAll(graphViewSource, [
      "const visibleNodeControls = useMemo",
      'className="graph-node-list"',
      'aria-label="Visible graph nodes"',
      "showNodeList ?",
      "aria-current={node.isFocus ? \"true\" : undefined}",
      "`Current focus ${node.label}`",
      "`Focus ${node.label}`",
      "`Expand hidden ${node.label} neighbors`",
      "function activateVisibleNode(nodeId: string)",
      "slice.syntheticNodeIds.has(nodeId)",
    ]) &&
      includesAll(appCss, [
        "button:focus-visible",
        ".graph-node-list",
        '.graph-node-list button[aria-current="true"]',
        ".graph-node-list > div",
      ]),
  ],
  [
    "Graph toolbar explains when the focused slice has no hidden direct neighbors",
    includesAll(appSource, [
      "focusedNode ? (",
      'const expandButtonLabel = focusExpanded ? "Collapse" : focusExpansion.hiddenByLimit ? "Expand" : "Focus complete"',
      "No hidden direct neighbors for this focus; use search or the Codebase browser to jump elsewhere.",
      "{focusedNode.name}",
      "aria-label={expandButtonTitle}",
      "showGraphNodeList",
      "setShowGraphNodeList",
      'aria-label={showGraphNodeList ? "Hide visible node list" : "Show visible node list"}',
      '{showGraphNodeList ? "Hide nodes" : "Show nodes"}',
      "showNodeList={showGraphNodeList}",
    ]) && includesAll(appCss, [".graph-toolbar button", "min-width: 112px", ".graph-toolbar > .graph-toolbar-actions"]),
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
      "function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>)",
      'event.key === "Enter" && searchResults[0]',
      "focusOnSearchResult(searchResults[0].id)",
      'event.key === "Escape" && query',
      "onKeyDown={handleSearchKeyDown}",
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
