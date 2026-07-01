import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildDocumentationExport,
  documentationExportPrefix,
  documentationPngBytes,
  downloadBuiltDocumentationExport,
  estimateTokens,
} from "./export/docs";
import { GraphView } from "./graph/GraphView";
import {
  GraphDocument,
  GraphEdge,
  GraphNode,
  SourceExcerpt,
  SourceSnippet,
  edgeLabel,
  matchesFuzzy,
  nodeColor,
  potentiallyUnreferencedSourceUnits,
} from "./lib/graph";
import {
  DEFAULT_MODELS,
  DEFAULT_MODEL_SETTINGS,
  ModelProvider,
  ModelSettings,
  PROVIDER_LABELS,
  isCloudProvider,
  settingsForProvider,
} from "./model/config";
import { generateGroundedAnswer } from "./model/chat";
import { UnitSummary, generateUnitSummary } from "./model/summaries";
import { checkOllamaReadiness } from "./model/readiness";
import { Citation, retrieveQuestionContext } from "./retrieval/context";
import type { RetrievedContext } from "./retrieval/context";
import { graphAnswerFallback, isGraphQuestion } from "./retrieval/graphAnswer";
import "./App.css";

type Status = "idle" | "running" | "ready" | "error";
type SummaryStatus = "idle" | "running" | "ready" | "error";
type SummaryState = {
  status: SummaryStatus;
  summary?: UnitSummary;
  error?: string;
};
type ChatStatus = "idle" | "running" | "ready" | "error";
type ChatAnswer = {
  question: string;
  text: string;
  citations: Citation[];
  source: "graph" | "model";
  guarded?: boolean;
};
type InspectorTab = "ask" | "summary" | "impact" | "relationship";
type ModelReadiness = {
  status: "idle" | "checking" | "ready" | "error";
  message: string;
};
type SourceFocus = {
  file: string;
  line: number;
  nodeId?: string;
};
type ScanFormat = "auto" | "fixed" | "free";
type ScanSettings = {
  format: ScanFormat;
  extensions: string;
  encoding: string;
};
type AppSettings = {
  schemaVersion: 1;
  model: ModelSettings;
  scan: ScanSettings;
};
type AnalysisProgress = {
  phase: string;
  done: number;
  total: number;
  root?: string;
};

const APP_SETTINGS_STORAGE_KEY = "cobolens.settings.v1";
const LINEAGE_EDGE_TYPES = new Set(["reads", "writes", "moves-to", "queries", "updates", "links", "xctls", "uses-dd", "assigned-to", "executes"]);
const MODEL_CALL_TIMEOUT_MS = 45_000;
const MODEL_READINESS_TIMEOUT_MS = 12_000;
const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  format: "auto",
  extensions: ".cbl,.cob,.cpy,.jcl",
  encoding: "utf8",
};
const FOCUS_DIRECT_LIMIT_PER_TYPE = 14;
const LEGEND_NODE_TYPES = [
  ["program", "Programs"],
  ["paragraph", "Paragraphs"],
  ["copybook", "Copybooks"],
  ["jcl-job", "JCL jobs"],
  ["jcl-step", "JCL steps"],
  ["data-item", "Data items"],
  ["dataset", "Datasets"],
  ["db2-table", "DB2 tables"],
  ["cics-command", "CICS commands"],
] as const;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: unknown;
    };
    __cobolensLoadGraph?: (graph: GraphDocument, root?: string, sourceBase?: string) => void;
  }
}

