import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { GraphView } from "./graph/GraphView";
import {
  GraphDocument,
  GraphEdge,
  GraphNode,
  SourceSnippet,
  edgeLabel,
  matchesFuzzy,
  nodeColor,
} from "./lib/graph";
import "./App.css";

type Status = "idle" | "running" | "ready" | "error";

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

  const nodeById = useMemo(() => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []), [graph]);
  const focusedNode = nodeById.get(focusNodeId) ?? null;
  const selectedNode = nodeById.get(selectedNodeId) ?? focusedNode;

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

        <div className="mode-indicator" aria-label="Privacy mode">
          Local
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
            <div className="panel-title">Relationship</div>
            <div className="summary-empty">
              {status === "error" ? (
                <p className="error-text">{error}</p>
              ) : selectedEdge && graph ? (
                <EdgeExplanation edge={selectedEdge} graph={graph} />
              ) : graph?.meta.parseErrors.length ? (
                <ParseErrorSummary graph={graph} />
              ) : (
                <p>
                  {graph
                    ? "Click an edge to explain its relationship."
                    : "Unparsed files and relationship details appear here."}
                </p>
              )}
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

