import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
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
import { UnitSummary, generateUnitSummary } from "./model/summaries";
import "./App.css";

type Status = "idle" | "running" | "ready" | "error";
type SummaryStatus = "idle" | "running" | "ready" | "error";
type SummaryState = {
  status: SummaryStatus;
  summary?: UnitSummary;
  error?: string;
};

declare global {
  interface Window {
    __cobolensLoadGraph?: (graph: GraphDocument, root?: string) => void;
  }
}

function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [root, setRoot] = useState<string>("");
  const [graph, setGraph] = useState<GraphDocument | null>(null);
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
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
  const [bulkSummaryStatus, setBulkSummaryStatus] = useState("");

  const nodeById = useMemo(() => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []), [graph]);
  const focusedNode = nodeById.get(focusNodeId) ?? null;
  const selectedNode = nodeById.get(selectedNodeId) ?? focusedNode;
  const selectedSummaryState = selectedNode ? summaries[selectedNode.id] : undefined;
  const programNodes = useMemo(
    () => graph?.nodes.filter((node) => node.type === "program" && !node.external && node.file) ?? [],
    [graph],
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
        if (!cancelled) acceptGraph(loadedGraph, "");
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
    if (!root || !node?.file) {
      setSnippet(null);
      return;
    }

    let cancelled = false;
    const line = node.lines?.[0] ?? 1;
    invoke<SourceSnippet>("read_source_snippet", {
      root,
      file: node.file,
      line,
    })
      .then((result) => {
        if (!cancelled) setSnippet(result);
      })
      .catch(() => {
        if (!cancelled) setSnippet(null);
      });

    return () => {
      cancelled = true;
    };
  }, [root, selectedNode]);

  useEffect(() => {
    let cancelled = false;
    setKeyDraft("");
    setSettingsMessage("");
    if (!isCloudProvider(modelSettings.provider)) {
      setHasProviderKey(false);
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

  async function chooseFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open COBOL codebase",
    });
    if (typeof selected !== "string") return;

    setRoot(selected);
    setGraph(null);
    setSnippet(null);
    setSelectedEdge(null);
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

  function acceptGraph(nextGraph: GraphDocument, nextRoot: string) {
    const initialFocus = firstFocusableNode(nextGraph);
    setRoot(nextRoot);
    setGraph(nextGraph);
    setFocusNodeId(initialFocus);
    setSelectedNodeId(initialFocus);
    setSelectedEdge(null);
    setExpandedNodeIds(new Set());
    setHistory(initialFocus ? [initialFocus] : []);
    setSummaries({});
    setBulkSummaryStatus("");
    setStatus("ready");
  }

  function focusOnNode(nodeId: string) {
    if (!nodeById.has(nodeId)) return;
    setFocusNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setSelectedEdge(null);
    setExpandedNodeIds(new Set());
    setHistory((current) => [...current.filter((id) => id !== nodeId), nodeId].slice(-8));
  }

  function selectNode(nodeId: string) {
    focusOnNode(nodeId);
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
    try {
      await invoke("clear_provider_key", { provider: modelSettings.provider });
      setHasProviderKey(false);
      setSettingsMessage("Key cleared");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : String(err));
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
      const apiKey = isCloudProvider(modelSettings.provider)
        ? await invoke<string>("read_provider_key", { provider: modelSettings.provider })
        : undefined;
      const summary = await generateUnitSummary({
        graph,
        node,
        excerpt,
        settings: modelSettings,
        apiKey,
      });
      setSummaries((current) => ({
        ...current,
        [node.id]: { status: "ready", summary },
      }));
    } catch (err) {
      setSummaries((current) => ({
        ...current,
        [node.id]: { status: "error", error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  async function sourceExcerptForNode(node: GraphNode) {
    if (!root || !node.file) {
      throw new Error("Open a codebase from the desktop app before generating summaries.");
    }
    const startLine = node.lines?.[0] ?? 1;
    const endLine = node.lines?.[1] ?? startLine;
    return invoke<SourceExcerpt>("read_source_excerpt", {
      root,
      file: node.file,
      startLine,
      endLine,
      maxLines: 220,
    });
  }

  window.__cobolensLoadGraph = (nextGraph, nextRoot = "") => {
    acceptGraph(nextGraph, nextRoot);
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
            <button className="primary-action" type="button" onClick={chooseFolder}>
              Open Folder
            </button>
            <div className="path-label">{root || "No codebase selected"}</div>
            <div className={`status-pill ${status}`}>{statusLabel(status)}</div>
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
          />

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
              onSelectEdge={setSelectedEdge}
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
            <div className="panel-title">Summary</div>
            <div className="summary-stack">
              <SummaryDock
                node={selectedNode}
                state={selectedSummaryState}
                settings={modelSettings}
                programCount={programNodes.length}
                bulkStatus={bulkSummaryStatus}
                onGenerateSelected={generateSelectedSummary}
                onGenerateAll={generateAllProgramSummaries}
              />
              <RelationshipDetails status={status} error={error} selectedEdge={selectedEdge} graph={graph} />
            </div>
            <div className="chat-input" aria-label="Ask a question">
              <input type="text" aria-label="Ask about the codebase" disabled />
              <button type="button" disabled>
                Ask
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
  onProviderChange,
  onSettingsChange,
  onKeyDraftChange,
  onSaveKey,
  onClearKey,
}: {
  settings: ModelSettings;
  keyDraft: string;
  hasProviderKey: boolean;
  message: string;
  onProviderChange: (provider: ModelProvider) => void;
  onSettingsChange: (settings: ModelSettings) => void;
  onKeyDraftChange: (value: string) => void;
  onSaveKey: () => void;
  onClearKey: () => void;
}) {
  const cloud = isCloudProvider(settings.provider);

  return (
    <section className="pane-block model-settings">
      <h2>Brain</h2>
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
      {cloud ? (
        <div className="button-row">
          <button type="button" onClick={onSaveKey} disabled={!keyDraft.trim()}>
            Save Key
          </button>
          <button type="button" onClick={onClearKey} disabled={!hasProviderKey}>
            Clear
          </button>
        </div>
      ) : null}
      <div className="settings-footnote">{cloud ? message || (hasProviderKey ? "Key ready" : "No key") : "Local mode"}</div>
    </section>
  );
}

function SummaryDock({
  node,
  state,
  settings,
  programCount,
  bulkStatus,
  onGenerateSelected,
  onGenerateAll,
}: {
  node: GraphNode | null;
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
          {state?.status === "running" ? "Generating" : "Summarize"}
        </button>
      </div>
      <div className="summary-output">
        {state?.status === "ready" && state.summary ? (
          <p>{state.summary.text}</p>
        ) : state?.status === "error" ? (
          <p className="error-text">{state.error}</p>
        ) : (
          <p>{node?.file ? "No summary yet." : "Select a source-backed symbol."}</p>
        )}
      </div>
      <div className="summary-meta">
        <button type="button" onClick={onGenerateAll} disabled={!programCount || state?.status === "running"}>
          Summarize Programs
        </button>
        <span>{bulkStatus || `${programCount} source programs`}</span>
      </div>
    </section>
  );
}

function RelationshipDetails({
  status,
  error,
  selectedEdge,
  graph,
}: {
  status: Status;
  error: string;
  selectedEdge: GraphEdge | null;
  graph: GraphDocument | null;
}) {
  return (
    <section className="relationship-card">
      <div className="relationship-title">Relationship</div>
      {status === "error" ? (
        <p className="error-text">{error}</p>
      ) : selectedEdge && graph ? (
        <EdgeExplanation edge={selectedEdge} graph={graph} />
      ) : graph?.meta.parseErrors.length ? (
        <ParseErrorSummary graph={graph} />
      ) : (
        <p>{graph ? "No edge selected." : "Open a folder to inspect relationships."}</p>
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
        <span>{node.file}</span>
        <strong>line {node.lines?.[0] ?? 1}</strong>
      </div>
      <pre>
        <code>
          {snippet
            ? snippet.lines
                .map((line) => `${line.number === snippet.highlightLine ? ">" : " "} ${padLine(line.number)} ${line.text}`)
                .join("\n")
            : "Source snippet unavailable in this runtime."}
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

