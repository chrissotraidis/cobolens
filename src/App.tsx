import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import "./App.css";

type GraphNode = {
  id: string;
  type: string;
  name: string;
  file?: string;
  lines?: [number, number];
  external?: boolean;
};

type GraphEdge = {
  from: string;
  to: string;
  type: string;
  site?: {
    file: string;
    line: number;
  };
};

type ParseError = {
  file: string;
  reason: string;
};

type GraphDocument = {
  schemaVersion: number;
  meta: {
    scannedAt: string;
    dialectGuess: string;
    fileCount: number;
    parsedFileCount: number;
    parseErrors: ParseError[];
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type Status = "idle" | "running" | "ready" | "error";

function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [root, setRoot] = useState<string>("");
  const [graph, setGraph] = useState<GraphDocument | null>(null);
  const [error, setError] = useState<string>("");

  const counts = useMemo(() => {
    const empty = {
      programs: 0,
      copybooks: 0,
      jobs: 0,
      steps: 0,
      external: 0,
    };
    if (!graph) {
      return empty;
    }
    return graph.nodes.reduce((acc, node) => {
      if (node.type === "program") acc.programs += 1;
      if (node.type === "copybook") acc.copybooks += 1;
      if (node.type === "jcl-job") acc.jobs += 1;
      if (node.type === "jcl-step") acc.steps += 1;
      if (node.external) acc.external += 1;
      return acc;
    }, empty);
  }, [graph]);

  async function chooseFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open COBOL codebase",
    });
    if (typeof selected !== "string") {
      return;
    }

    setRoot(selected);
    setGraph(null);
    setError("");
    setStatus("running");

    try {
      const result = await invoke<GraphDocument>("analyze_codebase", {
        root: selected,
      });
      setGraph(result);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <main className="workspace" aria-label="Cobolens workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Cobolens</span>
        </div>

        <label className="global-search">
          <span>Search</span>
          <input type="search" aria-label="Search symbols" disabled={!graph} />
        </label>

        <nav className="breadcrumbs" aria-label="Breadcrumb history">
          <button type="button">Home</button>
          <span>/</span>
          <span>{root ? basename(root) : "Workspace"}</span>
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
            <h2>Inventory</h2>
            <div className="metric-row">
              <span>Files</span>
              <strong>{graph?.meta.fileCount ?? 0}</strong>
            </div>
            <div className="metric-row">
              <span>Programs</span>
              <strong>{counts.programs}</strong>
            </div>
            <div className="metric-row">
              <span>Copybooks</span>
              <strong>{counts.copybooks}</strong>
            </div>
            <div className="metric-row">
              <span>JCL steps</span>
              <strong>{counts.steps}</strong>
            </div>
          </section>

          <section className="pane-block">
            <h2>Filters</h2>
            <div className="filter-row">
              <span className="swatch program" />
              <span>Programs</span>
            </div>
            <div className="filter-row">
              <span className="swatch copybook" />
              <span>Copybooks</span>
            </div>
            <div className="filter-row">
              <span className="swatch job" />
              <span>JCL</span>
            </div>
          </section>
        </aside>

        <section className="graph-pane" aria-label="Dependency graph">
          <div className="graph-toolbar">
            <span>Dependency Map</span>
            <button type="button" disabled={!graph}>
              Focus
            </button>
          </div>
          <div className="graph-canvas">
            <div className="focus-node">
              {graph ? `${graph.nodes.length} nodes` : "Select a codebase"}
            </div>
            <div className="orbit orbit-one">{edgeCount(graph, "CALLS")}</div>
            <div className="orbit orbit-two">{edgeCount(graph, "PERFORMS")}</div>
            <div className="orbit orbit-three">{edgeCount(graph, "COPIES")}</div>
          </div>
        </section>

        <aside className="right-pane" aria-label="Code and summaries">
          <section className="code-panel">
            <div className="panel-title">Graph JSON</div>
            <pre>
              <code>{graph ? JSON.stringify(graph, null, 2) : "No graph emitted yet."}</code>
            </pre>
          </section>

          <section className="chat-panel">
            <div className="panel-title">Parse Report</div>
            <div className="summary-empty">
              {status === "error" ? (
                <p className="error-text">{error}</p>
              ) : graph?.meta.parseErrors.length ? (
                <ul className="parse-errors">
                  {graph.meta.parseErrors.map((parseError) => (
                    <li key={`${parseError.file}:${parseError.reason}`}>
                      <strong>{parseError.file}</strong>
                      <span>{parseError.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {graph
                    ? "All discovered files parsed for the M1 graph."
                    : "Unparsed files will appear here after ingest."}
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

function basename(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function statusLabel(status: Status) {
  if (status === "running") return "Indexing";
  if (status === "ready") return "Graph ready";
  if (status === "error") return "Needs attention";
  return "Idle";
}

function edgeCount(graph: GraphDocument | null, type: string) {
  if (!graph) {
    return "";
  }
  return graph.edges.filter((edge) => edge.type === type).length;
}

export default App;
