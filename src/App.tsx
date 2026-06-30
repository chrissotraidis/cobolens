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
import { assertLocalOllamaUrl, normalizeOllamaBaseUrl } from "./model/privacy";
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
const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  format: "auto",
  extensions: ".cbl,.cob,.cpy,.jcl",
  encoding: "utf8",
};
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
  const [chatError, setChatError] = useState("");
  const [modelCallCount, setModelCallCount] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("ask");
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
      if (node.type === "program") acc.programs += 1;
      if (node.type === "copybook") acc.copybooks += 1;
      if (node.type === "jcl-job") acc.jobs += 1;
      if (node.type === "jcl-step") acc.steps += 1;
      if (node.external) acc.external += 1;
      return acc;
    }, empty);
  }, [graph]);

  const searchResults = useMemo(() => {
    if (!graph || !query.trim()) return [];
    return graph.nodes
      .filter((node) => matchesFuzzy(`${node.name} ${node.id} ${node.type}`, query))
      .sort((left, right) => searchScore(left, query) - searchScore(right, query))
      .slice(0, 12);
  }, [graph, query]);

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
      return;
    }

    let cancelled = false;
    readSourceSnippet(root, sourceBase, target.file, target.line, scanSettings.encoding)
      .then((result) => {
        if (!cancelled) setSnippet(result);
      })
      .catch(() => {
        if (!cancelled) setSnippet(null);
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
    setChatQuestion("");
    setChatStatus("idle");
    setChatError("");
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
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(focusNodeId)) next.delete(focusNodeId);
      else next.add(focusNodeId);
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
        readExcerpt: sourceExcerptForNode,
      });
      if (isGraphQuestion(question)) {
        const fallback = graphAnswerFallback(graph, question, context);
        setChatAnswer({ question, text: fallback.text, citations: fallback.citations, source: "graph" });
        setChatStatus("ready");
        if (context.focusNodes[0]) focusOnNode(context.focusNodes[0].id, { preserveChat: true });
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
      setChatAnswer({ question, text: answer.text, citations: answerContext.citations, source: "model" });
      setChatStatus("ready");
      if (answerContext.focusNodes[0]) focusOnNode(answerContext.focusNodes[0].id, { preserveChat: true });
    } catch (err) {
      if (context) {
        const fallback = graphAnswerFallback(graph, question, context, friendlyModelError(err, modelSettings));
        setChatAnswer({ question, text: fallback.text, citations: fallback.citations, source: "graph" });
        setChatStatus("ready");
        if (context.focusNodes[0]) focusOnNode(context.focusNodes[0].id, { preserveChat: true });
        return;
      }
      setChatError(friendlyModelError(err, modelSettings));
      setChatStatus("error");
    }
  }

  function cancelAsk() {
    activeChatAbortRef.current?.abort();
  }

  function cancelSummary() {
    activeSummaryAbortRef.current?.abort();
  }

  function jumpToCitation(citation: Citation, keepEdge = false) {
    const citedNode =
      (citation.nodeId ? nodeById.get(citation.nodeId) : undefined) ??
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
    if (!keepEdge) setSelectedEdge(null);
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
            <button
              className={desktopAvailable ? "primary-action" : undefined}
              type="button"
              onClick={chooseFolder}
              disabled={!desktopAvailable}
              title={desktopAvailable ? "Open a local COBOL codebase" : "Open Folder is available in the desktop app"}
            >
              Open Folder
            </button>
            <button className={desktopAvailable ? undefined : "primary-action"} type="button" onClick={openSample}>
              Open Sample
            </button>
            <button
              type="button"
              onClick={rescanCurrent}
              disabled={!desktopAvailable || !graph || status === "running"}
              title={desktopAvailable ? "Re-scan the current folder" : "Re-scan is available after opening a folder in the desktop app"}
            >
              Re-scan
            </button>
            {!desktopAvailable ? <div className="settings-footnote">Browser preview uses the bundled sample graph.</div> : null}
            <div className="path-label">{root || "No codebase selected"}</div>
            <div className={`status-pill ${status}`}>{statusLabel(status)}</div>
            {status === "running" ? <div className="scan-progress">{scanProgressLabel(scanProgress)}</div> : null}
            {status === "error" && error ? <div className="inline-error">{error}</div> : null}
            <ScanSettingsPanel
              settings={scanSettings}
              disabled={!desktopAvailable || status === "running"}
              onSettingsChange={setScanSettings}
            />
          </section>

          <section className="pane-block">
            <h2>Symbols</h2>
            <div className="search-results">
              {searchResults.length ? (
                searchResults.map((node) => (
                  <button key={node.id} type="button" onClick={() => focusOnNode(node.id)}>
                    <span className="swatch" style={{ background: nodeColor(node.type) }} />
                    <span>{node.name}</span>
                    <small>{node.type}</small>
                  </button>
                ))
              ) : (
                <div className="empty-copy">{graph ? "Type to search symbols." : "Open a folder to index symbols."}</div>
              )}
            </div>
          </section>

          <section className="pane-block">
            <h2>Inventory</h2>
            <Metric label="Files" value={graph?.meta.fileCount ?? 0} />
            <Metric label="Parsed" value={graph?.meta.parsedFileCount ?? 0} />
            <Metric label="Programs" value={counts.programs} />
            <Metric label="Copybooks" value={counts.copybooks} />
            <Metric label="JCL steps" value={counts.steps} />
          </section>

          <ParseHealth graph={graph} />

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

          <section className="pane-block">
            <h2>Legend & Filters</h2>
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
          </section>
        </aside>

        <section className="graph-pane" aria-label="Dependency graph">
          <div className="graph-toolbar">
            <div>
              <span>Dependency Map</span>
              <small>{focusedNode ? focusedNode.name : "No focus"}</small>
            </div>
            <button type="button" onClick={toggleExpandFocus} disabled={!focusNodeId}>
              {expandedNodeIds.has(focusNodeId) ? "Collapse" : "Expand"}
            </button>
          </div>
          <div className="graph-canvas">
            <GraphView
              graph={graph}
              focusNodeId={focusNodeId}
              expandedNodeIds={expandedNodeIds}
              hiddenNodeTypes={hiddenNodeTypes}
              selectedEdge={selectedEdge}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
            />
          </div>
        </section>

        <aside className="right-pane" aria-label="Code and summaries">
          <section className="code-panel">
            <div className="panel-title">Code</div>
            {selectedNode ? (
              <CodeSnippet node={selectedNode} snippet={snippet} />
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
              hasRelationship={Boolean(selectedEdge)}
              onChange={setInspectorTab}
            />
            <div className="summary-stack" ref={inspectorBodyRef}>
              {inspectorTab === "ask" ? (
                <ChatAnswerPanel
                  status={chatStatus}
                  answer={chatAnswer}
                  error={chatError}
                  node={selectedNode}
                  settings={modelSettings}
                  question={chatQuestion}
                  canAsk={Boolean(graph)}
                  onQuestionChange={setChatQuestion}
                  onAsk={() => askQuestion()}
                  onCancel={cancelAsk}
                  onAskPreset={askQuestion}
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
              {inspectorTab === "relationship" ? <RelationshipDetails selectedEdge={selectedEdge} graph={graph} /> : null}
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

function ParseHealth({ graph }: { graph: GraphDocument | null }) {
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
      {graph && !parseErrors.length ? (
        <div className="settings-footnote ready">No parse warnings.</div>
      ) : parseErrors.length ? (
        <ul className="parse-warning-list">
          {visibleErrors.map((error) => (
            <li key={`${error.file}:${error.reason}`}>
              <strong title={error.file}>{error.file}</strong>
              <span>{error.reason}</span>
            </li>
          ))}
          {hiddenCount ? <li className="parse-warning-more">+{hiddenCount} more parse warnings</li> : null}
        </ul>
      ) : (
        <div className="settings-footnote">Open a folder or sample to see parse coverage.</div>
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
      <div className="cost-meter">
        <span>{cloud ? "Cloud meter" : "Local calls"}</span>
        <strong>{modelCallCount}</strong>
      </div>
      <div className="settings-footnote">Bulk summary est. {bulkTokenEstimate.toLocaleString()} tokens</div>
    </section>
  );
}

function InspectorTabs({
  activeTab,
  summaryStatus,
  dependencyCount,
  hasRelationship,
  onChange,
}: {
  activeTab: InspectorTab;
  summaryStatus?: SummaryStatus;
  dependencyCount: number;
  hasRelationship: boolean;
  onChange: (tab: InspectorTab) => void;
}) {
  const tabs: Array<{ id: InspectorTab; label: string; badge?: string }> = [
    { id: "ask", label: "Ask" },
    { id: "summary", label: "Summary", badge: summaryStatus === "running" ? "..." : undefined },
    { id: "impact", label: "Impact", badge: dependencyCount ? String(dependencyCount) : undefined },
    { id: "relationship", label: "Rel", badge: hasRelationship ? "1" : undefined },
  ];

  return (
    <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "is-active" : undefined}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.badge ? <small>{tab.badge}</small> : null}
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
  onOpenCitation: (citation: Citation) => void;
}) {
  const elapsedSeconds = useElapsedSeconds(state?.status === "running");
  const evidence = useMemo(() => (node && graph ? summaryEvidenceCitations(node, graph) : []), [graph, node]);
  const generating = state?.status === "running";

  return (
    <section className="summary-card">
      <div className="summary-actions">
        <div>
          <strong>Selected Summary</strong>
          <span>
            {node ? node.name : "No symbol"} - {PROVIDER_LABELS[settings.provider]} / {settings.model}
          </span>
        </div>
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
          {generating ? "Stop" : state?.summary ? "Regenerate" : "Generate Summary"}
        </button>
      </div>
      <div className="summary-output">
        {state?.status === "ready" && state.summary ? (
          <>
            <p>{state.summary.text}</p>
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
            <p>{nodeGraphOverview(node, graph)}</p>
            <EvidenceList citations={evidence} onOpenCitation={onOpenCitation} />
          </>
        ) : (
          <p>Select a graph node to inspect its source, relationships, and graph-derived summary.</p>
        )}
      </div>
      <div className="summary-meta">
        <button type="button" onClick={onGenerateAll} disabled={!summaryUnitCount || generating}>
          Summarize All
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

function ChatAnswerPanel({
  status,
  answer,
  error,
  node,
  settings,
  question,
  canAsk,
  onQuestionChange,
  onAsk,
  onCancel,
  onAskPreset,
  onOpenCitation,
}: {
  status: ChatStatus;
  answer: ChatAnswer | null;
  error: string;
  node: GraphNode | null;
  settings: ModelSettings;
  question: string;
  canAsk: boolean;
  onQuestionChange: (question: string) => void;
  onAsk: () => void;
  onCancel: () => void;
  onAskPreset: (question: string) => void;
  onOpenCitation: (citation: Citation) => void;
}) {
  const starterQuestions = suggestedGraphQuestions(node);
  const explainQuestion = node ? `Explain ${node.name} for a new developer.` : "";
  const elapsedSeconds = useElapsedSeconds(status === "running");
  const questionText = question.trim();
  const workingWithModel = Boolean(questionText && !isGraphQuestion(questionText));
  const answerSubtitle =
    status === "running"
      ? workingWithModel
        ? `${PROVIDER_LABELS[settings.provider]} is answering with cited graph context`
        : "Answering from graph context"
      : answer?.source === "model"
        ? `${PROVIDER_LABELS[settings.provider]} answer with cited graph context`
        : workingWithModel
          ? `${PROVIDER_LABELS[settings.provider]} will answer with cited graph context`
          : "Graph shortcuts answer without a model";
  const progressLabel = workingWithModel ? `Using ${PROVIDER_LABELS[settings.provider]}` : "Answering from graph context";
  const askButtonLabel = status === "running" ? "Stop" : workingWithModel ? "Ask AI" : "Ask";

  return (
    <section className="answer-card" aria-live="polite">
      <div className="answer-header">
        <div>
          <strong>Ask Codebase</strong>
          <span>{answerSubtitle}</span>
        </div>
      </div>
      <div className="answer-response">
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
            <p>{answer.text}</p>
            <CitationList citations={answer.citations.slice(0, 8)} onOpenCitation={onOpenCitation} />
          </>
        ) : (
          <p>Ask graph questions for instant answers, or ask for an explanation to use the selected AI provider with cited context.</p>
        )}
      </div>
      {starterQuestions.length ? (
        <div className="question-chips" aria-label="Suggested graph questions">
          {explainQuestion ? (
            <button
              type="button"
              onClick={() => onAskPreset(explainQuestion)}
              disabled={status === "running"}
              title={`Ask ${PROVIDER_LABELS[settings.provider]} for a cited explanation`}
            >
              AI explain {node?.name}
            </button>
          ) : null}
          {starterQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onAskPreset(question)}
              disabled={status === "running"}
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}
      <div className="chat-composer" aria-label="Ask a question">
        <input
          type="text"
          aria-label="Ask about the codebase"
          placeholder="Ask where something happens, what uses it, or where data flows..."
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
          key={`${citation.file}:${citation.line}:${citation.label}`}
          type="button"
          onClick={() => onOpenCitation(citation)}
          title={`${citation.label} - ${citation.file}:${citation.line}`}
        >
          <span className="citation-label">{citation.label}</span>
          <span className="citation-site">
            {citation.file}:{citation.line}
          </span>
        </button>
      ))}
    </div>
  );
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
    const key = `${citation.file}:${citation.line}`;
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
  graph,
}: {
  selectedEdge: GraphEdge | null;
  graph: GraphDocument | null;
}) {
  return (
    <section className="relationship-card">
      <div className="relationship-title">Relationship</div>
      {selectedEdge && graph ? (
        <EdgeExplanation edge={selectedEdge} graph={graph} />
      ) : graph?.meta.parseErrors.length ? (
        <ParseErrorSummary graph={graph} />
      ) : (
        <p>{graph ? "Select a relationship to see its cited source line." : "Open a folder to inspect relationships."}</p>
      )}
    </section>
  );
}

function CodeSnippet({ node, snippet }: { node: GraphNode; snippet: SourceSnippet | null }) {
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
            "Source snippet unavailable. Use Open Sample for the browser demo, or open the codebase in the desktop app."
          )}
        </code>
      </pre>
    </div>
  );
}

