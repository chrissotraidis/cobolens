#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appSource = await readFile(resolve(repoRoot, "src", "App.tsx"), "utf8");
const graphSelectorsSource = await readFile(resolve(repoRoot, "src", "lib", "graphSelectors.ts"), "utf8");
const graphDerivedDataSource = await readFile(resolve(repoRoot, "src", "graph", "useGraphDerivedData.ts"), "utf8");
const graphViewStateSource = await readFile(resolve(repoRoot, "src", "graph", "useGraphViewState.ts"), "utf8");
const topBarSource = await readFile(resolve(repoRoot, "src", "topbar", "TopBar.tsx"), "utf8");
const appShellSource = await readFile(resolve(repoRoot, "src", "AppShell.tsx"), "utf8");
const exportDialogSource = await readFile(resolve(repoRoot, "src", "export", "ExportDialog.tsx"), "utf8");
const exportHookSource = await readFile(resolve(repoRoot, "src", "export", "useDocumentationExport.ts"), "utf8");
const exportRunnerSource = await readFile(resolve(repoRoot, "src", "export", "runDocumentationExport.ts"), "utf8");
const exportDocsSource = await readFile(resolve(repoRoot, "src", "export", "docs.ts"), "utf8");
const settingsSource = await readFile(resolve(repoRoot, "src", "settings", "SettingsDialog.tsx"), "utf8");
const appSettingsStateSource = await readFile(resolve(repoRoot, "src", "settings", "useAppSettingsState.ts"), "utf8");
const modelReadinessSource = await readFile(resolve(repoRoot, "src", "settings", "useModelReadiness.ts"), "utf8");
const navigatorRailSource = await readFile(resolve(repoRoot, "src", "navigator", "NavigatorRail.tsx"), "utf8");
const navigatorSource = await readFile(resolve(repoRoot, "src", "navigator", "NavigatorPanels.tsx"), "utf8");
const navigatorSearchSource = await readFile(resolve(repoRoot, "src", "navigator", "useSymbolSearch.ts"), "utf8");
const workspaceSource = await readFile(resolve(repoRoot, "src", "workspace", "WorkspacePane.tsx"), "utf8");
const workspaceShellSource = await readFile(resolve(repoRoot, "src", "workspace", "WorkspaceShell.tsx"), "utf8");
const workspaceLayoutSource = await readFile(resolve(repoRoot, "src", "workspace", "useWorkspaceLayout.ts"), "utf8");
const workspaceNavigationSource = await readFile(resolve(repoRoot, "src", "workspace", "useWorkspaceNavigation.ts"), "utf8");
const modelRuntimeSource = await readFile(resolve(repoRoot, "src", "model", "modelRuntime.ts"), "utf8");
const projectActionsSource = await readFile(resolve(repoRoot, "src", "scan", "useProjectActions.ts"), "utf8");
const sourceFileViewSource = await readFile(resolve(repoRoot, "src", "source", "SourceFileView.tsx"), "utf8");
const sourceFilePickerSource = await readFile(resolve(repoRoot, "src", "source", "SourceFilePicker.tsx"), "utf8");
const sourceFileHookSource = await readFile(resolve(repoRoot, "src", "source", "useSourceFile.ts"), "utf8");
const sourceReaderSource = await readFile(resolve(repoRoot, "src", "lib", "sourceReader.ts"), "utf8");
const sourceLineLabelsSource = await readFile(resolve(repoRoot, "src", "source", "sourceLineLabels.ts"), "utf8");
const citationFocusSource = await readFile(resolve(repoRoot, "src", "source", "citationFocus.ts"), "utf8");
const dependencyPanelsSource = await readFile(resolve(repoRoot, "src", "inspector", "DependencyPanels.tsx"), "utf8");
const inspectorPaneSource = await readFile(resolve(repoRoot, "src", "inspector", "InspectorPane.tsx"), "utf8");
const inspectorRoutingSource = await readFile(resolve(repoRoot, "src", "inspector", "useInspectorRouting.ts"), "utf8");
const inspectorTabsSource = await readFile(resolve(repoRoot, "src", "inspector", "InspectorTabs.tsx"), "utf8");
const askGenerationSource = await readFile(resolve(repoRoot, "src", "inspector", "useAskGeneration.ts"), "utf8");
const questionQualitySource = await readFile(resolve(repoRoot, "src", "inspector", "questionQuality.ts"), "utf8");
const chatAnswerPanelSource = await readFile(resolve(repoRoot, "src", "inspector", "ChatAnswerPanel.tsx"), "utf8");
const chatHistorySource = await readFile(resolve(repoRoot, "src", "inspector", "chatHistory.ts"), "utf8");
const chatStateSource = await readFile(resolve(repoRoot, "src", "inspector", "useChatState.ts"), "utf8");
const summaryDockSource = await readFile(resolve(repoRoot, "src", "inspector", "SummaryDock.tsx"), "utf8");
const summaryGenerationSource = await readFile(resolve(repoRoot, "src", "inspector", "useSummaryGeneration.ts"), "utf8");
const summaryProgressSource = await readFile(resolve(repoRoot, "src", "inspector", "summaryProgress.ts"), "utf8");
const summaryGraphSource = await readFile(resolve(repoRoot, "src", "inspector", "summaryGraph.ts"), "utf8");
const aiProgressSource = await readFile(resolve(repoRoot, "src", "inspector", "aiProgress.ts"), "utf8");
const messagePartsSource = await readFile(resolve(repoRoot, "src", "inspector", "MessageParts.tsx"), "utf8");
const askFocusSource = await readFile(resolve(repoRoot, "src", "retrieval", "askFocus.ts"), "utf8");
const graphAnswerSource = await readFile(resolve(repoRoot, "src", "retrieval", "graphAnswer.ts"), "utf8");
const semanticIndexSource = await readFile(resolve(repoRoot, "src", "retrieval", "useSemanticIndex.ts"), "utf8");
const semanticStoreSource = await readFile(resolve(repoRoot, "src", "retrieval", "semanticStore.ts"), "utf8");
const appCss = await readFile(resolve(repoRoot, "src", "App.css"), "utf8");
const graphViewSource = await readFile(resolve(repoRoot, "src", "graph", "GraphView.tsx"), "utf8");
const checks = [
  [
    "Ask thread owns the answer space and the composer stays at the bottom",
    appearsInOrder(chatAnswerPanelSource, [
      'className="chat-thread"',
      'className="chat-composer"',
    ]),
  ],
  [
    "Explore thread contains grounded starting context, progress, errors, and answers",
    includesAll(chatAnswerPanelSource, [
      'className="chat-thread"',
      'status === "running"',
      'status === "error"',
      "<ChatTurn",
      "{!hasConversation ? overview : null}",
    ]) && includesAll(summaryDockSource, [
      'className="explore-suggestions"',
      '"What does this do?"',
    ]),
  ],
  [
    "Chat answers render as plain messages instead of graph report panels",
    includesAll(chatAnswerPanelSource, [
      'className="chat-user-message"',
      'className="chat-answer-bubble"',
      'className="chat-answer-text"',
      "MessageText text={answer.text}",
    ]) &&
      !chatAnswerPanelSource.includes('<details className="chat-answer-summary"') &&
      !chatAnswerPanelSource.includes("<GroupedEvidence") &&
      !chatAnswerPanelSource.includes("Copy with citations"),
  ],
  [
    "Explore starting context offers selected-symbol questions without a separate preset panel",
    includesAll(summaryDockSource, ["suggestedQuestions(node)", '"What does this do?"', "onAskSuggestion(question)"]) &&
      !chatAnswerPanelSource.includes("QuestionStarterGroups") &&
      !chatAnswerPanelSource.includes("onAskPreset"),
  ],
  [
    "Answer routing is automatic by default with overrides embedded in the composer",
    includesAll(chatAnswerPanelSource, [
      '(["auto", "graph", "ai"] as ChatMode[])',
      'const isLocalAiRoute = route === "ai"',
      '{isRoutedToLocalAi ? <i className="chat-mode-status-dot" aria-hidden="true" /> : null}',
      '{isLocalAiRoute ? "Local AI" : route[0].toUpperCase() + route.slice(1)}',
      "routeNeedsModel(questionText, mode)",
      "isRoutedToLocalAi",
      "chat-mode-status-dot",
      'className="answer-route-menu"',
      'className="answer-route-popover"',
      'aria-label={`Answer route: ${routeLabel}`}',
      'routeMenuRef.current?.removeAttribute("open")',
    ]) &&
      includesAll(askGenerationSource, [
      'mode: ChatMode = "auto"',
      'const useGraphRoute = mode === "graph" || (mode === "auto" && isGraphQuestion(question))',
    ]) &&
      !askGenerationSource.includes("shouldSyncAskFocus") &&
      includesAll(appCss, [".chat-mode-control", ".chat-mode-status-dot"]),
  ],
  [
    "The composer explains its active route while Settings owns the full answer explanation",
    includesAll(chatAnswerPanelSource, [
      "activeRouteDetail",
      "Auto chooses graph for structural questions and Local AI for open-ended ones.",
      "semanticIndex.message",
    ]) &&
      includesAll(settingsSource, [
        "Chat &amp; AI",
        "Structural questions use the graph. AI is only used for broader explanations.",
        "Connection details",
        "Retrieval &amp; explanation",
      ]) &&
      includesAll(appCss, [".answer-route-popover", ".settings-disclosure"]),
  ],
  [
    "Ask accepts selected-context questions while blocking incomplete prompts",
    includesAll(questionQualitySource, [
      "const COMPLETE_QUESTION_MESSAGE",
      "export function inputQualityMessage",
      "hasSelectedNode && usesSelectedContext && hasQuestionIntent",
    ]) && includesAll(askGenerationSource, [
      "const qualityMessage = inputQualityMessage(question, Boolean(selectedNode))",
      "setChatStatus(\"error\")",
    ]) &&
      includesAll(chatAnswerPanelSource, [
        "const errorLabel = isStoppedError(error) ? \"Stopped\" : \"Check question\"",
        "{errorLabel}",
      ]),
  ],
  [
    "Semantic retrieval prepares a local chunk index on demand before Ask uses it",
    includesAll(semanticIndexSource, [
      "const SEMANTIC_INDEX_TIMEOUT_MS = 30_000",
      "const SEMANTIC_QUERY_TIMEOUT_MS = 30_000",
      "buildSemanticChunkVectorIndex",
      "buildSemanticSourceChunks",
      "warmSemanticIndex",
      "Cobolens semantic retrieval readiness probe",
      "Semantic search is optional.",
      "state.status !== \"ready\"",
      "requireCachedIndex: true",
    ]) &&
      includesAll(askGenerationSource, [
        "semanticIndex.status !== \"ready\" ? undefined : searchSemanticIndex",
        "Semantic retrieval is warming; this answer used graph and keyword retrieval.",
      ]) &&
      includesAll(appSource, [
        "useSemanticIndex({",
        "readExcerptForNode: sourceExcerptForNode",
        "searchSemanticIndex: semanticIndex.searchSemanticIndex",
        "onWarmSemanticIndex: semanticIndex.warmSemanticIndex",
      ]) &&
      includesAll(semanticStoreSource, [
        "if (canUseTauri())",
        'invoke<StoredSemanticVectorIndex | null>("read_semantic_index"',
        'invoke("write_semantic_index"',
        "createLocalStorageSemanticVectorStore(window.localStorage)",
      ]),
  ],
  [
    "Citation guard preserves safe model claims and falls back only when necessary",
    includesAll(askGenerationSource, [
      "answer.guarded && !answer.repaired",
      "fellBackToGraph",
      "graphAnswerFallback(",
      "graph,",
      "question,",
      "answerContext,",
      "model answer had ${answer.guardReason ?? \"citation issues\"}",
      '"citation"',
      "text: displayedAnswer.text",
      "citations: displayedAnswer.citations",
      'source: fellBackToGraph ? "graph" : "model"',
      "citationFiltered: Boolean(answer.repaired)",
      "Citation guard removed uncited Local AI claims",
      "fellBackToGraph",
    ]) &&
      includesAll(graphAnswerSource, [
        "Local AI draft failed citation checks, so Cobolens used the graph answer.",
        "function localAiFallbackIntro",
      ]) &&
      includesAll(chatAnswerPanelSource, [
        'className="answer-details"',
        "<summary>Details</summary>",
    ]),
  ],
  [
    "Ask response keeps a simple message style with compact evidence",
    includesAll(appCss, [
      ".chat-user-message",
      ".chat-answer-bubble",
      "background: rgba(17, 21, 26, 0.72)",
    ]) &&
      chatAnswerPanelSource.includes("<EvidenceList citations={answer.citations} onOpenCitation={onOpenCitation} />") &&
      !appCss.includes(".chat-answer-summary") &&
      !appCss.includes("Show evidence") &&
      !appCss.includes(".chat-evidence-groups"),
  ],
  [
    "Ask and summary messages render structured text blocks",
    includesAll(messagePartsSource, [
      "function MessageText",
      "function textBlocks",
      'block.type === "list"',
      "function InlineMessageText",
      "function inlineSegments",
      'segment.type === "strong"',
      'segment.type === "em"',
      'segment.type === "code"',
      "function cleanInlineText",
    ]) &&
      includesAll(appCss, [".message-text", ".message-text ul", ".message-text strong", ".message-text em", ".message-text code"]),
  ],
  [
    "Ask keeps bounded history visible as a normal chat thread",
    includesAll(chatStateSource, [
      "const [chatHistory, setChatHistory] = useState<ChatAnswer[]>([])",
      "function rememberChatAnswer(answer: ChatAnswer)",
      "rememberRecentChatAnswer(current, answer)",
      "chatHistory,",
      "setChatAnswer(null)",
    ]) &&
      includesAll(chatHistorySource, ["CHAT_HISTORY_LIMIT = 6", "function rememberRecentChatAnswer"]) &&
      includesAll(inspectorPaneSource, ["chatHistory: ChatAnswer[]", "history={chatHistory}"]) &&
      includesAll(chatAnswerPanelSource, [
        "history: ChatAnswer[]",
        "const visibleAnswers",
        "sameChatAnswer",
        "visibleAnswers.map",
        "thread.scrollTop = thread.scrollHeight",
      ]) &&
      includesAll(appSource, [
        "handleInspectorTabChange",
        "chatHistory,",
        "onTabChange: handleInspectorTabChange",
      ]) &&
      !appSource.includes('if (tab === "ask") clearVisibleChat();') &&
      !chatAnswerPanelSource.includes("answer-history-actions") &&
      !appCss.includes(".answer-history-actions") &&
      !chatAnswerPanelSource.includes("chat-focus-divider"),
  ],
  [
    "Ask answers read as a simple question and answer exchange",
    includesAll(chatAnswerPanelSource, [
      'className="chat-user-message"',
      'className="chat-answer-text"',
      'className="chat-answer-bubble"',
      "MessageText text={answer.text}",
    ]) && includesAll(appCss, [".chat-user-message", ".chat-answer-bubble"]),
  ],
  [
    "Ask starts with compact cited context and can deepen it with Local AI",
    includesAll(summaryGenerationSource, [
      "function explainSelectedNode()",
      "storeSummary(selectedNode.id, summary)",
      'provider: "graph"',
      'model: "deterministic"',
      "answered from graph facts without a model",
      'onTabChange("ask")',
    ]) &&
      includesAll(askGenerationSource, [
      "function askAboutSelectedNode()",
      "setChatQuestion(`Explain ${selectedNode.name} in plain English.`)",
      "setChatAnswer(null)",
      'setChatStatus("idle")',
    ]) &&
      includesAll(summaryGraphSource, [
      "function selectedNodeGraphAnswer",
      "${node.name} at a glance:",
    ]) &&
      includesAll(summaryDockSource, [
      'className="summary-card investigation-card"',
      'className="summary-context-meta"',
      "Restore graph facts",
      "Open source",
      "Explain with ${providerLabel}",
      "Context &amp; evidence",
      "suggestedQuestions(node)",
      "modelReadiness.status",
      "Set up ${providerLabel}",
      "Explain all with ${providerLabel}",
    ]) &&
      includesAll(appSource, [
      "onExplainNode: explainSelectedNode",
    ]) && includesAll(appCss, [".investigation-card", ".summary-action-buttons", ".summary-ai-status", ".investigation-details"]),
  ],
  [
    "Guarded AI summaries are clearly labeled as graph fallbacks",
    includesAll(summaryDockSource, [
      "showFallbackNotice",
      "Local AI fallback:",
      'className="summary-guard-note"',
      'role="status"',
    ]) &&
      includesAll(summaryGenerationSource, [
      "graphBackedSummaryFallback",
      "model summary had ${summary.guardReason ?? \"citation issues\"}",
    ]) &&
      includesAll(appCss, [".summary-guard-note", "rgba(229, 199, 95, 0.06)"]),
  ],
  [
    "AI summaries stream as guarded drafts before storing final text",
    includesAll(summaryGenerationSource, [
      'runStreamingModelCall("Summary generation"',
      "onFirstToken: noteFirstToken",
      "onTextDelta: (draftText) => {",
      '[node.id]: { status: "running", draftText }',
    ]) &&
      includesAll(summaryDockSource, [
      "draftText?: string",
      'className="summary-live-output"',
      "MessageText text={state.draftText}",
    ]) &&
      includesAll(aiProgressSource, [
      "Final citations are checked before the answer is trusted.",
    ]) && includesAll(appCss, [".summary-live-output"]),
  ],
  [
    "Bulk summaries continue after model fallback but stop on explicit cancel",
    includesAll(summaryGenerationSource, [
      'type SummaryGenerationResult = "ready" | "fallback" | "stopped"',
      "let fallbackCount = 0",
      "generated === \"stopped\"",
      "generated === \"fallback\"",
      "bulkSummaryProgressLabel(index + 1, summaryNodes.length, fallbackCount)",
      "if (isStoppedModelCall(fallbackReason))",
      "[node.id]: { status: \"error\", error: fallbackReason }",
      "[node.id]: { status: \"ready\", summary: fallbackSummary }",
      "return \"fallback\";",
      "setBulkSummaryStatus(`Stopped at ${index}/${summaryNodes.length}`)",
    ]) &&
      includesAll(modelRuntimeSource, ["function isStoppedModelCall(message: string)"]) &&
      includesAll(summaryProgressSource, [
        "function bulkSummaryProgressLabel(done: number, total: number, fallbackCount: number)",
        "graph fallback${fallbackCount === 1 ? \"\" : \"s\"}",
      ]),
  ],
  [
    "Advanced answer settings distinguish graph mode from Local AI questions",
    includesAll(chatAnswerPanelSource, [
      "export type ChatMode",
      "const [mode, setMode] = useState<ChatMode>(\"auto\")",
      "routeNeedsModel(questionText, mode)",
      "const autoIdle",
      "Instant, cited answer from the dependency graph — no AI needed.",
      "on only the retrieved, cited code slice.",
      "Cobolens will check it when you send.",
      "localAiRouteTitle",
      "isRoutedToLocalAi",
      "chat-mode-status-dot",
      'isRoutedToLocalAi ? `is-routed ai-${modelReadiness.status}` : ""',
      "answerRouteLabel",
      "answerRouteClass",
      "Graph answer",
      'className="chat-mode-control"',
      "<textarea",
      "rows={2}",
      'label={progressLabel}',
      'focus({ preventScroll: true })',
      "Local AI",
    ]) &&
      !chatAnswerPanelSource.includes('className="chat-stream-stages"') &&
      includesAll(appCss, ['.progress-note', '.progress-spinner']) &&
      includesAll(aiProgressSource, [
        "Waiting for first local model text",
        "Streaming draft text. Final citations are checked before the answer is trusted.",
        "Stop is available",
        "try ${RECOMMENDED_SMALL_OLLAMA_MODEL}",
      ]) &&
      includesAll(askGenerationSource, [
        "useGraphRoute",
        "semanticSearch: useGraphRoute",
        'setChatStatus("idle")',
        "if (isStoppedModelCall(fallbackReason))",
        'setChatError(fallbackReason)',
        'setChatStatus("error")',
      "runStreamingModelCall(\"Chat\"",
      "onFirstToken: noteFirstToken",
      "onTextDelta: (draft) => {",
    ]) &&
      includesAll(appSettingsStateSource, [
        "const hasLocalAiConfig",
        'modelReadiness.status !== "error"',
        "isCloudProvider(modelSettings.provider)",
      ]) &&
      includesAll(messagePartsSource, [
        "EVIDENCE_PREVIEW_LIMIT",
        "Show ${hiddenCount} more",
      ]) &&
      appearsInOrder(askGenerationSource, [
        "const fallbackReason = friendlyModelError(err, modelSettings);",
        "if (isStoppedModelCall(fallbackReason))",
        "if (context)",
      ]) &&
      includesAll(appCss, [
        ".chat-mode-status-dot",
        ".chat-mode-control button.ai-ready .chat-mode-status-dot",
        ".chat-mode-control button.ai-checking .chat-mode-status-dot",
        ".chat-mode-control button.ai-error .chat-mode-status-dot",
        ".chat-user-message",
        ".chat-stream-stages",
        ".chat-mode-control",
        ".chat-send-button",
        "height: 28px",
      ]),
  ],
  [
    "Settings shows honest AI usage and bulk token estimate before model calls",
    includesAll(settingsSource, [
      'aria-label="AI usage and token estimate"',
      "Cloud calls",
      "Explain-all input estimate",
      "Graph answers need no model",
      "Only requested explanations send cited context to",
    ]) && includesAll(appCss, [".ai-usage", ".ai-usage p"]),
  ],
  [
    "Export opens a package dialog with selectable artifacts",
    includesAll(topBarSource, ["Choose export package options", "onExport"]) &&
      includesAll(appShellSource, ["ExportDialog", "<ExportDialog {...exportDialog} />"]) &&
      includesAll(exportDialogSource, [
        "Export package",
        "Choose export artifacts",
        "Markdown documentation",
        "Mermaid diagram",
        "PNG diagram",
        "Browser preview cannot create folders",
        "Export ${selectedCount",
      ]) &&
      includesAll(exportHookSource, [
        "exportDialogOpen",
        "DEFAULT_DOCUMENTATION_EXPORT_OPTIONS",
        "documentationExportPackageName",
        "selectedDocumentationExportCount",
        "openExportDialog",
        "Export complete.",
      ]),
  ],
  [
    "Export runner writes selected artifacts into a clean desktop package folder",
    includesAll(exportDocsSource, [
      "DocumentationExportOptions",
      "documentationExportPackageName",
      "selectedDocumentationExportLabels",
      "selectedDocumentationExportCount",
    ]) &&
      includesAll(exportRunnerSource, [
        "packageName: documentationExportPackageName(docs)",
        "includeMarkdown: options.markdown",
        "includeMermaid: options.mermaid",
        "includePng: options.png",
        "Desktop export creates a clean folder",
        "Choose at least one export artifact.",
      ]),
  ],
  [
    "Check AI verifies local generation without slowing every model call preflight",
    includesAll(modelReadinessSource, [
      "Checking local generation with a quick probe",
      "inspectOllamaReadiness",
      "const refreshInstalledModels = useCallback(async () => {",
      "Reading installed Ollama models",
      "installedModels: readiness.installedModels",
      "suggestedModel: details.suggestedModel",
      "installedModels: isCloudProvider(modelSettings.provider) ? [] : current.installedModels",
      "ollamaReadinessDetails",
      "verifyGeneration: true",
      "generationTimeoutMs: MODEL_READINESS_TIMEOUT_MS",
      "const readiness = await inspectOllamaReadiness(modelSettings);",
      "installedModels: readiness.installedModels",
      'from "../model/readiness"',
    ]) &&
    includesAll(settingsSource, [
        "Refresh list",
        "Prepare semantic search",
        "RECOMMENDED_SMALL_OLLAMA_MODEL",
        "For a smaller local test model, run:",
        "isSameOllamaModel(model, settings.model)",
      ]) &&
      includesAll(appCss, [".model-install-hint", ".settings-primary-actions"]),
  ],
  [
    "Settings presents AI setup as a lightweight readiness stepper",
    includesAll(settingsSource, [
      "type ReadinessStepStatus",
      "function aiReadinessSteps",
      'className="readiness-stepper"',
      'aria-label="AI setup readiness"',
      "Ollama server",
      "Generation model",
      "Embedding model",
      "Semantic index",
      "Check the connection before relying on model-backed Chat or summaries.",
      "ollama serve",
      "ollama pull ${configuredModel}",
      "ollama pull ${embeddingModel}",
      "semanticStepStatus",
      "API key",
      "Save a key before cloud Chat or summaries.",
      "localGenerationTestStatus",
      "localModelStatus",
    ]) &&
      includesAll(appCss, [
        ".readiness-stepper",
        ".readiness-step",
        ".readiness-step.ready",
        ".readiness-step.checking",
        ".readiness-step.error",
      ]),
  ],
  [
    "Model field is a picklist of locally installed models, auto-refreshed on open",
    includesAll(settingsSource, [
      'className="model-picker"',
      "generationModels.map((model) => (",
      "isEmbeddingOnlyOllamaModel",
      '<option value="__custom__">Custom name…</option>',
      "Refresh list",
    ]) &&
      includesAll(modelReadinessSource, [
        "if (!settingsOpen || isCloudProvider(modelSettings.provider)) return;",
        "refreshInstalledModels()",
      ]) && includesAll(appCss, [".model-picker", ".model-picker-meta"]),
  ],
  [
    "Center workspace toggles Map and Source with a segmented control",
    includesAll(workspaceSource, [
      'type CenterView = "map" | "source"',
      'className="view-toggle"',
      'onClick={() => onCenterViewChange("map")}',
      'onClick={() => onCenterViewChange("source")}',
      "className={`center-pane center-${centerView}",
    ]) &&
      includesAll(workspaceNavigationSource, ['useState<CenterView>("map"']) &&
      includesAll(appSource, ["onCenterViewChange: setCenterView"]) &&
      includesAll(appCss, [".center-pane", ".view-toggle", ".center-body", ".center-source-view"]),
  ],
  [
    "Navigator rail collapses from the top bar",
    // The rendered browser smoke proves the panel hides and workspace width is
    // reclaimed. This source check only guards the accessible/persisted hooks.
    includesAll(workspaceLayoutSource, ['readLayoutFlag("cobolens.railCollapsed"', "toggleRailCollapsed"]) &&
      includesAll(workspaceShellSource, ['railCollapsed ? " rail-collapsed" : ""', "<NavigatorRail"]) &&
      includesAll(topBarSource, [
        'className="rail-toggle"',
        'aria-label={railCollapsed ? "Show navigator panel" : "Hide navigator panel"}',
      ]) &&
      includesAll(navigatorRailSource, [
        'id="navigator-panel"',
      ]) &&
      includesAll(appCss, [".shell.rail-collapsed", ".shell.rail-collapsed .left-pane"]),
  ],
  [
    "Evidence and View source bring Source forward in the center workspace",
    includesAll(workspaceNavigationSource, [
      "function jumpToCitation(citation: Citation",
      'showCenterView("source")',
      "function showSourcePanel()",
    ]),
  ],
  [
    "Ask toggles, unmounts when closed, and keeps the desktop split drag-resizable",
    includesAll(workspaceLayoutSource, [
      'readLayoutFlag("cobolens.inspectorCollapsed"',
      'readLayoutNumber("cobolens.rightWidth"',
      "function startInspectorResize",
      "clampRightWidth",
      "toggleInspectorCollapsed",
    ]) &&
      includesAll(workspaceShellSource, ['inspectorCollapsed ? " inspector-collapsed" : ""', 'style={{ ["--right-w" as string]', "inspectorCollapsed ? null : <InspectorPane"]) &&
      includesAll(topBarSource, ['className="inspector-toggle"', 'aria-label={askOpen ? "Close Chat" : "Open Chat"}', "onClick={onToggleAsk}"]) &&
      includesAll(inspectorPaneSource, [
        'className="pane-divider"',
        'aria-label="Resize inspector panel"',
        'aria-label="Close inspector"',
        "onPointerDown={onStartResize}",
        "onDoubleClick={onResetWidth}",
      ]) &&
      includesAll(appCss, [".pane-divider", ".shell.inspector-collapsed", "var(--right-w", "@media (max-width: 1280px) and (min-width: 1025px)"]),
  ],
  [
    "Source reads like code: no-wrap lines, file/line in the center toolbar",
    // The rendered browser smoke proves hidden duplicate Source chrome,
    // no-wrap code text, horizontal scrolling, line numbers, file picker, and
    // range labels. This source check keeps the durable component hooks.
    includesAll(workspaceSource, [
      "sourceLineLabel(selectedNode?.lines",
      "<SourceFilePicker",
      'className="source-line-chip"',
    ]) &&
      includesAll(sourceFilePickerSource, [
        'className="source-file-picker"',
        'role="dialog" aria-label="Switch source file"',
        'aria-label="Filter source files"',
        "groupedEntries(entries, selectedFile, query)",
      ]) &&
      includesAll(sourceFileViewSource, [
        'className="source-header"',
        'className="source-line-marker"',
        'className="source-line-number"',
        'className="source-line-text"',
      ]) &&
      includesAll(sourceLineLabelsSource, ["function sourceLineClassName", "is-selected-range", "is-citation-line"]) &&
      includesAll(appCss, [
        ".center-source-view .source-header",
        ".source-file-picker",
        ".source-line-chip",
        ".source-line.is-selected-range",
        ".source-line.is-citation-line",
        ".source-line-marker",
        ".source-line-text",
      ]),
  ],
  [
    "Tablet and mobile breakpoints keep the canvas full-height and use overlay panes",
    // The live browser audit proves the overlay drawer behavior. This source
    // check keeps the responsive contract from regressing to stacked panes.
    includesAll(appCss, [
      "@media (max-width: 1024px)",
      "@media (max-width: 560px)",
      ".shell.inspector-collapsed",
      ".center-pane",
      ".right-pane",
      ".left-pane",
      ".center-source-view",
      ".button-row.two",
      ".center-toolbar .graph-toolbar-actions button",
      ".topbar-actions .rail-toggle",
      ".center-toolbar-meta.is-source",
    ]) &&
    includesAll(appCss, [
        "position: relative;",
        "grid-template-columns: minmax(0, 1fr);",
        "grid-template-rows: minmax(0, 1fr);",
        "position: fixed;",
        "top: 52px;",
        "width: min(480px, calc(100vw - 12px));",
      ]) &&
      includesAll(workspaceNavigationSource, [
        "function showCenterView(view: CenterView)",
        'document.querySelector<HTMLElement>(".shell")?.scrollTo({ top: 0 })',
        "focus({ preventScroll: true })",
      ]),
  ],
  [
    "Ask composer remains available while reading answers",
    // The rendered browser smoke proves the composer remains visible and before
    // the answer after graph answers and evidence jumps. This source check keeps
    // durable Chat shell hooks.
    includesAll(inspectorPaneSource, ['activeTab === "ask" ? " is-ask-focused"']) &&
      includesAll(chatAnswerPanelSource, [
        'className="chat-composer"',
        'aria-label="Chat about the codebase"',
        "autoFocus",
        "<textarea",
        "chat-send-button",
        'className="chat-thread"',
        'aria-live="polite"',
      ]) &&
      appearsInOrder(chatAnswerPanelSource, ['<div className="chat-thread"', '<div className="chat-composer"']) &&
      includesAll(appCss, [
        ".right-pane.is-ask-focused",
        ".chat-composer",
        "bottom: 0",
        ".chat-thread",
        ".chat-workspace",
        ".right-pane.is-ask-focused .summary-stack",
      ]),
  ],
  [
    "Explore styling is scoped to the inspector and does not resize the workspace shell",
    // The rendered browser smoke verifies Chat tab changes only the inspector
    // pane class and keeps workspace width stable.
    includesAll(inspectorPaneSource, ['activeTab === "ask" ? " is-ask-focused"', 'className={`right-pane']) &&
      includesAll(workspaceNavigationSource, ["function syncAskFocusNode", "preserveExpansion: true", "preserveChat: true"]) &&
      includesAll(appCss, [".right-pane.is-ask-focused"]),
  ],
  [
    "Inspector opens on Ask with Dependencies as the only secondary view",
    includesAll(inspectorRoutingSource, [
      'useState<InspectorTab>("ask")',
    ]) &&
      includesAll(inspectorTabsSource, [
      'label: "Chat"',
      'label: "Dependencies"',
      "aria-label={tab.badge ? `${tab.label} (${tab.badge})` : tab.label}",
    ]) &&
      !inspectorTabsSource.includes('label: "Overview"') &&
      !inspectorTabsSource.includes('label: "Overview"') &&
      includesAll(appCss, [".inspector-tabs", "flex-wrap: wrap"]) &&
      !cssBlock(appCss, ".inspector-tabs span").includes("text-overflow"),
  ],
  [
    "Scrollable panes use dark native scrollbars",
    includesAll(appCss, ["scrollbar-color: #303843 #101419", "*::-webkit-scrollbar-thumb", "background: #303843"]),
  ],
  [
    "Relationship source buttons expose section-specific accessible labels",
    includesAll(dependencyPanelsSource, [
      "aria-label={`${title}: show ${edgeLabel(edge, graph)}",
      "edgeLabel(edge, graph)",
      "edge.site.file",
      "onOpenEdge(edge)",
      "nodeTypeLabel(related?.type",
    ]) && !dependencyPanelsSource.includes('title="Data flow & runtime links"'),
  ],
  [
    "Relationship citations open the dependencies detail",
    includesAll(citationFocusSource, [
      "function resolveCitationTarget",
      "edgeLabel(edge, graph) === citation.label",
    ]) &&
      includesAll(workspaceNavigationSource, [
      "resolveCitationTarget({ graph, nodeById, citation })",
      "setSelectedEdge(citedEdge)",
      "onSetInspectorImpact()",
    ]) &&
      includesAll(inspectorRoutingSource, [
        "preserveInspectorForEdgeRef",
        'setInspectorTab("impact")',
    ]),
  ],
  [
    "Explore and relationship evidence citations focus the cited source",
    includesAll(workspaceNavigationSource, [
      "function jumpToCitation(citation: Citation, keepEdge = false, preserveInspectorTab = false)",
      'showCenterView("source")',
    ]) &&
      includesAll(summaryDockSource, [
        "<EvidenceList citations={evidence} onOpenCitation={onOpenCitation} />",
      ]) &&
      includesAll(messagePartsSource, [
        "function EvidenceList",
        "function CitationList",
        "Open citation ${citation.label}",
      ]) &&
      includesAll(inspectorRoutingSource, [
        "const preserveInspectorForEdgeRef = useRef(false)",
        "if (preserveInspectorForEdgeRef.current)",
        "preserveInspectorForEdgeRef.current = false",
        "const preserveInspectorTabForNextEdge = useCallback(() => {",
      ]) &&
      !chatAnswerPanelSource.includes("<GroupedEvidence") &&
      !chatAnswerPanelSource.includes("Copy with citations") &&
      includesAll(sourceFileViewSource, [
        'pageCount === 1 ? " is-single-page" : ""',
        'focusedCitation ? " has-focused-citation" : ""',
        'className="source-focus-note"',
        "Focused citation: {source.file}:{source.highlightLine}",
        "Focused citation line",
      ]) &&
      includesAll(sourceLineLabelsSource, ["function sourceLineMarker", 'if (citationLine) return "C"']) &&
      includesAll(appCss, [".source-view.has-focused-citation", ".source-focus-note", ".source-line.is-citation-line", ".sr-only"]),
  ],
  [
    "Source is a size-capped, paged trust surface",
    includesAll(sourceReaderSource, [
      "export const MAX_SOURCE_READER_BYTES",
      'invoke<SourceFileContent>("read_source_file"',
      "lines: lines.map",
    ]) &&
      includesAll(sourceFileHookSource, ["export function useSourceFile", "highlightLine: Math.min"]) &&
      includesAll(sourceFileViewSource, [
        "SOURCE_PAGE_SIZE = 240",
        "source?.lines.slice(pageStart, pageStart + SOURCE_PAGE_SIZE)",
        "visibleLines.map",
        'aria-label="Source pages"',
        "scrollIntoView({ block: \"center\", inline: \"nearest\" })",
        "Loading source file...",
      ]) &&
      includesAll(workspaceSource, ['hidden={centerView !== "source"}', "source.lineCount"]),
  ],
  [
    "Selected relationship detail explains endpoints and can refocus either node",
    // The rendered browser smoke proves the selected relationship detail is
    // visible, explains source/target roles, and exposes both endpoint buttons.
    includesAll(dependencyPanelsSource, [
      "const nodes = graphIndex(graph).nodeById",
      "const fromNode = nodes.get(edge.from)",
      "const toNode = nodes.get(edge.to)",
      'className="relationship-flow"',
      'aria-label="Relationship endpoints"',
      "aria-label={`Focus relationship source ${fromName}`}",
      "aria-label={`Focus relationship target ${toName}`}",
      "onFocusNode(edge.from)",
      "onFocusNode(edge.to)",
    ]) && includesAll(appCss, [".relationship-flow", ".relationship-node-button", ".relationship-edge-type"]),
  ],
  [
    "Empty graph canvas guides first-run through import and sample actions",
    includesAll(graphViewSource, [
      'className="graph-empty-card"',
      'className="graph-empty-kicker"',
      'className="graph-empty-actions"',
      "Understand unfamiliar COBOL without guessing.",
      "onImportProject",
      "onOpenSample",
      "if (!graph)",
    ]) &&
      includesAll(workspaceSource, ['className={`center-pane center-${centerView}${centerView === "map" && !focusedNode ? " is-empty" : ""}`}']) &&
      includesAll(appCss, [".graph-empty-card", ".graph-empty-kicker", ".graph-empty-actions"]),
  ],
  [
    "Browser preview keeps import and sample actions in the top bar and shows the first-run path",
    includesAll(topBarSource, [
      'className="topbar-import"',
      'className="topbar-sample"',
      'className={`privacy-dot ${modelSettings.privacyMode}`}',
      'aria-label={privacyModeLabel(modelSettings)}',
      'className="home-crumb"',
      'className="project-import-input"',
    ]) &&
      !topBarSource.includes('className="current-crumb"') &&
      includesAll(projectActionsSource, [
      "browserImportInputRef.current?.click()",
      "analyzeBrowserProject",
      "acceptBrowserProject",
    ]) &&
      includesAll(navigatorRailSource, [
      'className="graph-empty-note"',
      "Choose a project from the welcome in the map.",
    ]) &&
      includesAll(settingsSource, [
      "desktopAvailable ?",
      "{desktopAvailable ? (",
      "<ScanSettingsPanel",
    ]) && includesAll(appCss, [
      ".topbar-import",
      ".topbar-sample",
      ".privacy-dot",
      ".home-crumb",
      ".project-import-input",
      ".first-run-guide",
      ".center-toolbar-meta.is-source",
      ".source-line-chip",
    ]),
  ],
  [
    "Graph LOD clusters can drill down by expanding their owner",
    // The rendered browser smoke proves Expand increases the visible node
    // controls. This source check keeps the graph-slice expansion hooks.
    includesAll(graphViewSource, [
      "syntheticNodeOwners",
      "ownerId === focusNodeId",
      "else if (ownerId) onSelectNode(ownerId)",
      "onExpandNode(ownerId)",
    ]) &&
      includesAll(graphViewStateSource, [
        "const expandNode = useCallback((nodeId: string) => {",
        "setExpandedNodeIds((current) => {",
      ]) &&
      includesAll(appSource, ["onExpandNode: expandNode"]),
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
    "Graph toolbar hides the expand control when the focus has no hidden neighbors",
    // The rendered browser smoke proves the Expand button is absent for a
    // complete focus and switches to Collapse after expansion.
    includesAll(workspaceSource, [
      'centerView === "map" && focusedNode ? (',
      "focusExpanded || focusExpansion.hiddenByLimit ? (",
      "aria-label={expandButtonTitle}",
      "onToggleExpandFocus",
      "onToggleGraphNodeList",
      "showNodeList={showGraphNodeList}",
    ]) &&
      includesAll(graphViewStateSource, ["focusExpanded", "focusExpansion.hiddenByLimit", "expandButtonTitle"]) &&
      includesAll(appCss, [".center-toolbar", ".center-toolbar .graph-toolbar-actions button"]),
  ],
  [
    "Left navigator exposes a grouped codebase browser",
    // The rendered browser smoke proves the loaded tree order and selection
    // behavior. This source check keeps grouping in selectors and rendering in
    // the navigator components.
    includesAll(graphSelectorsSource, [
      "function sourceTreeGroups",
      '["Programs", ["program"]]',
      '["Copybooks", ["copybook"]]',
      '["JCL", ["jcl-job", "jcl-step"]]',
      "node.file && !node.external",
    ]) &&
      includesAll(navigatorSource, [
        "function SourceTree",
        'aria-label="Codebase browser"',
        'className="source-tree-group"',
        'className="source-tree-group-toggle"',
        'className="source-tree-list"',
        "SOURCE_TREE_PREVIEW_LIMIT = 12",
        "Show {remainingCount} more",
        "onSelectNode(node.id)",
      ]) &&
      includesAll(navigatorRailSource, ["<SourceTree groups={codebaseGroups} selectedNodeId={selectedNodeId} onSelectNode={onSelectSourceNode} />"]) &&
      includesAll(appCss, [".source-tree-list button.is-active", ".source-tree-group-toggle", ".source-tree-list button.source-tree-more"]),
  ],
  [
    "Symbol search keeps fuzzy matching focused on symbol names",
    // The rendered browser smoke covers empty search, Escape, Enter, and source
    // focus. This source check keeps scoring focused on symbol names rather
    // than broad source-text search.
    includesAll(graphSelectorsSource, [
      "function searchResultScore(node: GraphNode, query: string)",
      "function graphSearchResults(graph: GraphDocument | null, query: string, limit = 12)",
      "matchesFuzzy(name, needle)",
      "return null",
    ]) &&
      includesAll(navigatorSearchSource, [
      "function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>)",
      'event.key === "Enter" && searchResults[0]',
      "focusOnSearchResult(searchResults[0].id)",
      'event.key === "Escape" && query',
      "onOpenSource(nodeId)",
    ]) &&
      includesAll(topBarSource, [
      "onKeyDown={onSearchKeyDown}",
      "Search symbols",
      "Find programs, copybooks, jobs",
    ]) &&
      includesAll(navigatorRailSource, [
      "No matching graph symbols. Source text search is not implemented yet.",
    ]) &&
      !topBarSource.includes("<span>Search symbols</span>") &&
      !graphSelectorsSource.includes('matchesFuzzy(`${node.name} ${node.id} ${node.type}`, query)'),
  ],
  [
    "Left navigator prioritizes the codebase browser before collapsible filters and status panels",
    // Runtime coverage proves the visible ordering; this keeps the component
    // structure honest as the rail continues to be extracted.
    appearsInOrder(navigatorRailSource, [
      "{query.trim() ? (",
      "<SourceTree",
      'className="navigator-secondary"',
      'title="Legend & Filters"',
      'title="Inventory"',
      "<ParseHealth",
      "<GraphHints",
    ]) &&
      includesAll(navigatorRailSource, [
        'className="filter-grid"',
        'aria-label="Status and filters"',
      ]) &&
      includesAll(navigatorSource, [
        "function NavigatorDetails",
        'className="pane-block navigator-details"',
        "<summary>",
      ]) &&
      includesAll(appCss, [
        ".filter-grid",
        ".source-tree-list button.is-active",
        ".navigator-secondary",
        ".navigator-details > summary",
        ".navigator-details[open] > summary::before",
      ]),
  ],
  [
    "Inventory distinguishes source-backed codebase units from external graph references",
    includesAll(graphSelectorsSource, [
      "function codebaseInventoryCounts",
      "if (node.external) acc.external += 1;",
      'if (node.external || !node.file) return acc;',
    ]) && includesAll(graphDerivedDataSource, [
      "codebaseInventoryCounts(graph)",
    ]) && includesAll(navigatorRailSource, [
      'Metric label="Source programs"',
      'Metric label="External refs"',
      'Metric label="JCL jobs"',
    ]),
  ],
  [
    "Parse health surfaces analyzer dialect metadata",
    includesAll(navigatorSource, ["Dialect: {graph.meta.dialectGuess || \"unknown\"}", "function ParseHealth"]),
  ],
  [
    "Parse health warning rows can jump to cited source lines",
    includesAll(appSource, [
      "onOpenWarning: jumpToCitation",
    ]) && includesAll(navigatorSource, [
      "onOpenWarning: (citation: Citation) => void",
      "parseErrorSite(error)",
      'label: "Parse warning"',
    ]) && includesAll(appCss, [".parse-warning-list button", "text-decoration: underline"]),
  ],
  [
    "Graph hints expose potentially unreferenced source units",
    includesAll(navigatorSource, [
      "function GraphHints",
      'aria-label="Graph hints"',
      "Potentially unreferenced",
    ]) && includesAll(graphSelectorsSource, [
      "function graphHintSourceUnits",
      "potentiallyUnreferencedSourceUnits",
    ]) && includesAll(graphDerivedDataSource, [
      "graphHintSourceUnits(graph)",
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

function cssBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return "";
  const end = css.indexOf("}", start);
  return end === -1 ? "" : css.slice(start, end + 1);
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