function App() {
  const desktopAvailable = canUseTauri();
  const [status, setStatus] = useState<Status>("idle");
  const [root, setRoot] = useState<string>("");
  const [graph, setGraph] = useState<GraphDocument | null>(null);
  const [sourceBase, setSourceBase] = useState("");
  const [focusNodeId, setFocusNodeId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [scanProgress, setScanProgress] = useState<AnalysisProgress | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [snippet, setSnippet] = useState<SourceSnippet | null>(null);
  const [snippetLoading, setSnippetLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [modelSettings, setModelSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS);
  const [keyDraft, setKeyDraft] = useState("");
  const [hasProviderKey, setHasProviderKey] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [modelReadiness, setModelReadiness] = useState<ModelReadiness>({ status: "idle", message: "" });
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
  const [bulkSummaryStatus, setBulkSummaryStatus] = useState("");
  const [sourceFocus, setSourceFocus] = useState<SourceFocus | null>(null);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [chatAnswer, setChatAnswer] = useState<ChatAnswer | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatAnswer[]>([]);
  const [chatError, setChatError] = useState("");
  const [modelCallCount, setModelCallCount] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("summary");
  const [appSettingsLoaded, setAppSettingsLoaded] = useState(false);
  const inspectorBodyRef = useRef<HTMLDivElement | null>(null);
  const activeChatAbortRef = useRef<AbortController | null>(null);
  const activeSummaryAbortRef = useRef<AbortController | null>(null);

  const nodeById = useMemo(() => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []), [graph]);
  const focusedNode = nodeById.get(focusNodeId) ?? null;
  const selectedNode = nodeById.get(selectedNodeId) ?? focusedNode;
  const breadcrumbNodeIds = useMemo(
    () => history.filter((nodeId) => nodeId !== focusNodeId && nodeById.has(nodeId)).slice(-2),
    [focusNodeId, history, nodeById],
  );
  const selectedSummaryState = selectedNode ? summaries[selectedNode.id] : undefined;
  const summaryNodes = useMemo(
    () => graph?.nodes.filter((node) => isSummaryUnit(node) && !node.external && node.file) ?? [],
    [graph],
  );
  const bulkTokenEstimate = useMemo(
    () =>
      summaryNodes.reduce(
        (total, node) => total + estimateTokens(`${node.name} ${node.file ?? ""} ${node.lines?.join("-") ?? ""}`) + 900,
        0,
      ),
    [summaryNodes],
  );

  const counts = useMemo(() => {
    const empty = {
      programs: 0,
      copybooks: 0,
      jobs: 0,
      steps: 0,
      external: 0,
    };
    if (!graph) return empty;
    return graph.nodes.reduce((acc, node) => {
      if (node.external) acc.external += 1;
      if (node.external || !node.file) return acc;
      if (node.type === "program") acc.programs += 1;
      if (node.type === "copybook") acc.copybooks += 1;
      if (node.type === "jcl-job") acc.jobs += 1;
      if (node.type === "jcl-step") acc.steps += 1;
      return acc;
    }, empty);
  }, [graph]);

  const searchResults = useMemo(() => {
    if (!graph || !query.trim()) return [];
    return graph.nodes
      .map((node) => ({ node, score: searchResultScore(node, query) }))
      .filter((result): result is { node: GraphNode; score: number } => result.score !== null)
      .sort((left, right) => left.score - right.score)
      .slice(0, 12)
      .map((result) => result.node);
  }, [graph, query]);
  const codebaseGroups = useMemo(() => sourceTreeGroups(graph), [graph]);
  const unreferencedSourceUnits = useMemo(
    () => (graph ? potentiallyUnreferencedSourceUnits(graph).slice(0, 8) : []),
    [graph],
  );
  const focusExpansion = useMemo(
    () => graphExpansionState(graph, focusNodeId, hiddenNodeTypes),
    [focusNodeId, graph, hiddenNodeTypes],
  );
  const focusExpanded = Boolean(focusNodeId && expandedNodeIds.has(focusNodeId));
  const expandDisabled = !focusNodeId || (!focusExpanded && !focusExpansion.hiddenByLimit);
  const expandButtonLabel = focusExpanded ? "Collapse" : focusExpansion.hiddenByLimit ? "Expand" : "Focus complete";
  const expandButtonTitle = focusExpanded
    ? "Collapse expanded neighbors for this focus"
    : focusExpansion.hiddenByLimit
      ? `Show ${focusExpansion.hiddenByLimit} hidden direct neighbors for this focus`
      : "No hidden direct neighbors for this focus; use search or the Codebase browser to jump elsewhere.";

  useEffect(() => {
    let cancelled = false;
    loadAppSettings()
      .then((settings) => {
        if (cancelled || !settings) return;
        setModelSettings(settings.model);
        setScanSettings(settings.scan);
      })
      .catch(() => {
        // Settings are convenience state; defaults keep the app usable.
      })
      .finally(() => {
        if (!cancelled) setAppSettingsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appSettingsLoaded) return;
    const timeout = window.setTimeout(() => {
      saveAppSettings({
        schemaVersion: 1,
        model: modelSettings,
        scan: normalizedScanSettings(scanSettings),
      }).catch(() => {
        // Saving settings should never block codebase exploration.
      });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [appSettingsLoaded, modelSettings, scanSettings]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const graphUrl = new URLSearchParams(window.location.search).get("graph");
    if (!graphUrl) return;

    let cancelled = false;
    fetch(graphUrl)
      .then((response) => response.json() as Promise<GraphDocument>)
      .then((loadedGraph) => {
        if (!cancelled) acceptGraph(loadedGraph, "Demo graph: M6 fixture", sourceBaseForGraphUrl(graphUrl));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!desktopAvailable) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<AnalysisProgress>("analysis-progress", (event) => {
      if (!cancelled) setScanProgress(event.payload);
    }).then((nextUnlisten) => {
      if (cancelled) nextUnlisten();
      else unlisten = nextUnlisten;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [desktopAvailable]);

  useEffect(() => {
    const node = selectedNode;
    const target = sourceFocus ?? (node?.file ? { file: node.file, line: node.lines?.[0] ?? 1, nodeId: node.id } : null);
    if ((!root && !sourceBase) || !target) {
      setSnippet(null);
      setSnippetLoading(false);
      return;
    }

    let cancelled = false;
    setSnippet(null);
    setSnippetLoading(true);
    readSourceSnippet(root, sourceBase, target.file, target.line, scanSettings.encoding)
      .then((result) => {
        if (!cancelled) {
          setSnippet(result);
          setSnippetLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnippet(null);
          setSnippetLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [root, scanSettings.encoding, selectedNode, sourceBase, sourceFocus]);

  useEffect(() => {
    let cancelled = false;
    setKeyDraft("");
    setSettingsMessage("");
    if (!isCloudProvider(modelSettings.provider)) {
      setHasProviderKey(false);
      return;
    }
    if (!canUseTauri()) {
      setHasProviderKey(false);
      setSettingsMessage("Keychain is available in the desktop app.");
      return;
    }

    invoke<boolean>("provider_key_state", { provider: modelSettings.provider })
      .then((result) => {
        if (!cancelled) setHasProviderKey(result);
      })
      .catch(() => {
        if (!cancelled) setHasProviderKey(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modelSettings.provider]);

  useEffect(() => {
    setModelReadiness({ status: "idle", message: "" });
  }, [modelSettings.provider, modelSettings.model, modelSettings.baseUrl, hasProviderKey]);

  useEffect(() => {
    inspectorBodyRef.current?.scrollTo({ top: 0 });
  }, [selectedNodeId]);

  useEffect(() => {
    if (chatStatus === "ready" || chatStatus === "error") {
      setInspectorTab("ask");
      inspectorBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [chatAnswer?.question, chatStatus]);

  useEffect(() => {
    if (selectedEdge) {
      setInspectorTab("relationship");
    }
  }, [selectedEdge]);

  async function chooseFolder() {
    if (!canUseTauri()) {
      setError("Open Folder is available in the desktop app. Use Open Sample to explore the browser demo.");
      setStatus("error");
      return;
    }

    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open COBOL codebase",
    });
    if (typeof selected !== "string") return;

    beginScan(selected);

    try {
      const result = await invoke<GraphDocument>("analyze_codebase", {
        root: selected,
        scan: normalizedScanSettings(scanSettings),
      });
      acceptGraph(result, selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function openSample() {
    if (!canUseTauri()) {
      setRoot("Demo graph: M6 fixture");
      setSourceBase("/m6-bakeoff-source.json");
      setSelectedEdge(null);
      setSourceFocus(null);
      setError("");
      setStatus("running");

      try {
        const response = await fetch("/m6-bakeoff-graph.json");
        if (!response.ok) throw new Error(`Could not load browser demo graph (${response.status}).`);
        const result = (await response.json()) as GraphDocument;
        acceptGraph(result, "Demo graph: M6 fixture", "/m6-bakeoff-source.json");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
      return;
    }

    beginScan("Bundled sample: Mini Bank");

    try {
      const result = await invoke<GraphDocument>("analyze_sample_codebase", {
        scan: normalizedScanSettings(scanSettings),
      });
      acceptGraph(result, "Bundled sample: Mini Bank");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function rescanCurrent() {
    if (!graph) return;
    if (!canUseTauri()) {
      await openSample();
      return;
    }

    if (root === "Bundled sample: Mini Bank") {
      beginScan(root);
      try {
        const result = await invoke<GraphDocument>("analyze_sample_codebase", {
          scan: normalizedScanSettings(scanSettings),
        });
        acceptGraph(result, root);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
      return;
    }

    if (!root) return;
    beginScan(root);
    try {
      const result = await invoke<GraphDocument>("analyze_codebase", {
        root,
        scan: normalizedScanSettings(scanSettings),
      });
      acceptGraph(result, root);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function beginScan(nextRoot: string, nextSourceBase = "") {
    setRoot(nextRoot);
    setSourceBase(nextSourceBase);
    setGraph(null);
    setSnippet(null);
    setSnippetLoading(false);
    setSelectedEdge(null);
    setSourceFocus(null);
    setScanProgress(null);
    setError("");
    setStatus("running");
  }

  function acceptGraph(nextGraph: GraphDocument, nextRoot: string, nextSourceBase = "") {
    const initialFocus = firstFocusableNode(nextGraph);
    setRoot(nextRoot);
    setSourceBase(nextSourceBase);
    setGraph(nextGraph);
    setFocusNodeId(initialFocus);
    setSelectedNodeId(initialFocus);
    setSelectedEdge(null);
    setExpandedNodeIds(new Set());
    setHiddenNodeTypes(new Set());
    setHistory(initialFocus ? [initialFocus] : []);
    setSummaries({});
    setBulkSummaryStatus("");
    setChatAnswer(null);
    setChatHistory([]);
    setChatQuestion("");
    setChatStatus("idle");
    setChatError("");
    setInspectorTab("summary");
    setSourceFocus(null);
    setExportStatus("");
    setScanProgress(null);
    setStatus("ready");
  }

  function focusOnNode(nodeId: string, options: { preserveChat?: boolean } = {}) {
    if (!nodeById.has(nodeId)) return;
    setFocusNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setSelectedEdge(null);
    setSourceFocus(null);
    setExpandedNodeIds(new Set());
    setHistory((current) => [...current.filter((id) => id !== nodeId), nodeId].slice(-8));
    if (!options.preserveChat) {
      setChatQuestion("");
      setChatAnswer(null);
      setChatStatus("idle");
      setChatError("");
      setInspectorTab("summary");
    }
  }

  function selectNode(nodeId: string) {
    focusOnNode(nodeId);
  }

  function selectEdge(edge: GraphEdge | null) {
    if (!edge) {
      setSelectedEdge(null);
      return;
    }
    setSelectedEdge(edge);
    if (edge.site && graph) {
      jumpToCitation({
        file: edge.site.file,
        line: edge.site.line,
        label: edgeLabel(edge, graph),
        nodeId: edge.from,
      }, true);
    }
  }

  function toggleExpandFocus() {
    if (!focusNodeId) return;
    toggleExpandedNode(focusNodeId);
  }

  function toggleExpandedNode(nodeId: string) {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function expandNode(nodeId: string) {
    setExpandedNodeIds((current) => {
      if (current.has(nodeId)) return current;
      const next = new Set(current);
      next.add(nodeId);
      return next;
    });
  }

  function toggleNodeTypeFilter(type: string) {
    setHiddenNodeTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function resetNodeTypeFilters() {
    setHiddenNodeTypes(new Set());
  }

  function focusOnSearchResult(nodeId: string) {
    focusOnNode(nodeId);
    setQuery("");
  }

  function goHome() {
    if (!graph) return;
    const homeNodeId = firstFocusableNode(graph);
    if (!homeNodeId) return;
    setFocusNodeId(homeNodeId);
    setSelectedNodeId(homeNodeId);
    setSelectedEdge(null);
    setSourceFocus(null);
    setExpandedNodeIds(new Set());
    setQuery("");
    setChatQuestion("");
    setChatAnswer(null);
    setChatStatus("idle");
    setChatError("");
    setInspectorTab("summary");
    setHistory([homeNodeId]);
  }

  function chooseProvider(provider: ModelProvider) {
    setModelSettings((current) => settingsForProvider(current, provider));
  }

  async function saveKey() {
    if (!isCloudProvider(modelSettings.provider) || !keyDraft.trim()) return;
    if (!canUseTauri()) {
      setSettingsMessage("Keychain is available in the desktop app.");
      return;
    }
    try {
      await invoke("save_provider_key", {
        provider: modelSettings.provider,
        apiKey: keyDraft.trim(),
      });
      setHasProviderKey(true);
      setKeyDraft("");
      setSettingsMessage("Key saved");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function clearKey() {
    if (!isCloudProvider(modelSettings.provider)) return;
    if (!canUseTauri()) {
      setSettingsMessage("Keychain is available in the desktop app.");
      return;
    }
    try {
      await invoke("clear_provider_key", { provider: modelSettings.provider });
      setHasProviderKey(false);
      setSettingsMessage("Key cleared");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function checkModelReadiness() {
    try {
      if (!isCloudProvider(modelSettings.provider)) {
        setModelReadiness({ status: "checking", message: "Checking local generation with a quick probe" });
        const message = await checkOllamaReadiness(modelSettings, {
          verifyGeneration: true,
          generationTimeoutMs: MODEL_READINESS_TIMEOUT_MS,
        });
        setModelReadiness({ status: "ready", message });
        return;
      }
      await prepareModelCall();
    } catch (err) {
      setModelReadiness({ status: "error", message: friendlyModelError(err, modelSettings) });
    }
  }

  async function prepareModelCall() {
    setModelReadiness({ status: "checking", message: "Checking AI settings" });
    try {
      if (isCloudProvider(modelSettings.provider)) {
        if (!canUseTauri()) {
          throw new Error("Cloud API keys are stored in the desktop keychain. Use the desktop app to check cloud AI settings.");
        }
        if (!hasProviderKey) {
          throw new Error(`Save a ${PROVIDER_LABELS[modelSettings.provider]} key before using cloud AI.`);
        }
        const apiKey = await providerKeyForModel(modelSettings);
        setModelReadiness({
          status: "ready",
          message: `${PROVIDER_LABELS[modelSettings.provider]} key is saved. Cloud calls happen only when you run AI Summary or non-graph Ask.`,
        });
        return apiKey;
      }

      const message = await checkOllamaReadiness(modelSettings);
      setModelReadiness({ status: "ready", message });
      return undefined;
    } catch (err) {
      const message = friendlyModelError(err, modelSettings);
      setModelReadiness({ status: "error", message });
      throw new Error(message);
    }
  }

  async function generateSelectedSummary() {
    if (!graph || !selectedNode) return;
    setInspectorTab("summary");
    await generateSummaryForNode(selectedNode);
  }

  async function generateAllSummaries() {
    if (!graph || !summaryNodes.length) return;
    setInspectorTab("summary");
    setBulkSummaryStatus(`0/${summaryNodes.length}`);
    for (let index = 0; index < summaryNodes.length; index += 1) {
      const generated = await generateSummaryForNode(summaryNodes[index]);
      if (!generated) {
        setBulkSummaryStatus(`Stopped at ${index}/${summaryNodes.length}`);
        return;
      }
      setBulkSummaryStatus(`${index + 1}/${summaryNodes.length}`);
    }
  }

  async function generateSummaryForNode(node: GraphNode) {
    if (!graph || !node.file) return false;
    setSummaries((current) => ({
      ...current,
      [node.id]: { status: "running" },
    }));

    try {
      const excerpt = await sourceExcerptForNode(node);
      const apiKey = await prepareModelCall();
      const summary = await runTimedModelCall("Summary generation", activeSummaryAbortRef, (abortSignal) =>
        generateUnitSummary({
          graph,
          node,
          excerpt,
          settings: modelSettings,
          apiKey,
          abortSignal,
        }),
      );
      setModelCallCount((count) => count + 1);
      setSummaries((current) => ({
        ...current,
        [node.id]: { status: "ready", summary },
      }));
      return true;
    } catch (err) {
      setSummaries((current) => ({
        ...current,
        [node.id]: { status: "error", error: friendlyModelError(err, modelSettings) },
      }));
      return false;
    }
  }

  async function sourceExcerptForNode(node: GraphNode) {
    if (!node.file) {
      throw new Error("Open a codebase from the desktop app before using model features.");
    }
    if (!root && !sourceBase) {
      throw new Error("Open Sample or open a desktop codebase before using model features.");
    }
    const startLine = node.lines?.[0] ?? 1;
    const endLine = node.lines?.[1] ?? startLine;
    return readSourceExcerpt(root, sourceBase, node.file, startLine, endLine, 220, scanSettings.encoding);
  }

  async function askQuestion(questionDraft = chatQuestion) {
    if (!graph || !questionDraft.trim()) return;
    const question = questionDraft.trim();
    setChatQuestion(question);
    setChatStatus("running");
    setChatError("");
    let context: RetrievedContext | null = null;

    try {
      context = await retrieveQuestionContext({
        graph,
        question,
        preferredNode: selectedNode,
        readExcerpt: sourceExcerptForNode,
      });
      if (isGraphQuestion(question)) {
        const fallback = graphAnswerFallback(graph, question, context);
        const graphAnswer: ChatAnswer = { question, text: fallback.text, citations: fallback.citations, source: "graph" };
        setChatAnswer(graphAnswer);
        rememberChatAnswer(graphAnswer);
        setChatStatus("ready");
        if (context.focusNodes[0] && shouldSyncAskFocus(question)) {
          focusOnNode(context.focusNodes[0].id, { preserveChat: true });
        }
        return;
      }
      const answerContext = context;
      const apiKey = await prepareModelCall();
      const answer = await runTimedModelCall("Ask", activeChatAbortRef, (abortSignal) =>
        generateGroundedAnswer({
          question,
          context: answerContext,
          settings: modelSettings,
          apiKey,
          abortSignal,
        }),
      );
      setModelCallCount((count) => count + 1);
      const modelAnswer: ChatAnswer = {
        question,
        text: answer.text,
        citations: answerContext.citations,
        source: "model",
        guarded: answer.guarded,
      };
      setChatAnswer(modelAnswer);
      rememberChatAnswer(modelAnswer);
      setChatStatus("ready");
      if (answerContext.focusNodes[0] && shouldSyncAskFocus(question)) {
        focusOnNode(answerContext.focusNodes[0].id, { preserveChat: true });
      }
    } catch (err) {
      if (context) {
        const fallback = graphAnswerFallback(graph, question, context, friendlyModelError(err, modelSettings));
        const fallbackAnswer: ChatAnswer = { question, text: fallback.text, citations: fallback.citations, source: "graph" };
        setChatAnswer(fallbackAnswer);
        rememberChatAnswer(fallbackAnswer);
        setChatStatus("ready");
        if (context.focusNodes[0] && shouldSyncAskFocus(question)) {
          focusOnNode(context.focusNodes[0].id, { preserveChat: true });
        }
        return;
      }
      setChatError(friendlyModelError(err, modelSettings));
      setChatStatus("error");
    }
  }

  function rememberChatAnswer(answer: ChatAnswer) {
    setChatHistory((current) => [
      answer,
      ...current.filter((item) => item.question !== answer.question || item.text !== answer.text),
    ].slice(0, 6));
  }

  function restoreChatAnswer(answer: ChatAnswer) {
    setChatQuestion(answer.question);
    setChatAnswer(answer);
    setChatStatus("ready");
    setChatError("");
    setInspectorTab("ask");
  }

  function clearChatHistory() {
    setChatHistory([]);
    setChatAnswer(null);
    setChatQuestion("");
    setChatStatus("idle");
    setChatError("");
  }

  function explainSelectedNode() {
    if (!selectedNode || !graph) return;
    const question = `Explain ${selectedNode.name} from the graph.`;
    const answer: ChatAnswer = {
      question,
      ...selectedNodeGraphAnswer(selectedNode, graph),
      source: "graph",
    };
    setChatQuestion(question);
    setChatAnswer(answer);
    rememberChatAnswer(answer);
    setChatStatus("ready");
    setChatError("");
    focusOnNode(selectedNode.id, { preserveChat: true });
    setInspectorTab("ask");
  }

  function askPresetQuestion(question: string) {
    if (selectedNode && question === `Explain ${selectedNode.name} from the graph.`) {
      explainSelectedNode();
      return;
    }
    askQuestion(question);
  }

  function cancelAsk() {
    activeChatAbortRef.current?.abort();
  }

  function cancelSummary() {
    activeSummaryAbortRef.current?.abort();
  }

  function jumpToCitation(citation: Citation, keepEdge = false) {
    const citedEdge = graph?.edges.find(
      (edge) =>
        edge.site?.file === citation.file &&
        edge.site.line === citation.line &&
        edgeLabel(edge, graph) === citation.label,
    );
    const citedNode =
      (citation.nodeId ? nodeById.get(citation.nodeId) : undefined) ??
      (citedEdge ? nodeById.get(citedEdge.from) : undefined) ??
      graph?.nodes.find(
        (node) =>
          node.file === citation.file &&
          (node.lines?.[0] ?? 1) <= citation.line &&
          (node.lines?.[1] ?? Number.MAX_SAFE_INTEGER) >= citation.line,
      );

    if (citedNode) {
      setFocusNodeId(citedNode.id);
      setSelectedNodeId(citedNode.id);
      setHistory((current) => [...current.filter((id) => id !== citedNode.id), citedNode.id].slice(-8));
    }
    if (citedEdge) {
      setSelectedEdge(citedEdge);
      setInspectorTab("relationship");
    } else if (!keepEdge) {
      setSelectedEdge(null);
    }
    setSourceFocus({ file: citation.file, line: citation.line, nodeId: citedNode?.id });
  }

  async function exportDocs() {
    if (!graph) return;
    setExportStatus("Exporting");
    try {
      const docs = buildDocumentationExport(graph, summaries, focusNodeId);
      if (!canUseTauri()) {
        const files = await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
        setExportStatus(`Downloaded ${Object.values(files).join(", ")}`);
        return;
      }
      const prefix = documentationExportPrefix(docs);
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Export Cobolens documentation",
      });

      if (typeof selected === "string") {
        const png = await documentationPngBytes(graph, focusNodeId, docs.diagramTitle);
        const target = await invoke<string>("write_export_files", {
          outputDir: selected,
          prefix,
          markdown: docs.markdown,
          mermaid: docs.mermaid,
          png,
        });
        setExportStatus(`Exported to ${target}`);
        return;
      }

      const files = await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
      setExportStatus(`Downloaded ${Object.values(files).join(", ")}`);
    } catch {
      try {
        const docs = buildDocumentationExport(graph, summaries, focusNodeId);
        const files = await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
        setExportStatus(`Downloaded ${Object.values(files).join(", ")}`);
      } catch (fallbackErr) {
        setExportStatus(fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
      }
    }
  }

  window.__cobolensLoadGraph = (nextGraph, nextRoot = "", nextSourceBase = "") => {
    acceptGraph(nextGraph, nextRoot, nextSourceBase);
  };

  return (
    <main className="workspace" aria-label="Cobolens workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Cobolens</span>
        </div>

        <label className="global-search">
          <span>Search</span>
          <input
            type="search"
            aria-label="Search symbols"
            placeholder="Search symbols"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            disabled={!graph}
          />
        </label>

        <nav className="breadcrumbs" aria-label="Breadcrumb history">
          <button type="button" onClick={goHome} disabled={!graph}>
            Home
          </button>
          {breadcrumbNodeIds.map((nodeId) => (
            <button key={nodeId} type="button" onClick={() => focusOnNode(nodeId)}>
              {nodeById.get(nodeId)?.name ?? nodeId}
            </button>
          ))}
          {focusedNode ? (
            <span className="current-crumb" aria-current="page" title={focusedNode.name}>
              {focusedNode.name}
            </span>
          ) : null}
        </nav>

        <div
          className={`mode-indicator ${modelSettings.privacyMode}`}
          aria-label={privacyModeLabel(modelSettings)}
          title={privacyModeLabel(modelSettings)}
        >
          {modelSettings.privacyMode === "local" ? "Local: no code leaves" : `Cloud: ${PROVIDER_LABELS[modelSettings.provider]}`}
        </div>
      </header>

      <section className="shell">
        <aside className="left-pane" aria-label="Navigator">
          <section className="pane-block">
            <h2>Ingest</h2>
            {desktopAvailable ? (
              <>
                <button className="primary-action" type="button" onClick={chooseFolder} title="Open a local COBOL codebase">
                  Open Folder
                </button>
                <button type="button" onClick={openSample}>
                  Open Sample
                </button>
                <button type="button" onClick={rescanCurrent} disabled={!graph || status === "running"} title="Re-scan the current folder">
                  Re-scan
                </button>
              </>
            ) : (
              <>
                <button className="primary-action" type="button" onClick={openSample}>
                  Open Sample
                </button>
                <div className="desktop-preview-note">Open Folder, Re-scan, and scan settings run in the desktop app.</div>
              </>
            )}
            <div className="path-label">{root || "No codebase selected"}</div>
            <div className={`status-pill ${status}`}>{statusLabel(status)}</div>
            {status === "running" ? <div className="scan-progress">{scanProgressLabel(scanProgress)}</div> : null}
            {status === "error" && error ? <div className="inline-error">{error}</div> : null}
            {desktopAvailable ? (
              <ScanSettingsPanel
                settings={scanSettings}
                disabled={status === "running"}
                onSettingsChange={setScanSettings}
              />
            ) : null}
          </section>

          <section className="pane-block">
            <h2>Symbols</h2>
            <div className="search-results">
              {searchResults.length ? (
                searchResults.map((node) => (
                  <button key={node.id} type="button" onClick={() => focusOnSearchResult(node.id)}>
                    <span className="swatch" style={{ background: nodeColor(node.type) }} />
                    <span>{node.name}</span>
                    <small>{node.type}</small>
                  </button>
                ))
              ) : (
                <div className="empty-copy">
                  {graph ? (query.trim() ? "No matching symbols." : "Type to search symbols.") : "Open a folder to index symbols."}
                </div>
              )}
            </div>
          </section>

          <section className="pane-block">
            <div className="pane-heading-row">
              <h2>Legend & Filters</h2>
              <button type="button" onClick={resetNodeTypeFilters} disabled={!hiddenNodeTypes.size}>
                Reset
              </button>
            </div>
            <div className="settings-footnote">
              {hiddenNodeTypes.size
                ? `${hiddenNodeTypes.size} type${hiddenNodeTypes.size === 1 ? "" : "s"} hidden`
                : "All types visible"}
            </div>
            <div className="filter-grid">
              {LEGEND_NODE_TYPES.map(([type, label]) => (
                <LegendItem
                  key={type}
                  type={type}
                  label={label}
                  checked={!hiddenNodeTypes.has(type)}
                  disabled={!graph}
                  onToggle={() => toggleNodeTypeFilter(type)}
                />
              ))}
            </div>
          </section>

          <SourceTree groups={codebaseGroups} selectedNodeId={focusNodeId} onSelectNode={focusOnNode} />

          <section className="pane-block">
            <h2>Inventory</h2>
            <Metric label="Files" value={graph?.meta.fileCount ?? 0} />
            <Metric label="Parsed" value={graph?.meta.parsedFileCount ?? 0} />
            <Metric label="Source programs" value={counts.programs} />
            <Metric label="Copybooks" value={counts.copybooks} />
            <Metric label="JCL jobs" value={counts.jobs} />
            <Metric label="JCL steps" value={counts.steps} />
            <Metric label="External refs" value={counts.external} />
          </section>

          <ParseHealth graph={graph} onOpenWarning={jumpToCitation} />

          <GraphHints
            graph={graph}
            unreferencedSourceUnits={unreferencedSourceUnits}
            onFocusNode={focusOnNode}
          />

          <ModelSettingsPanel
            settings={modelSettings}
            keyDraft={keyDraft}
            hasProviderKey={hasProviderKey}
            message={settingsMessage}
            onProviderChange={chooseProvider}
            onSettingsChange={setModelSettings}
            onKeyDraftChange={setKeyDraft}
            onSaveKey={saveKey}
            onClearKey={clearKey}
            onCheckModel={checkModelReadiness}
            modelReadiness={modelReadiness}
            modelCallCount={modelCallCount}
            bulkTokenEstimate={bulkTokenEstimate}
          />

          <section className="pane-block">
            <h2>Export</h2>
            <button type="button" onClick={exportDocs} disabled={!graph}>
              Export Docs
            </button>
            <div className="settings-footnote">{exportStatus || "Markdown, Mermaid, PNG"}</div>
          </section>
        </aside>

        <section className="graph-pane" aria-label="Dependency graph">
          {focusedNode ? (
            <div className="graph-toolbar">
              <div>
                <span>Dependency Map</span>
                <small>{focusedNode.name}</small>
              </div>
              <button
                type="button"
                onClick={toggleExpandFocus}
                disabled={expandDisabled}
                title={expandButtonTitle}
                aria-label={expandButtonTitle}
              >
                {expandButtonLabel}
              </button>
            </div>
          ) : null}
          <div className="graph-canvas">
            <GraphView
              graph={graph}
              focusNodeId={focusNodeId}
              expandedNodeIds={expandedNodeIds}
              hiddenNodeTypes={hiddenNodeTypes}
              selectedEdge={selectedEdge}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
              onExpandNode={expandNode}
              canOpenFolder={desktopAvailable}
              onOpenFolder={chooseFolder}
              onOpenSample={openSample}
            />
          </div>
        </section>

        <aside className={`right-pane${inspectorTab === "ask" ? " is-ask-focused" : ""}`} aria-label="Code and summaries">
          <section className="code-panel">
            <div className="panel-title">Code</div>
            {selectedNode ? (
              <CodeSnippet node={selectedNode} snippet={snippet} loading={snippetLoading} />
            ) : (
              <pre>
                <code>No source selected.</code>
              </pre>
            )}
          </section>

          <section className="chat-panel">
            <div className="panel-title panel-title-row">
              <span>Inspector</span>
              <small>{selectedNode ? `- ${selectedNode.type}` : "- No selection"}</small>
            </div>
            <InspectorTabs
              activeTab={inspectorTab}
              summaryStatus={selectedSummaryState?.status}
              dependencyCount={selectedNode ? dependencyCounts(selectedNode, graph).total : 0}
              selectedRelationship={Boolean(selectedEdge)}
              onChange={setInspectorTab}
            />
            <div className="summary-stack" ref={inspectorBodyRef}>
              {inspectorTab === "ask" ? (
                <ChatAnswerPanel
                  status={chatStatus}
                  answer={chatAnswer}
                  history={chatHistory}
                  error={chatError}
                  node={selectedNode}
                  settings={modelSettings}
                  modelReadiness={modelReadiness}
                  question={chatQuestion}
                  canAsk={Boolean(graph)}
                  onQuestionChange={setChatQuestion}
                  onAsk={() => askQuestion()}
                  onCancel={cancelAsk}
                  onAskPreset={askPresetQuestion}
                  onRestoreAnswer={restoreChatAnswer}
                  onClearHistory={clearChatHistory}
                  onOpenCitation={jumpToCitation}
                />
              ) : null}
              {inspectorTab === "summary" ? (
                <SummaryDock
                  node={selectedNode}
                  graph={graph}
                  state={selectedSummaryState}
                  settings={modelSettings}
                  summaryUnitCount={summaryNodes.length}
                  bulkStatus={bulkSummaryStatus}
                  onGenerateSelected={generateSelectedSummary}
                  onGenerateAll={generateAllSummaries}
                  onCancelSummary={cancelSummary}
                  onExplainNode={explainSelectedNode}
                  onOpenCitation={jumpToCitation}
                />
              ) : null}
              {inspectorTab === "impact" ? (
                <LineageImpactPanel
                  node={selectedNode}
                  graph={graph}
                  onFocusNode={focusOnNode}
                  onOpenEdge={(edge) => {
                    if (!edge.site || !graph) return;
                    setSelectedEdge(edge);
                    jumpToCitation({
                      file: edge.site.file,
                      line: edge.site.line,
                      label: edgeLabel(edge, graph),
                      nodeId: edge.from,
                    }, true);
                  }}
                />
              ) : null}
              {inspectorTab === "relationship" ? (
                <RelationshipDetails
                  selectedEdge={selectedEdge}
                  node={selectedNode}
                  graph={graph}
                  onFocusNode={focusOnNode}
                  onOpenEdge={(edge) => {
                    if (!edge.site || !graph) return;
                    setSelectedEdge(edge);
                    jumpToCitation({
                      file: edge.site.file,
                      line: edge.site.line,
                      label: edgeLabel(edge, graph),
                      nodeId: edge.from,
                    }, true);
                  }}
                />
              ) : null}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ScanSettingsPanel({
  settings,
  disabled,
  onSettingsChange,
}: {
  settings: ScanSettings;
  disabled: boolean;
  onSettingsChange: (settings: ScanSettings) => void;
}) {
  return (
    <div className="scan-settings" aria-label="Scan settings">
      <label className="form-row">
        <span>Format</span>
        <select
          value={settings.format}
          disabled={disabled}
          onChange={(event) => onSettingsChange({ ...settings, format: event.currentTarget.value as ScanFormat })}
        >
          <option value="auto">Auto</option>
          <option value="fixed">Fixed</option>
          <option value="free">Free</option>
        </select>
      </label>
      <label className="form-row">
        <span>Extensions</span>
        <input
          value={settings.extensions}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => onSettingsChange({ ...settings, extensions: event.currentTarget.value })}
        />
      </label>
      <label className="form-row">
        <span>Encoding</span>
        <select
          value={settings.encoding}
          disabled={disabled}
          onChange={(event) => onSettingsChange({ ...settings, encoding: event.currentTarget.value })}
        >
          <option value="utf8">UTF-8</option>
          <option value="cp037">CP037 / EBCDIC US</option>
        </select>
      </label>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ParseHealth({
  graph,
  onOpenWarning,
}: {
  graph: GraphDocument | null;
  onOpenWarning: (citation: Citation) => void;
}) {
  const parseErrors = graph?.meta.parseErrors ?? [];
  const visibleErrors = parseErrors.slice(0, 5);
  const hiddenCount = Math.max(0, parseErrors.length - visibleErrors.length);
  const parsed = graph?.meta.parsedFileCount ?? 0;
  const total = graph?.meta.fileCount ?? 0;

  return (
    <section className="pane-block parse-health">
      <h2>Parse Health</h2>
      <div className={`status-pill ${parseErrors.length ? "running" : graph ? "ready" : "idle"}`}>
        {graph ? `${parsed}/${total} parsed` : "No graph"}
      </div>
      {graph ? <div className="settings-footnote">Dialect: {graph.meta.dialectGuess || "unknown"}</div> : null}
      {graph && !parseErrors.length ? (
        <div className="settings-footnote ready">No parse warnings.</div>
      ) : parseErrors.length ? (
        <ul className="parse-warning-list">
          {visibleErrors.map((error) => {
            const line = error.line && error.line > 0 ? error.line : undefined;
            return (
              <li key={`${error.file}:${error.reason}`}>
                {line ? (
                  <button
                    type="button"
                    onClick={() => onOpenWarning({ file: error.file, line, label: "Parse warning" })}
                    title={`Show ${parseErrorSite(error)}`}
                  >
                    {parseErrorSite(error)}
                  </button>
                ) : (
                  <strong title={error.file}>{error.file}</strong>
                )}
                <span>{error.reason}</span>
              </li>
            );
          })}
          {hiddenCount ? <li className="parse-warning-more">+{hiddenCount} more parse warnings</li> : null}
        </ul>
      ) : (
        <div className="settings-footnote">Open a folder or sample to see parse coverage.</div>
      )}
    </section>
  );
}

function GraphHints({
  graph,
  unreferencedSourceUnits,
  onFocusNode,
}: {
  graph: GraphDocument | null;
  unreferencedSourceUnits: GraphNode[];
  onFocusNode: (nodeId: string) => void;
}) {
  return (
    <section className="pane-block graph-hints" aria-label="Graph hints">
      <h2>Graph Hints</h2>
      {graph ? (
        <>
          <div className="metric-row">
            <span>Potentially unreferenced</span>
            <strong>{unreferencedSourceUnits.length}</strong>
          </div>
          {unreferencedSourceUnits.length ? (
            <div className="hint-list">
              {unreferencedSourceUnits.map((node) => (
                <button key={node.id} type="button" onClick={() => onFocusNode(node.id)}>
                  <span className="swatch" style={{ background: nodeColor(node.type) }} />
                  <span title={node.name}>{node.name}</span>
                  <small>{node.type}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="settings-footnote ready">No unreferenced source units recorded.</div>
          )}
          <div className="settings-footnote">Based on recorded incoming graph edges; external schedulers may still call entry programs.</div>
        </>
      ) : (
        <div className="empty-copy">Open a folder or sample to see graph hints.</div>
      )}
    </section>
  );
}

type SourceTreeGroup = {
  title: string;
  nodes: GraphNode[];
};

function SourceTree({
  groups,
  selectedNodeId,
  onSelectNode,
}: {
  groups: SourceTreeGroup[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  return (
    <section className="pane-block source-tree" aria-label="Codebase browser">
      <h2>Codebase</h2>
      {groups.length ? (
        groups.map((group) => (
          <div className="source-tree-group" key={group.title}>
            <div className="source-tree-heading">
              <span>{group.title}</span>
              <strong>{group.nodes.length}</strong>
            </div>
            <div className="source-tree-list">
              {group.nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={node.id === selectedNodeId ? "is-active" : undefined}
                  onClick={() => onSelectNode(node.id)}
                >
                  <span className="swatch" style={{ background: nodeColor(node.type) }} />
                  <span title={node.name}>{node.name}</span>
                  <small>{node.file ?? "external"}</small>
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="empty-copy">Open a folder or sample to browse source units.</div>
      )}
    </section>
  );
}

function LegendItem({
  type,
  label,
  checked,
  disabled,
  onToggle,
}: {
  type: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="filter-row">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
      <span className="swatch" style={{ background: nodeColor(type) }} />
      <span>{label}</span>
    </label>
  );
}

function ModelSettingsPanel({
  settings,
  keyDraft,
  hasProviderKey,
  message,
  modelCallCount,
  bulkTokenEstimate,
  onProviderChange,
  onSettingsChange,
  onKeyDraftChange,
  onSaveKey,
  onClearKey,
  onCheckModel,
  modelReadiness,
}: {
  settings: ModelSettings;
  keyDraft: string;
  hasProviderKey: boolean;
  message: string;
  modelCallCount: number;
  bulkTokenEstimate: number;
  onProviderChange: (provider: ModelProvider) => void;
  onSettingsChange: (settings: ModelSettings) => void;
  onKeyDraftChange: (value: string) => void;
  onSaveKey: () => void;
  onClearKey: () => void;
  onCheckModel: () => void;
  modelReadiness: ModelReadiness;
}) {
  const cloud = isCloudProvider(settings.provider);

  return (
    <section className="pane-block model-settings">
      <h2>AI</h2>
      <label className="form-row">
        <span>Provider</span>
        <select
          value={settings.provider}
          onChange={(event) => onProviderChange(event.currentTarget.value as ModelProvider)}
        >
          {Object.entries(PROVIDER_LABELS).map(([provider, label]) => (
            <option key={provider} value={provider}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="form-row">
        <span>Model</span>
        <input
          value={settings.model}
          onChange={(event) => onSettingsChange({ ...settings, model: event.currentTarget.value })}
        />
      </label>
      {settings.provider === "ollama" ? (
        <label className="form-row">
          <span>Host</span>
          <input
            value={settings.baseUrl}
            onChange={(event) => onSettingsChange({ ...settings, baseUrl: event.currentTarget.value })}
          />
        </label>
      ) : (
        <label className="form-row">
          <span>API key</span>
          <input
            type="password"
            value={keyDraft}
            placeholder={hasProviderKey ? "Saved in keychain" : ""}
            onChange={(event) => onKeyDraftChange(event.currentTarget.value)}
          />
        </label>
      )}
      <label className="form-row">
        <span>Rosetta</span>
        <select
          value={settings.rosettaLanguage}
          onChange={(event) => onSettingsChange({ ...settings, rosettaLanguage: event.currentTarget.value })}
        >
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="java">Java</option>
          <option value="c#">C#</option>
        </select>
      </label>
      <div className={cloud ? "button-row three" : "button-row single"}>
        <button type="button" onClick={onCheckModel} disabled={modelReadiness.status === "checking"}>
          {modelReadiness.status === "checking" ? "Checking" : "Check AI"}
        </button>
        {cloud ? (
          <>
            <button type="button" onClick={onSaveKey} disabled={!keyDraft.trim()}>
              Save Key
            </button>
            <button type="button" onClick={onClearKey} disabled={!hasProviderKey}>
              Clear
            </button>
          </>
        ) : null}
      </div>
      <div className={`settings-footnote ${modelReadiness.status}`}>
        {modelReadiness.message || (cloud ? message || (hasProviderKey ? "Key ready" : "No key") : "Local mode: model calls stay on this machine.")}
      </div>
      <div className="ai-usage" aria-label="AI usage and token estimate">
        <div>
          <span>{cloud ? "Cloud calls this session" : "Local calls this session"}</span>
          <strong>{modelCallCount}</strong>
        </div>
        <div>
          <span>Bulk summary input estimate</span>
          <strong>{bulkTokenEstimate.toLocaleString()}</strong>
        </div>
        <p>
          {cloud
            ? `Non-graph Ask and summaries send cited context to ${PROVIDER_LABELS[settings.provider]} only when you run them.`
            : "Graph answers need no model; summaries and non-graph Ask use localhost Ollama only when you run them."}
        </p>
      </div>
    </section>
  );
}

function InspectorTabs({
  activeTab,
  summaryStatus,
  dependencyCount,
  selectedRelationship,
  onChange,
}: {
  activeTab: InspectorTab;
  summaryStatus?: SummaryStatus;
  dependencyCount: number;
  selectedRelationship: boolean;
  onChange: (tab: InspectorTab) => void;
}) {
  const tabs: Array<{ id: InspectorTab; label: string; badge?: string }> = [
    { id: "summary", label: "Overview", badge: summaryStatus === "running" ? "..." : undefined },
    { id: "ask", label: "Ask" },
    { id: "impact", label: "Impact", badge: dependencyCount ? String(dependencyCount) : undefined },
    { id: "relationship", label: "Links", badge: selectedRelationship ? "1" : dependencyCount ? String(dependencyCount) : undefined },
  ];

  return (
    <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-label={tab.badge ? `${tab.label} (${tab.badge})` : tab.label}
          className={activeTab === tab.id ? "is-active" : undefined}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.badge ? <small>{` ${tab.badge}`}</small> : null}
        </button>
      ))}
    </div>
  );
}

function SummaryDock({
  node,
  graph,
  state,
  settings,
  summaryUnitCount,
  bulkStatus,
  onGenerateSelected,
  onGenerateAll,
  onCancelSummary,
  onExplainNode,
  onOpenCitation,
}: {
  node: GraphNode | null;
  graph: GraphDocument | null;
  state?: SummaryState;
  settings: ModelSettings;
  summaryUnitCount: number;
  bulkStatus: string;
  onGenerateSelected: () => void;
  onGenerateAll: () => void;
  onCancelSummary: () => void;
  onExplainNode: () => void;
  onOpenCitation: (citation: Citation) => void;
}) {
  const elapsedSeconds = useElapsedSeconds(state?.status === "running");
  const evidence = useMemo(() => (node && graph ? summaryEvidenceCitations(node, graph) : []), [graph, node]);
  const generating = state?.status === "running";

  return (
    <section className="summary-card">
      <div className="summary-actions">
        <div>
          <strong>Overview</strong>
          <span>
            {node ? `${node.name} - graph facts and source evidence` : "No symbol selected"}
            {node?.file ? `; AI summary uses ${PROVIDER_LABELS[settings.provider]} / ${settings.model} only when run` : ""}
          </span>
        </div>
        <div className="summary-action-buttons">
          <button
            type="button"
            onClick={onExplainNode}
            disabled={!node}
            title={node ? "Open Ask with a cited graph explanation" : "Select a symbol to ask about it"}
          >
            Explain from graph
          </button>
          <button
            type="button"
            onClick={generating ? onCancelSummary : onGenerateSelected}
            disabled={!generating && !node?.file}
            title={
              generating
                ? "Stop the running summary request"
                : !node?.file
                  ? "Select a symbol with source to summarize"
                  : "Generate an AI summary for this symbol"
            }
          >
            {generating ? "Stop" : state?.summary ? "Regenerate Summary" : "Generate AI Summary"}
          </button>
        </div>
      </div>
      <div className="summary-output">
        {state?.status === "ready" && state.summary ? (
          <>
            {state.summary.guarded ? (
              <div className="summary-guard-note" role="status">
                {PROVIDER_LABELS[settings.provider]} missed citation rules; showing a graph-grounded fallback.
              </div>
            ) : null}
            <MessageText text={state.summary.text} />
            <EvidenceList citations={evidence} onOpenCitation={onOpenCitation} />
          </>
        ) : state?.status === "running" ? (
          <ProgressNote
            label="Generating grounded summary"
            detail={aiProgressDetail(settings, elapsedSeconds)}
            elapsedSeconds={elapsedSeconds}
          />
        ) : state?.status === "error" ? (
          <p className="error-text">{state.error}</p>
        ) : node && graph ? (
          <>
            <MessageText text={nodeGraphOverview(node, graph)} />
            <EvidenceList citations={evidence} onOpenCitation={onOpenCitation} />
          </>
        ) : (
          <p>Select a graph node to inspect its source, relationships, and graph overview.</p>
        )}
      </div>
      <div className="summary-meta">
        <button type="button" onClick={onGenerateAll} disabled={!summaryUnitCount || generating}>
          Summarize all with AI
        </button>
        <span>{bulkStatus || `${summaryUnitCount} source units`}</span>
      </div>
    </section>
  );
}

function dependencyCounts(node: GraphNode, graph: GraphDocument | null) {
  if (!graph) return { incoming: 0, outgoing: 0, total: 0 };
  const incoming = graph.edges.filter((edge) => edge.to === node.id).length;
  const outgoing = graph.edges.filter((edge) => edge.from === node.id).length;
  return { incoming, outgoing, total: incoming + outgoing };
}

function sourceTreeGroups(graph: GraphDocument | null): SourceTreeGroup[] {
  if (!graph) return [];
  const groupSpecs: Array<[string, string[]]> = [
    ["Programs", ["program"]],
    ["Copybooks", ["copybook"]],
    ["JCL", ["jcl-job", "jcl-step"]],
  ];

  return groupSpecs
    .map(([title, types]) => ({
      title,
      nodes: graph.nodes
        .filter((node) => types.includes(node.type) && node.file && !node.external)
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .filter((group) => group.nodes.length);
}

function graphExpansionState(graph: GraphDocument | null, focusNodeId: string, hiddenNodeTypes: Set<string>) {
  if (!graph || !focusNodeId) return { hiddenByLimit: 0 };
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const countsByType = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.from !== focusNodeId && edge.to !== focusNodeId) continue;
    const neighborId = edge.from === focusNodeId ? edge.to : edge.from;
    const neighbor = nodeById.get(neighborId);
    if (!neighbor || hiddenNodeTypes.has(neighbor.type)) continue;
    countsByType.set(neighbor.type, (countsByType.get(neighbor.type) ?? 0) + 1);
  }

  let hiddenByLimit = 0;
  for (const count of countsByType.values()) {
    hiddenByLimit += Math.max(0, count - FOCUS_DIRECT_LIMIT_PER_TYPE);
  }
  return { hiddenByLimit };
}

function ChatAnswerPanel({
  status,
  answer,
  history,
  error,
  node,
  settings,
  modelReadiness,
  question,
  canAsk,
  onQuestionChange,
  onAsk,
  onCancel,
  onAskPreset,
  onRestoreAnswer,
  onClearHistory,
  onOpenCitation,
}: {
  status: ChatStatus;
  answer: ChatAnswer | null;
  history: ChatAnswer[];
  error: string;
  node: GraphNode | null;
  settings: ModelSettings;
  modelReadiness: ModelReadiness;
  question: string;
  canAsk: boolean;
  onQuestionChange: (question: string) => void;
  onAsk: () => void;
  onCancel: () => void;
  onAskPreset: (question: string) => void;
  onRestoreAnswer: (answer: ChatAnswer) => void;
  onClearHistory: () => void;
  onOpenCitation: (citation: Citation) => void;
}) {
  const starterQuestions = suggestedGraphQuestions(node);
  const explainQuestion = node ? `Explain ${node.name} from the graph.` : "";
  const elapsedSeconds = useElapsedSeconds(status === "running");
  const questionText = question.trim();
  const workingWithModel = Boolean(questionText && !isGraphQuestion(questionText));
  const answerSubtitle =
    status === "running"
      ? workingWithModel
        ? `${PROVIDER_LABELS[settings.provider]} is answering with cited graph context`
        : "Answering from graph context"
      : answer?.guarded
        ? `${PROVIDER_LABELS[settings.provider]} missed citation rules; showing graph-grounded fallback`
        : answer?.source === "graph" && workingWithModel
          ? "Graph-grounded fallback; model answer unavailable"
        : answer?.source === "model"
        ? `${PROVIDER_LABELS[settings.provider]} answer with cited graph context`
        : workingWithModel
          ? `${PROVIDER_LABELS[settings.provider]} will answer with cited graph context`
          : "Graph shortcuts answer without a model";
  const progressLabel = workingWithModel ? `Using ${PROVIDER_LABELS[settings.provider]}` : "Answering from graph context";
  const askButtonLabel = status === "running" ? "Stop" : workingWithModel ? "Ask AI" : questionText ? "Ask Graph" : "Ask";
  const previousAnswers = history.filter((item) => item !== answer).slice(0, 5);
  const showReadiness = workingWithModel && modelReadiness.status !== "idle" && modelReadiness.message;
  const emptyResponseText = questionText
    ? workingWithModel
      ? `Ready to ask ${PROVIDER_LABELS[settings.provider]} with cited graph and source context.`
      : "Ready to answer instantly from the dependency graph."
    : "Use a graph shortcut for instant cited answers. Type a broader question to use the selected AI provider with the retrieved code slice.";

  return (
    <section className="answer-card">
      <div className="answer-header">
        <div>
          <strong>Ask</strong>
          <span>{answerSubtitle}</span>
        </div>
      </div>
      <div className="answer-modes" aria-label="Ask modes">
        <span className={!workingWithModel ? "is-active" : undefined}>Graph instant</span>
        <span className={workingWithModel ? "is-active" : undefined}>{PROVIDER_LABELS[settings.provider]} when needed</span>
      </div>
      {showReadiness ? (
        <div className={`ask-readiness ${modelReadiness.status}`} role={modelReadiness.status === "error" ? "alert" : "status"}>
          {modelReadiness.message}
        </div>
      ) : null}
      <div className="answer-response" aria-live="polite">
        {status === "running" ? (
          <ProgressNote
            label={progressLabel}
            detail={aiProgressDetail(settings, elapsedSeconds)}
            elapsedSeconds={elapsedSeconds}
          />
        ) : status === "error" ? (
          <p className="error-text">{error}</p>
        ) : answer ? (
          <>
            <div className="answer-question">{answer.question}</div>
            <MessageText text={answer.text} />
            <EvidenceList citations={answer.citations.slice(0, 8)} onOpenCitation={onOpenCitation} />
          </>
        ) : (
          <p>{emptyResponseText}</p>
        )}
      </div>
      <div className="chat-composer" aria-label="Ask a question">
        <input
          type="text"
          aria-label="Ask about the codebase"
          placeholder="Ask about symbols, files, data flow, or business logic..."
          value={question}
          onChange={(event) => onQuestionChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onAsk();
          }}
          disabled={!canAsk || status === "running"}
        />
        <button
          type="button"
          onClick={status === "running" ? onCancel : onAsk}
          disabled={!canAsk || (status !== "running" && !question.trim())}
        >
          {askButtonLabel}
        </button>
      </div>
      {starterQuestions.length ? (
        <div className="question-chips" aria-label="Suggested questions">
          {starterQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onAskPreset(question)}
              disabled={status === "running"}
            >
              <span>{question}</span>
              <small>{isGraphQuestion(question) ? "Graph" : PROVIDER_LABELS[settings.provider]}</small>
            </button>
          ))}
          {explainQuestion ? (
            <button
              type="button"
              onClick={() => onAskPreset(explainQuestion)}
              disabled={status === "running"}
              title="Show a cited graph-derived explanation"
            >
              <span>Explain {node?.name}</span>
              <small>Graph</small>
            </button>
          ) : null}
        </div>
      ) : null}
      {previousAnswers.length ? (
        <details className="answer-history" aria-label="Recent Ask answers">
          <summary>
            <span>Recent answers</span>
            <small>{previousAnswers.length}</small>
          </summary>
          <button type="button" onClick={onClearHistory} disabled={status === "running"}>
            Clear
          </button>
          <div className="answer-history-list">
            {previousAnswers.map((item, index) => (
              <button
                key={`${item.question}:${index}`}
                type="button"
                onClick={() => onRestoreAnswer(item)}
                disabled={status === "running"}
                title={item.question}
              >
                <span>{item.question}</span>
                <small>
                  {item.guarded ? "Guarded fallback" : item.source === "model" ? PROVIDER_LABELS[settings.provider] : "Graph"} - {item.citations.length} citation
                  {item.citations.length === 1 ? "" : "s"}
                </small>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function EvidenceList({
  citations,
  onOpenCitation,
}: {
  citations: Citation[];
  onOpenCitation: (citation: Citation) => void;
}) {
  if (!citations.length) return null;

  return (
    <div className="evidence-block">
      <span>Evidence</span>
      <CitationList citations={citations} onOpenCitation={onOpenCitation} />
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  const blocks = textBlocks(text);

  return (
    <div className="message-text">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={`${index}:${itemIndex}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.text}</p>
        ),
      )}
    </div>
  );
}

type MessageTextBlock = { type: "paragraph"; text: string } | { type: "list"; items: string[] };

function textBlocks(text: string): MessageTextBlock[] {
  const blocks: MessageTextBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      listItems.push(line.slice(2).trim());
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: "paragraph", text }];
}

function CitationList({
  citations,
  onOpenCitation,
}: {
  citations: Citation[];
  onOpenCitation: (citation: Citation) => void;
}) {
  if (!citations.length) return null;

  return (
    <div className="citation-list">
      {citations.map((citation) => (
        <button
          key={`${citation.file}:${citation.line}:${citation.endLine ?? ""}:${citation.label}`}
          type="button"
          onClick={() => onOpenCitation(citation)}
          aria-label={`Open citation ${citation.label} at ${citationSite(citation)}`}
          title={`${citation.label} - ${citationSite(citation)}`}
        >
          <span className="citation-label">{citation.label}</span>
          <span className="citation-site">{citationSite(citation)}</span>
        </button>
      ))}
    </div>
  );
}

function citationSite(citation: Citation) {
  return citation.endLine && citation.endLine !== citation.line
    ? `${citation.file}:${citation.line}-${citation.endLine}`
    : `${citation.file}:${citation.line}`;
}

function ProgressNote({
  label,
  detail,
  elapsedSeconds,
}: {
  label: string;
  detail: string;
  elapsedSeconds: number;
}) {
  return (
    <div className="progress-note" role="status">
      <span className="progress-spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <span>
          {detail}
          {elapsedSeconds >= 2 ? ` ${elapsedSeconds}s elapsed.` : ""}
        </span>
      </div>
    </div>
  );
}

function useElapsedSeconds(active: boolean) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    setElapsedSeconds(0);
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [active]);

  return elapsedSeconds;
}

function aiProgressDetail(settings: ModelSettings, elapsedSeconds: number) {
  if (settings.provider === "ollama") {
    return elapsedSeconds >= 8
      ? "Local Ollama can take a little while on CPU; code stays on this machine."
      : "Using local Ollama; no code leaves this machine.";
  }

  return elapsedSeconds >= 8
    ? `Waiting on ${PROVIDER_LABELS[settings.provider]}; only the retrieved code slice was sent.`
    : `Using ${PROVIDER_LABELS[settings.provider]} with cited graph context.`;
}

function summaryEvidenceCitations(node: GraphNode, graph: GraphDocument) {
  const citations: Citation[] = [];
  if (node.file) {
    citations.push({
      file: node.file,
      line: node.lines?.[0] ?? 1,
      endLine: node.lines?.[1],
      label: `${node.name} source`,
      nodeId: node.id,
    });
  }

  for (const edge of graph.edges) {
    if (edge.from !== node.id && edge.to !== node.id) continue;
    if (!edge.site) continue;
    citations.push({
      file: edge.site.file,
      line: edge.site.line,
      label: edgeLabel(edge, graph),
      nodeId: edge.from,
    });
    if (citations.length >= 7) break;
  }

  return dedupeCitations(citations).slice(0, 6);
}

function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.file}:${citation.line}:${citation.endLine ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function LineageImpactPanel({
  node,
  graph,
  onFocusNode,
  onOpenEdge,
}: {
  node: GraphNode | null;
  graph: GraphDocument | null;
  onFocusNode: (nodeId: string) => void;
  onOpenEdge: (edge: GraphEdge) => void;
}) {
  const relationships = useMemo(() => {
    if (!node || !graph) return null;
    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    const lineage = [...incoming, ...outgoing].filter(isLineageEdge);
    return {
      dependents: incoming,
      dependencies: outgoing,
      lineage,
    };
  }, [graph, node]);

  if (!node || !graph || !relationships) {
    return (
      <section className="lineage-card">
        <div className="relationship-title">Impact</div>
        <p>Select a graph node to inspect dependencies and lineage.</p>
      </section>
    );
  }

  return (
    <section className="lineage-card">
      <div className="relationship-title">Impact</div>
      <div className="lineage-focus">
        <span className="swatch" style={{ background: nodeColor(node.type) }} />
        <strong>{node.name}</strong>
        <small>{node.type}</small>
      </div>
      <RelationshipList
        title={node.type === "data-item" ? "Flows To" : "Depends On"}
        empty="No outgoing dependencies."
        edges={relationships.dependencies}
        graph={graph}
        selectedNodeId={node.id}
        direction="out"
        onFocusNode={onFocusNode}
        onOpenEdge={onOpenEdge}
      />
      <RelationshipList
        title={node.type === "data-item" ? "Defined / Used By" : "Used By"}
        empty="No incoming dependents."
        edges={relationships.dependents}
        graph={graph}
        selectedNodeId={node.id}
        direction="in"
        onFocusNode={onFocusNode}
        onOpenEdge={onOpenEdge}
      />
      <RelationshipList
        title="Lineage"
        empty="No semantic lineage edges for this node."
        edges={relationships.lineage}
        graph={graph}
        selectedNodeId={node.id}
        direction="either"
        onFocusNode={onFocusNode}
        onOpenEdge={onOpenEdge}
      />
    </section>
  );
}

function RelationshipList({
  title,
  empty,
  edges,
  graph,
  selectedNodeId,
  direction,
  onFocusNode,
  onOpenEdge,
}: {
  title: string;
  empty: string;
  edges: GraphEdge[];
  graph: GraphDocument;
  selectedNodeId: string;
  direction: "in" | "out" | "either";
  onFocusNode: (nodeId: string) => void;
  onOpenEdge: (edge: GraphEdge) => void;
}) {
  const nodes = useMemo(() => new Map(graph.nodes.map((candidate) => [candidate.id, candidate])), [graph]);

  return (
    <div className="lineage-group">
      <div className="lineage-heading">
        <span>{title}</span>
        <strong>{edges.length}</strong>
      </div>
      {edges.length ? (
        <div className="lineage-list">
          {edges.slice(0, 8).map((edge) => {
            const relatedId = direction === "in" ? edge.from : direction === "out" ? edge.to : edge.from === selectedNodeId ? edge.to : edge.from;
            const related = nodes.get(relatedId);
            return (
              <div key={`${edge.from}:${edge.to}:${edge.type}:${edge.site?.file ?? ""}:${edge.site?.line ?? 0}`} className="lineage-row">
                <button type="button" className="lineage-node" onClick={() => onFocusNode(relatedId)}>
                  <span className="swatch" style={{ background: nodeColor(related?.type ?? "") }} />
                  <span>{related?.name ?? relatedId}</span>
                </button>
                <button
                  type="button"
                  className="lineage-edge"
                  aria-label={`${title}: show ${edgeLabel(edge, graph)}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : ""}`}
                  onClick={() => onOpenEdge(edge)}
                  disabled={!edge.site}
                  title={edge.site ? `Show cited relationship at ${edge.site.file}:${edge.site.line}` : "No source location recorded"}
                >
                  {edge.type}
                  {edge.site ? ` ${edge.site.file}:${edge.site.line}` : ""}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function RelationshipDetails({
  selectedEdge,
  node,
  graph,
  onFocusNode,
  onOpenEdge,
}: {
  selectedEdge: GraphEdge | null;
  node: GraphNode | null;
  graph: GraphDocument | null;
  onFocusNode: (nodeId: string) => void;
  onOpenEdge: (edge: GraphEdge) => void;
}) {
  const relationships = useMemo(() => {
    if (!node || !graph) return null;
    const incoming = graph.edges.filter((edge) => edge.to === node.id);
    const outgoing = graph.edges.filter((edge) => edge.from === node.id);
    return { incoming, outgoing };
  }, [graph, node]);

  return (
    <section className="relationship-card">
      <div className="relationship-title">{selectedEdge ? "Relationship" : "Links"}</div>
      {selectedEdge && graph ? (
        <EdgeExplanation edge={selectedEdge} graph={graph} onFocusNode={onFocusNode} />
      ) : relationships && node && graph ? (
        <>
          <p className="relationship-help">Select a source line link to jump into code, or select a symbol to refocus the graph.</p>
          <RelationshipList
            title="Outgoing"
            empty="No outgoing links."
            edges={relationships.outgoing}
            graph={graph}
            selectedNodeId={node.id}
            direction="out"
            onFocusNode={onFocusNode}
            onOpenEdge={onOpenEdge}
          />
          <RelationshipList
            title="Incoming"
            empty="No incoming links."
            edges={relationships.incoming}
            graph={graph}
            selectedNodeId={node.id}
            direction="in"
            onFocusNode={onFocusNode}
            onOpenEdge={onOpenEdge}
          />
        </>
      ) : graph?.meta.parseErrors.length ? (
        <ParseErrorSummary graph={graph} />
      ) : (
        <p>{graph ? "Select a relationship to see its cited source line." : "Open a folder to inspect relationships."}</p>
      )}
    </section>
  );
}

function CodeSnippet({ node, snippet, loading }: { node: GraphNode; snippet: SourceSnippet | null; loading: boolean }) {
  if (!node.file) {
    return (
      <pre>
        <code>{node.external ? "External node: source not present in this codebase." : "No source location."}</code>
      </pre>
    );
  }

  return (
    <div className="source-view">
      <div className="source-header">
        <span>{snippet?.file ?? node.file}</span>
        <strong>line {snippet?.highlightLine ?? node.lines?.[0] ?? 1}</strong>
      </div>
      <pre>
        <code className={snippet ? "source-lines" : undefined}>
          {snippet ? (
            snippet.lines.map((line) => (
              <span
                key={line.number}
                className={line.number === snippet.highlightLine ? "source-line is-highlighted" : "source-line"}
              >
                <span className="source-line-marker">{line.number === snippet.highlightLine ? ">" : " "}</span>
                <span className="source-line-number">{padLine(line.number)}</span>
                <span className="source-line-text">{line.text || " "}</span>
              </span>
            ))
          ) : (
            loading
              ? "Loading source snippet..."
              : "Source snippet unavailable. Use Open Sample for the browser demo, or open the codebase in the desktop app."
          )}
        </code>
      </pre>
    </div>
  );
}

function EdgeExplanation({
  edge,
  graph,
  onFocusNode,
}: {
  edge: GraphEdge;
  graph: GraphDocument;
  onFocusNode: (nodeId: string) => void;
}) {
  const fromNode = graph.nodes.find((candidate) => candidate.id === edge.from);
  const toNode = graph.nodes.find((candidate) => candidate.id === edge.to);
  const fromName = fromNode?.name ?? edge.from;
  const toName = toNode?.name ?? edge.to;

  return (
    <div className="edge-explanation">
      <strong>{edgeLabel(edge, graph)}</strong>
      <p>
        This graph relationship records <span>{fromName}</span> as the source and <span>{toName}</span> as the target.
      </p>
      <div className="relationship-flow" aria-label="Relationship endpoints">
        <button
          type="button"
          className="relationship-node-button"
          aria-label={`Focus relationship source ${fromName}`}
          onClick={() => onFocusNode(edge.from)}
        >
          <span className="relationship-node-role">From</span>
          <span className="relationship-node-name">
            <span className="swatch" style={{ background: nodeColor(fromNode?.type ?? "") }} />
            <span>{fromName}</span>
          </span>
          <small>{fromNode ? nodeLocationLabel(fromNode) : edge.from}</small>
        </button>
        <span className="relationship-edge-type">{edge.type}</span>
        <button
          type="button"
          className="relationship-node-button"
          aria-label={`Focus relationship target ${toName}`}
          onClick={() => onFocusNode(edge.to)}
        >
          <span className="relationship-node-role">To</span>
          <span className="relationship-node-name">
            <span className="swatch" style={{ background: nodeColor(toNode?.type ?? "") }} />
            <span>{toName}</span>
          </span>
          <small>{toNode ? nodeLocationLabel(toNode) : edge.to}</small>
        </button>
      </div>
      {edge.site ? (
        <span>
          Cited at {edge.site.file}:{edge.site.line}.
        </span>
      ) : (
        <span>This is a clustered visual relationship.</span>
      )}
    </div>
  );
}

function ParseErrorSummary({ graph }: { graph: GraphDocument }) {
  return (
    <ul className="parse-errors">
      {graph.meta.parseErrors.slice(0, 8).map((parseError) => (
        <li key={`${parseError.file}:${parseError.reason}`}>
          <strong>{parseErrorSite(parseError)}</strong>
          <span>{parseError.reason}</span>
        </li>
      ))}
    </ul>
  );
}

function parseErrorSite(parseError: { file: string; line?: number }) {
  return parseError.line ? `${parseError.file}:${parseError.line}` : parseError.file;
}

function canUseTauri() {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}

function privacyModeLabel(settings: ModelSettings) {
  if (settings.privacyMode === "local") {
    return "Local mode: inference uses localhost Ollama; code stays on this machine.";
  }
  return `Cloud mode: retrieved code context is sent to ${PROVIDER_LABELS[settings.provider]}.`;
}

function normalizedScanSettings(settings: ScanSettings) {
  return {
    ...settings,
    extensions: settings.extensions
      .split(",")
      .map((extension) => extension.trim())
      .filter(Boolean)
      .map((extension) => extension.toLocaleLowerCase())
      .map((extension) => (extension.startsWith(".") ? extension : `.${extension}`))
      .join(","),
  };
}

async function loadAppSettings(): Promise<AppSettings | null> {
  if (canUseTauri()) {
    const settings = await invoke<unknown>("load_app_settings");
    return normalizeAppSettings(settings);
  }

  const stored = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!stored) return null;
  return normalizeAppSettings(JSON.parse(stored));
}

async function saveAppSettings(settings: AppSettings) {
  if (canUseTauri()) {
    await invoke("save_app_settings", { settings });
    return;
  }
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function normalizeAppSettings(value: unknown): AppSettings | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AppSettings>;
  return {
    schemaVersion: 1,
    model: normalizeModelSettings(raw.model),
    scan: normalizeSavedScanSettings(raw.scan),
  };
}

function normalizeModelSettings(value: unknown): ModelSettings {
  if (!value || typeof value !== "object") return DEFAULT_MODEL_SETTINGS;
  const raw = value as Partial<ModelSettings>;
  const provider = isModelProvider(raw.provider) ? raw.provider : DEFAULT_MODEL_SETTINGS.provider;
  return {
    provider,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model : DEFAULT_MODELS[provider],
    baseUrl:
      provider === "ollama"
        ? typeof raw.baseUrl === "string" && raw.baseUrl.trim()
          ? raw.baseUrl
          : DEFAULT_MODEL_SETTINGS.baseUrl
        : "",
    privacyMode: isCloudProvider(provider) ? "cloud" : "local",
    rosettaLanguage:
      typeof raw.rosettaLanguage === "string" && raw.rosettaLanguage.trim()
        ? raw.rosettaLanguage
        : DEFAULT_MODEL_SETTINGS.rosettaLanguage,
  };
}

function normalizeSavedScanSettings(value: unknown): ScanSettings {
  if (!value || typeof value !== "object") return DEFAULT_SCAN_SETTINGS;
  const raw = value as Partial<ScanSettings>;
  return normalizedScanSettings({
    format: isScanFormat(raw.format) ? raw.format : DEFAULT_SCAN_SETTINGS.format,
    extensions:
      typeof raw.extensions === "string" && raw.extensions.trim()
        ? raw.extensions
        : DEFAULT_SCAN_SETTINGS.extensions,
    encoding: typeof raw.encoding === "string" && raw.encoding.trim() ? raw.encoding : DEFAULT_SCAN_SETTINGS.encoding,
  });
}

function isModelProvider(value: unknown): value is ModelProvider {
  return value === "ollama" || value === "anthropic" || value === "openai" || value === "openrouter";
}

function isScanFormat(value: unknown): value is ScanFormat {
  return value === "auto" || value === "fixed" || value === "free";
}

function sourceBaseForGraphUrl(graphUrl: string) {
  return graphUrl.includes("m6-bakeoff-graph.json") ? "/m6-bakeoff-source.json" : "";
}

async function providerKeyForModel(settings: ModelSettings) {
  if (!isCloudProvider(settings.provider)) return undefined;
  if (!canUseTauri()) {
    throw new Error("Cloud API keys are stored in the desktop keychain. Use the desktop app to call cloud providers.");
  }
  return invoke<string>("read_provider_key", { provider: settings.provider });
}

async function runTimedModelCall<T>(
  label: string,
  activeControllerRef: { current: AbortController | null },
  task: (abortSignal: AbortSignal) => Promise<T>,
) {
  activeControllerRef.current?.abort();
  const controller = new AbortController();
  let timedOut = false;
  activeControllerRef.current = controller;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MODEL_CALL_TIMEOUT_MS);

  try {
    return await task(controller.signal);
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) {
      const seconds = Math.round(MODEL_CALL_TIMEOUT_MS / 1000);
      throw new Error(
        timedOut
          ? `${label} timed out after ${seconds}s. Check AI readiness, try a smaller local model, or switch providers.`
          : `${label} was stopped.`,
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
    if (activeControllerRef.current === controller) {
      activeControllerRef.current = null;
    }
  }
}

function isAbortError(err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || /\babort(?:ed)?\b/i.test(err.message);
}

async function readSourceSnippet(
  root: string,
  sourceBase: string,
  file: string,
  line: number,
  encoding: string,
): Promise<SourceSnippet> {
  if (root && canUseTauri()) {
    return invoke<SourceSnippet>("read_source_snippet", {
      root,
      file,
      line,
      encoding,
    });
  }

  if (!sourceBase) {
    throw new Error("Source is unavailable for this graph. Open Sample or open the codebase in the desktop app.");
  }

  const text = await fetchSourceText(sourceBase, file);
  const lines = text.split(/\r?\n/);
  const startLine = Math.max(1, line - 6);
  const endLine = Math.min(lines.length, line + 8);
  return {
    file,
    startLine,
    highlightLine: line,
    lines: lines.slice(startLine - 1, endLine).map((sourceLine, index) => ({
      number: startLine + index,
      text: sourceLine,
    })),
  };
}

async function readSourceExcerpt(
  root: string,
  sourceBase: string,
  file: string,
  startLine: number,
  endLine: number,
  maxLines: number,
  encoding: string,
): Promise<SourceExcerpt> {
  if (root && canUseTauri()) {
    return invoke<SourceExcerpt>("read_source_excerpt", {
      root,
      file,
      startLine,
      endLine,
      maxLines,
      encoding,
    });
  }

  if (!sourceBase) {
    throw new Error("Source is unavailable for this graph. Open Sample or open the codebase in the desktop app.");
  }

  const text = await fetchSourceText(sourceBase, file);
  const lines = text.split(/\r?\n/);
  const safeStart = Math.max(1, startLine);
  const safeEnd = Math.min(lines.length, Math.max(safeStart, endLine));
  const cappedEnd = Math.min(safeEnd, safeStart + maxLines - 1);
  return {
    file,
    startLine: safeStart,
    endLine: cappedEnd,
    truncated: cappedEnd < safeEnd,
    text: lines
      .slice(safeStart - 1, cappedEnd)
      .map((sourceLine, index) => `${padLine(safeStart + index)} ${sourceLine}`)
      .join("\n"),
  };
}

async function fetchSourceText(sourceBase: string, file: string) {
  if (sourceBase.endsWith(".json")) {
    const bundle = await fetchSourceBundle(sourceBase);
    const text = bundle[file];
    if (text == null) {
      throw new Error(`Source file ${file} is not available in this browser demo.`);
    }
    return text;
  }

  const base = sourceBase.replace(/\/$/, "");
  const path = file
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(`${base}/${path}`);
  if (!response.ok) {
    throw new Error(`Source file ${file} is not available in this browser demo.`);
  }
  return response.text();
}

const sourceBundleCache = new Map<string, Promise<Record<string, string>>>();

function fetchSourceBundle(sourceBase: string) {
  let bundle = sourceBundleCache.get(sourceBase);
  if (!bundle) {
    bundle = fetch(sourceBase).then(async (response) => {
      if (!response.ok) throw new Error(`Source bundle ${sourceBase} is not available.`);
      return (await response.json()) as Record<string, string>;
    });
    sourceBundleCache.set(sourceBase, bundle);
  }
  return bundle;
}

function friendlyModelError(err: unknown, settings: ModelSettings) {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "Failed to fetch" && settings.provider === "ollama") {
    return `Could not reach Ollama at ${settings.baseUrl}. Start Ollama, check the host, or switch providers.`;
  }
  if (message === "Failed to fetch") {
    return `Could not reach ${PROVIDER_LABELS[settings.provider]}. Check the provider settings and try again.`;
  }
  return message;
}

function selectedNodeGraphAnswer(node: GraphNode, graph: GraphDocument): Pick<ChatAnswer, "text" | "citations"> {
  const incoming = graph.edges.filter((edge) => edge.to === node.id);
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const lineage = [...incoming, ...outgoing].filter(isLineageEdge);
  const relatedNames = (edges: GraphEdge[], side: "from" | "to") =>
    compactNodeNames(
      edges
        .map((edge) => graph.nodes.find((candidate) => candidate.id === edge[side])?.name)
        .filter((name): name is string => Boolean(name)),
    );
  const relationshipCitations = [...outgoing, ...incoming]
    .filter((edge) => edge.site)
    .slice(0, 8)
    .map((edge) => ({
      file: edge.site?.file ?? "",
      line: edge.site?.line ?? 1,
      label: edgeLabel(edge, graph),
      nodeId: edge.from,
    }));
  const relationshipLines = relationshipCitations.map((citation) => `- ${citation.label} at ${citation.file}:${citation.line}`);
  const location = nodeLocationLabel(node);
  const brief = [
    `${node.name} is a ${node.type}${node.external ? " outside this codebase" : ""}. Source: ${location}.`,
    `The graph records ${incoming.length} incoming and ${outgoing.length} outgoing relationships.`,
  ];
  const incomingNames = relatedNames(incoming, "from");
  const outgoingNames = relatedNames(outgoing, "to");
  if (incomingNames) brief.push(`Used by or reached from: ${incomingNames}.`);
  if (outgoingNames) brief.push(`Depends on or reaches: ${outgoingNames}.`);
  if (lineage.length) {
    brief.push(`Lineage signals present: ${compactWords(lineage.map((edge) => edge.type))}.`);
  }

  return {
    text: [
      `Graph answer, no model required: I matched the selected ${node.name} at ${location}.`,
      "",
      `${node.name} at a glance:`,
      ...brief.map((line) => `- ${line}`),
      ...(relationshipLines.length ? ["", "Evidence highlights:", ...relationshipLines.slice(0, 4)] : []),
    ].join("\n"),
    citations: dedupeCitations([
      ...(node.file
        ? [{
            file: node.file,
            line: node.lines?.[0] ?? 1,
            endLine: node.lines?.[1],
            label: `${node.name} source`,
            nodeId: node.id,
          }]
        : []),
      ...relationshipCitations,
    ]),
  };
}

function nodeGraphOverview(node: GraphNode, graph: GraphDocument) {
  const incoming = graph.edges.filter((edge) => edge.to === node.id);
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const lineage = [...incoming, ...outgoing].filter(isLineageEdge);
  const bridgeInsight = cobolFileBridgeInsight(node, graph, incoming, outgoing);
  const location = node.file ? `${node.file}:${node.lines?.[0] ?? 1}` : "external";
  const parts = [
    `${node.name} is a ${node.type}${node.external ? " outside this codebase" : ""}.`,
    `Source: ${location}.`,
    `${incoming.length} incoming and ${outgoing.length} outgoing relationships are recorded.`,
  ];
  if (bridgeInsight) {
    parts.push(bridgeInsight);
  }
  if (lineage.length) {
    parts.push(`${lineage.length} lineage relationship${lineage.length === 1 ? " is" : "s are"} available for reads, writes, moves, queries, links, or runtime wiring.`);
  }
  return parts.join(" ");
}

function cobolFileBridgeInsight(
  node: GraphNode,
  graph: GraphDocument,
  incoming: GraphEdge[],
  outgoing: GraphEdge[],
) {
  const nodes = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const assignedOut = outgoing.find((edge) => edge.type.toLocaleLowerCase() === "assigned-to");
  if (assignedOut) {
    const dd = nodes.get(assignedOut.to);
    const datasetEdge = graph.edges.find((edge) => edge.from === assignedOut.to && edge.type.toLocaleLowerCase() === "uses-dd");
    const dataset = datasetEdge ? nodes.get(datasetEdge.to) : null;
    return dataset && dd
      ? `COBOL SELECT maps this logical file to DD ${dd.name}, which resolves to dataset ${dataset.name}.`
      : dd
        ? `COBOL SELECT maps this logical file to DD ${dd.name}.`
        : "";
  }

  const usesOut = outgoing.find((edge) => edge.type.toLocaleLowerCase() === "uses-dd");
  if (node.type === "jcl-dd" && usesOut) {
    const dataset = nodes.get(usesOut.to);
    const logicalFiles = incoming
      .filter((edge) => edge.type.toLocaleLowerCase() === "assigned-to")
      .map((edge) => nodes.get(edge.from)?.name)
      .filter((name): name is string => Boolean(name));
    if (dataset && logicalFiles.length) {
      return `This DD bridges COBOL ${logicalFiles.join(", ")} to physical dataset ${dataset.name}.`;
    }
    if (dataset) return `This DD resolves to physical dataset ${dataset.name}.`;
  }

  if (node.type === "dataset") {
    const ddEdge = incoming.find((edge) => edge.type.toLocaleLowerCase() === "uses-dd");
    const dd = ddEdge ? nodes.get(ddEdge.from) : null;
    const logicalFiles = dd
      ? graph.edges
          .filter((edge) => edge.to === dd.id && edge.type.toLocaleLowerCase() === "assigned-to")
          .map((edge) => nodes.get(edge.from)?.name)
          .filter((name): name is string => Boolean(name))
      : [];
    if (dd && logicalFiles.length) {
      return `JCL DD ${dd.name} connects COBOL ${logicalFiles.join(", ")} to this dataset.`;
    }
  }

  return "";
}

function nodeLocationLabel(node: GraphNode) {
  if (!node.file) return "external";
  const start = node.lines?.[0] ?? 1;
  const end = node.lines?.[1];
  return end && end !== start ? `${node.file}:${start}-${end}` : `${node.file}:${start}`;
}

function compactNodeNames(names: string[]) {
  const unique = [...new Set(names)];
  if (!unique.length) return "";
  const visible = unique.slice(0, 8);
  const hiddenCount = unique.length - visible.length;
  return hiddenCount ? `${visible.join(", ")} +${hiddenCount} more` : visible.join(", ");
}

function compactWords(words: string[]) {
  return [...new Set(words)].join(", ");
}

function firstFocusableNode(graph: GraphDocument) {
  return (
    graph.nodes.find((node) => node.type === "program" && !node.external)?.id ??
    graph.nodes.find((node) => !node.external)?.id ??
    graph.nodes[0]?.id ??
    ""
  );
}

function searchResultScore(node: GraphNode, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  const name = node.name.toLocaleLowerCase();
  const id = node.id.toLocaleLowerCase();
  const type = node.type.toLocaleLowerCase();
  const priority = typePriority(node.type) / 100;
  if (!needle) return null;
  if (name === needle) return priority;
  if (id.endsWith(`:${needle}`) || id.endsWith(`/${needle}`)) return 1 + priority;
  if (name.startsWith(needle)) return 2 + priority;
  if (name.includes(needle)) return 3 + priority;
  if (type === needle || type.includes(needle)) return 4 + priority;
  if (matchesFuzzy(name, needle)) return 5 + priority + fuzzyGapScore(name, needle);
  return null;
}

function fuzzyGapScore(text: string, needle: string) {
  let cursor = 0;
  let first = -1;
  let last = -1;
  for (const char of needle) {
    const next = text.indexOf(char, cursor);
    if (next === -1) return Number.MAX_SAFE_INTEGER;
    if (first === -1) first = next;
    last = next;
    cursor = next + 1;
  }
  const span = last - first + 1;
  return (span - needle.length) / 10 + text.length / 1000;
}

function typePriority(type: string) {
  if (type === "program") return 0;
  if (type === "paragraph") return 1;
  if (type === "copybook") return 2;
  if (type === "jcl-job") return 3;
  if (type === "jcl-step") return 4;
  return 5;
}

function isLineageEdge(edge: GraphEdge) {
  return LINEAGE_EDGE_TYPES.has(edge.type.toLocaleLowerCase());
}

function isSummaryUnit(node: GraphNode) {
  return node.type === "program" || node.type === "paragraph" || node.type === "copybook";
}

function suggestedGraphQuestions(node: GraphNode | null) {
  const overviewQuestion = "Give me a codebase overview.";
  if (!node) return [overviewQuestion];
  const name = node.name;
  const selectedOverview = selectedNodeOverviewQuestion(node);
  if (node.type === "program") {
    return [overviewQuestion, selectedOverview, `What depends on ${name}?`, `What does ${name} call?`, `What files does ${name} read?`, `What does ${name} write?`];
  }
  if (node.type === "data-item") {
    return [overviewQuestion, selectedOverview, `Where does ${name} flow?`, `What uses ${name}?`, `Where does ${name} happen?`];
  }
  if (node.type === "jcl-dd") {
    return [overviewQuestion, selectedOverview, `What uses ${name}?`, `What does ${name} use?`, `Where does ${name} happen?`];
  }
  if (node.type === "dataset") {
    return [overviewQuestion, selectedOverview, `What uses ${name}?`, `Where does ${name} flow?`, `Where does ${name} happen?`];
  }
  return [
    overviewQuestion,
    selectedOverview,
    `What uses ${name}?`,
    `Where does ${name} happen?`,
    `What depends on ${name}?`,
  ];
}

function shouldSyncAskFocus(question: string) {
  return !/\b(codebase\s+overview|overview\s+of\s+(?:this\s+)?codebase|where\s+should\s+i\s+start|what\s+should\s+i\s+inspect\s+first|inspect\s+first|start(?:ing)?\s+point|entry\s+point|entry\s+points|what\s+is\s+(?:in\s+)?this\s+codebase|how\s+is\s+(?:this\s+)?codebase\s+structured)\b/i.test(
    question,
  );
}

function selectedNodeOverviewQuestion(node: GraphNode) {
  const type = friendlyQuestionNodeType(node.type);
  return `What does this ${type} do in plain English?`;
}

function friendlyQuestionNodeType(type: string) {
  if (type === "jcl-job") return "job";
  if (type === "jcl-step") return "step";
  if (type === "data-item") return "symbol";
  if (type === "jcl-dd") return "symbol";
  return type.replace(/-/g, " ");
}

function statusLabel(status: Status) {
  if (status === "running") return "Indexing";
  if (status === "ready") return "Graph ready";
  if (status === "error") return "Needs attention";
  return "Idle";
}

function scanProgressLabel(progress: AnalysisProgress | null) {
  if (!progress) return "Preparing analyzer";
  const total = Number.isFinite(progress.total) ? progress.total : 0;
  const done = Number.isFinite(progress.done) ? progress.done : 0;
  const phase = progress.phase ? progress.phase[0].toUpperCase() + progress.phase.slice(1) : "Analyzing";
  return total > 0 ? `${phase} ${Math.min(done, total)}/${total}` : phase;
}

function padLine(line: number) {
  return line.toString().padStart(5, " ");
}

export default App;