function EdgeExplanation({ edge, graph }: { edge: GraphEdge; graph: GraphDocument }) {
  return (
    <div className="edge-explanation">
      <strong>{edgeLabel(edge, graph)}</strong>
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
          <strong>{parseError.file}</strong>
          <span>{parseError.reason}</span>
        </li>
      ))}
    </ul>
  );
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

async function checkOllamaReadiness(settings: ModelSettings) {
  assertLocalOllamaUrl(settings.baseUrl);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`${normalizeOllamaBaseUrl(settings.baseUrl)}/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama responded with ${response.status}. Check the host and try again.`);
    }

    const body = (await response.json()) as { models?: Array<{ name?: string }> };
    const modelNames = body.models?.map((model) => model.name).filter((name): name is string => Boolean(name)) ?? [];
    if (!modelNames.length) {
      throw new Error(`Ollama is reachable, but no local models are installed. Run: ollama pull ${settings.model}`);
    }

    const configuredModel = settings.model.trim();
    const hasModel = modelNames.some(
      (name) => name === configuredModel || name === `${configuredModel}:latest` || name.startsWith(`${configuredModel}:`),
    );
    if (!hasModel) {
      throw new Error(`Ollama is reachable, but ${configuredModel} is not installed. Run: ollama pull ${configuredModel}`);
    }

    return `Ollama is ready on localhost with ${configuredModel}.`;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Could not reach Ollama at ${settings.baseUrl}. Start Ollama or check the host.`);
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
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

function firstFocusableNode(graph: GraphDocument) {
  return (
    graph.nodes.find((node) => node.type === "program" && !node.external)?.id ??
    graph.nodes.find((node) => !node.external)?.id ??
    graph.nodes[0]?.id ??
    ""
  );
}

function searchScore(node: GraphNode, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  const name = node.name.toLocaleLowerCase();
  const id = node.id.toLocaleLowerCase();
  const priority = typePriority(node.type) / 100;
  if (name === needle) return priority;
  if (id.endsWith(`:${needle}`) || id.endsWith(`/${needle}`)) return 1 + priority;
  if (name.startsWith(needle)) return 2 + priority;
  if (name.includes(needle)) return 3 + priority;
  return 5 + priority + name.length / 1000;
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
  if (!node) return [];
  const name = node.name;
  if (node.type === "program") {
    return [`What depends on ${name}?`, `What does ${name} call?`, `Where does ${name} happen?`];
  }
  if (node.type === "data-item") {
    return [`Where does ${name} flow?`, `What uses ${name}?`, `Where does ${name} happen?`];
  }
  if (node.type === "jcl-dd") {
    return [`What uses ${name}?`, `What does ${name} use?`, `Where does ${name} happen?`];
  }
  if (node.type === "dataset") {
    return [`What uses ${name}?`, `Where does ${name} flow?`, `Where does ${name} happen?`];
  }
  return [
    `What uses ${name}?`,
    `Where does ${name} happen?`,
    `What depends on ${name}?`,
  ];
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

