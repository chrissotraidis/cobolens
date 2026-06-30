import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
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
  DEFAULT_MODEL_SETTINGS,
  ModelProvider,
  ModelSettings,
  PROVIDER_LABELS,
  isCloudProvider,
  settingsForProvider,
} from "./model/config";
import { generateGroundedAnswer } from "./model/chat";
import { UnitSummary, generateUnitSummary } from "./model/summaries";
import { assertLocalOllamaUrl, normalizeOllamaBaseUrl } from "./model/providers";
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
};
type ModelReadiness = {
  status: "idle" | "checking" | "ready" | "error";
  message: string;
};
type SourceFocus = {
  file: string;
  line: number;
  nodeId?: string;
};

const LINEAGE_EDGE_TYPES = new Set(["reads", "writes", "moves-to", "queries", "updates", "links", "xctls", "uses-dd", "executes"]);

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: unknown;
    };
    __cobolensLoadGraph?: (graph: GraphDocument, root?: string, sourceBase?: string) => void;
  }
}

function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [root, setRoot] = useState<string>("");
  const [graph, setGraph] = useState<GraphDocument | null>(null);
  const [sourceBase, setSourceBase] = useState("");
  const [focusNodeId, setFocusNodeId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
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

  const nodeById = useMemo(() => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []), [graph]);
  const focusedNode = nodeById.get(focusNodeId) ?? null;
  const selectedNode = nodeById.get(selectedNodeId) ?? focusedNode;
  const selectedSummaryState = selectedNode ? summaries[selectedNode.id] : undefined;
  const programNodes = useMemo(
    () => graph?.nodes.filter((node) => node.type === "program" && !node.external && node.file) ?? [],
    [graph],
  );
  const bulkTokenEstimate = useMemo(
    () =>
      programNodes.reduce(
        (total, node) => total + estimateTokens(`${node.name} ${node.file ?? ""} ${node.lines?.join("-") ?? ""}`) + 900,
        0,
      ),
    [programNodes],
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
    const node = selectedNode;
    const target = sourceFocus ?? (node?.file ? { file: node.file, line: node.lines?.[0] ?? 1, nodeId: node.id } : null);
    if ((!root && !sourceBase) || !target) {
      setSnippet(null);
      return;
    }

    let cancelled = false;
    readSourceSnippet(root, sourceBase, target.file, target.line)
      .then((result) => {
        if (!cancelled) setSnippet(result);
      })
      .catch(() => {
        if (!cancelled) setSnippet(null);
      });

    return () => {
      cancelled = true;
    };
  }, [root, selectedNode, sourceBase, sourceFocus]);

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

    setRoot(selected);
    setSourceBase("");
    setGraph(null);
    setSnippet(null);
    setSelectedEdge(null);
    setSourceFocus(null);
    setError("");
    setStatus("running");

    try {
      const result = await invoke<GraphDocument>("analyze_codebase", {
        root: selected,
      });
      acceptGraph(result, selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function openSample() {
    if (!canUseTauri()) {
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

    setRoot("Bundled sample: Mini Bank");
    setSourceBase("");
    setGraph(null);
    setSnippet(null);
    setSelectedEdge(null);
    setSourceFocus(null);
    setError("");
    setStatus("running");

    try {
      const result = await invoke<GraphDocument>("analyze_sample_codebase");
      acceptGraph(result, "Bundled sample: Mini Bank");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
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
    setHistory(initialFocus ? [initialFocus] : []);
    setSummaries({});
    setBulkSummaryStatus("");
    setChatAnswer(null);
    setChatQuestion("");
    setChatStatus("idle");
    setChatError("");
    setSourceFocus(null);
    setExportStatus("");
    setStatus("ready");
  }

  function focusOnNode(nodeId: string) {
    if (!nodeById.has(nodeId)) return;
    setFocusNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setSelectedEdge(null);
    setSourceFocus(null);
    setExpandedNodeIds(new Set());
    setHistory((current) => [...current.filter((id) => id !== nodeId), nodeId].slice(-8));
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

  function goHome() {
    if (!graph) return;
    focusOnNode(firstFocusableNode(graph));
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
    setModelReadiness({ status: "checking", message: "Checking AI settings" });
    try {
      if (isCloudProvider(modelSettings.provider)) {
        if (!canUseTauri()) {
          throw new Error("Cloud API keys are stored in the desktop keychain. Use the desktop app to check cloud AI settings.");
        }
        if (!hasProviderKey) {
          throw new Error(`Save a ${PROVIDER_LABELS[modelSettings.provider]} key before using cloud AI.`);
        }
        await providerKeyForModel(modelSettings);
        setModelReadiness({
          status: "ready",
          message: `${PROVIDER_LABELS[modelSettings.provider]} key is saved. Cloud calls happen only when you run AI Summary or non-graph Ask.`,
        });
        return;
      }

      const message = await checkOllamaReadiness(modelSettings);
      setModelReadiness({ status: "ready", message });
    } catch (err) {
      setModelReadiness({ status: "error", message: friendlyModelError(err, modelSettings) });
    }
  }

  async function generateSelectedSummary() {
    if (!graph || !selectedNode) return;
    await generateSummaryForNode(selectedNode);
  }

  async function generateAllProgramSummaries() {
    if (!graph || !programNodes.length) return;
    setBulkSummaryStatus(`0/${programNodes.length}`);
    for (let index = 0; index < programNodes.length; index += 1) {
      await generateSummaryForNode(programNodes[index]);
      setBulkSummaryStatus(`${index + 1}/${programNodes.length}`);
    }
  }

  async function generateSummaryForNode(node: GraphNode) {
    if (!graph || !node.file) return;
    setSummaries((current) => ({
      ...current,
      [node.id]: { status: "running" },
    }));

    try {
      const excerpt = await sourceExcerptForNode(node);
      const apiKey = await providerKeyForModel(modelSettings);
      const summary = await generateUnitSummary({
        graph,
        node,
        excerpt,
        settings: modelSettings,
        apiKey,
      });
      setModelCallCount((count) => count + 1);
      setSummaries((current) => ({
        ...current,
        [node.id]: { status: "ready", summary },
      }));
    } catch (err) {
      setSummaries((current) => ({
        ...current,
        [node.id]: { status: "error", error: friendlyModelError(err, modelSettings) },
      }));
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
    return readSourceExcerpt(root, sourceBase, node.file, startLine, endLine, 220);
  }

  async function askQuestion() {
    if (!graph || !chatQuestion.trim()) return;
    const question = chatQuestion.trim();
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
        setChatAnswer({ question, text: fallback.text, citations: fallback.citations });
        setChatStatus("ready");
        if (context.focusNodes[0]) focusOnNode(context.focusNodes[0].id);
        return;
      }
      const apiKey = await providerKeyForModel(modelSettings);
      const answer = await generateGroundedAnswer({
        question,
        context,
        settings: modelSettings,
        apiKey,
      });
      setModelCallCount((count) => count + 1);
      setChatAnswer({ question, text: answer.text, citations: context.citations });
      setChatStatus("ready");
      if (context.focusNodes[0]) focusOnNode(context.focusNodes[0].id);
    } catch (err) {
      if (context) {
        const fallback = graphAnswerFallback(graph, question, context, friendlyModelError(err, modelSettings));
        setChatAnswer({ question, text: fallback.text, citations: fallback.citations });
        setChatStatus("ready");
        if (context.focusNodes[0]) focusOnNode(context.focusNodes[0].id);
        return;
      }
      setChatError(friendlyModelError(err, modelSettings));
      setChatStatus("error");
    }
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
        await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
        setExportStatus("Exported Markdown, Mermaid, PNG");
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

      await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
      setExportStatus("Exported Markdown, Mermaid, PNG");
    } catch {
      try {
        const docs = buildDocumentationExport(graph, summaries, focusNodeId);
        await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
        setExportStatus("Exported Markdown, Mermaid, PNG");
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
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            disabled={!graph}
          />
        </label>

        <nav className="breadcrumbs" aria-label="Breadcrumb history">
          <button type="button" onClick={goHome} disabled={!graph}>
            Home
          </button>
          {history.slice(-3).map((nodeId) => (
            <button key={nodeId} type="button" onClick={() => focusOnNode(nodeId)}>
              {nodeById.get(nodeId)?.name ?? nodeId}
            </button>
          ))}
        </nav>

        <div className={`mode-indicator ${modelSettings.privacyMode}`} aria-label="Privacy mode">
          {modelSettings.privacyMode === "local" ? "Local" : `Cloud: ${PROVIDER_LABELS[modelSettings.provider]}`}
        </div>
      </header>

      <section className="shell">
        <aside className="left-pane" aria-label="Navigator">
          <section className="pane-block">
            <h2>Ingest</h2>
            <button className="primary-action" type="button" onClick={chooseFolder} disabled={!canUseTauri()}>
              Open Folder
            </button>
            <button type="button" onClick={openSample}>
              Open Sample
            </button>
            <div className="path-label">{root || "No codebase selected"}</div>
            <div className={`status-pill ${status}`}>{statusLabel(status)}</div>
            {status === "error" && error ? <div className="inline-error">{error}</div> : null}
          </section>

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
            <Metric label="Programs" value={counts.programs} />
            <Metric label="Copybooks" value={counts.copybooks} />
            <Metric label="JCL steps" value={counts.steps} />
          </section>

          <section className="pane-block">
            <h2>Legend</h2>
            <LegendItem type="program" label="Programs" />
            <LegendItem type="paragraph" label="Paragraphs" />
            <LegendItem type="copybook" label="Copybooks" />
            <LegendItem type="jcl-job" label="JCL jobs" />
            <LegendItem type="jcl-step" label="JCL steps" />
            <LegendItem type="data-item" label="Data items" />
            <LegendItem type="dataset" label="Datasets" />
            <LegendItem type="db2-table" label="DB2 tables" />
            <LegendItem type="cics-command" label="CICS commands" />
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
            <div className="panel-title">Inspector</div>
            <div className="summary-stack">
              <SummaryDock
                node={selectedNode}
                graph={graph}
                state={selectedSummaryState}
                settings={modelSettings}
                programCount={programNodes.length}
                bulkStatus={bulkSummaryStatus}
                onGenerateSelected={generateSelectedSummary}
                onGenerateAll={generateAllProgramSummaries}
              />
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
              <ChatAnswerPanel
                status={chatStatus}
                answer={chatAnswer}
                error={chatError}
                onOpenCitation={jumpToCitation}
              />
              <RelationshipDetails selectedEdge={selectedEdge} graph={graph} />
            </div>
            <div className="chat-input" aria-label="Ask a question">
              <input
                type="text"
                aria-label="Ask about the codebase"
                placeholder="Ask what depends on CUSTOMER-ID..."
                value={chatQuestion}
                onChange={(event) => setChatQuestion(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") askQuestion();
                }}
                disabled={!graph || chatStatus === "running"}
              />
              <button type="button" onClick={askQuestion} disabled={!graph || !chatQuestion.trim() || chatStatus === "running"}>
                {chatStatus === "running" ? "..." : "Ask"}
              </button>
            </div>
          </section>
        </aside>
      </section>
    </main>
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

function LegendItem({ type, label }: { type: string; label: string }) {
  return (
    <div className="filter-row">
      <span className="swatch" style={{ background: nodeColor(type) }} />
      <span>{label}</span>
    </div>
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
        {modelReadiness.message || (cloud ? message || (hasProviderKey ? "Key ready" : "No key") : "Local mode")}
      </div>
      <div className="cost-meter">
        <span>{cloud ? "Cloud meter" : "Local calls"}</span>
        <strong>{modelCallCount}</strong>
      </div>
      <div className="settings-footnote">Bulk summary est. {bulkTokenEstimate.toLocaleString()} tokens</div>
    </section>
  );
}

function SummaryDock({
  node,
  graph,
  state,
  settings,
  programCount,
  bulkStatus,
  onGenerateSelected,
  onGenerateAll,
}: {
  node: GraphNode | null;
  graph: GraphDocument | null;
  state?: SummaryState;
  settings: ModelSettings;
  programCount: number;
  bulkStatus: string;
  onGenerateSelected: () => void;
  onGenerateAll: () => void;
}) {
  return (
    <section className="summary-card">
      <div className="summary-actions">
        <div>
          <strong>{node ? node.name : "No symbol"}</strong>
          <span>
            {PROVIDER_LABELS[settings.provider]} / {settings.model}
          </span>
        </div>
        <button type="button" onClick={onGenerateSelected} disabled={!node?.file || state?.status === "running"}>
          {state?.status === "running" ? "Generating" : "AI Summary"}
        </button>
      </div>
      <div className="summary-output">
        {state?.status === "ready" && state.summary ? (
          <p>{state.summary.text}</p>
        ) : state?.status === "error" ? (
          <p className="error-text">{state.error}</p>
        ) : node && graph ? (
          <p>{nodeGraphOverview(node, graph)}</p>
        ) : (
          <p>Select a graph node to inspect its source, relationships, and graph-derived summary.</p>
        )}
      </div>
      <div className="summary-meta">
        <button type="button" onClick={onGenerateAll} disabled={!programCount || state?.status === "running"}>
          AI Summaries
        </button>
        <span>{bulkStatus || `${programCount} source programs`}</span>
      </div>
    </section>
  );
}

function ChatAnswerPanel({
  status,
  answer,
  error,
  onOpenCitation,
}: {
  status: ChatStatus;
  answer: ChatAnswer | null;
  error: string;
  onOpenCitation: (citation: Citation) => void;
}) {
  return (
    <section className="answer-card">
      <div className="relationship-title">Ask</div>
      {status === "running" ? (
        <p>Thinking...</p>
      ) : status === "error" ? (
        <p className="error-text">{error}</p>
      ) : answer ? (
        <>
          <div className="answer-question">{answer.question}</div>
          <p>{answer.text}</p>
          <div className="citation-list">
            {answer.citations.slice(0, 8).map((citation) => (
              <button
                key={`${citation.file}:${citation.line}:${citation.label}`}
                type="button"
                onClick={() => onOpenCitation(citation)}
              >
                {citation.file}:{citation.line}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p>Ask where a symbol happens, what depends on it, or where data flows. Graph questions work without AI.</p>
      )}
    </section>
  );
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
                <button type="button" className="lineage-edge" onClick={() => onOpenEdge(edge)} disabled={!edge.site}>
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
        <code>
          {snippet
            ? snippet.lines
                .map((line) => `${line.number === snippet.highlightLine ? ">" : " "} ${padLine(line.number)} ${line.text}`)
                .join("\n")
            : "Source snippet unavailable. Use Open Sample for the browser demo, or open the codebase in the desktop app."}
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

async function readSourceSnippet(root: string, sourceBase: string, file: string, line: number): Promise<SourceSnippet> {
  if (root && canUseTauri()) {
    return invoke<SourceSnippet>("read_source_snippet", {
      root,
      file,
      line,
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
): Promise<SourceExcerpt> {
  if (root && canUseTauri()) {
    return invoke<SourceExcerpt>("read_source_excerpt", {
      root,
      file,
      startLine,
      endLine,
      maxLines,
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
  const location = node.file ? `${node.file}:${node.lines?.[0] ?? 1}` : "external";
  const parts = [
    `${node.name} is a ${node.type}${node.external ? " outside this codebase" : ""}.`,
    `Source: ${location}.`,
    `${incoming.length} incoming and ${outgoing.length} outgoing relationships are recorded.`,
  ];
  if (lineage.length) {
    parts.push(`${lineage.length} lineage relationship${lineage.length === 1 ? " is" : "s are"} available for reads, writes, moves, queries, links, or runtime wiring.`);
  }
  return parts.join(" ");
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

function statusLabel(status: Status) {
  if (status === "running") return "Indexing";
  if (status === "ready") return "Graph ready";
  if (status === "error") return "Needs attention";
  return "Idle";
}

function padLine(line: number) {
  return line.toString().padStart(5, " ");
}

export default App;

