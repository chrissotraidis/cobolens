import type { Citation } from "../retrieval/context";
import type { GraphDocument, GraphNode } from "../lib/graph";
import { nodeColor } from "../lib/graph";
import type { CodebaseInventoryCounts, SourceTreeGroup } from "../lib/graphSelectors";
import type { AnalysisProgress } from "../scan/useAnalysisProgress";
import { GraphHints, LegendItem, Metric, NavigatorDetails, ParseHealth, SourceTree } from "./NavigatorPanels";
import { sampleForRoot } from "../samples/catalog";

type NavigatorStatus = "idle" | "running" | "ready" | "error";

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

export function NavigatorRail({
  root,
  status,
  graph,
  desktopAvailable,
  scanProgress,
  error,
  query,
  searchResults,
  codebaseGroups,
  selectedNodeId,
  hiddenNodeTypes,
  counts,
  unreferencedSourceUnits,
  onRescan,
  onFocusSearchResult,
  onSelectSourceNode,
  onOpenGuideStop,
  onResetNodeTypeFilters,
  onToggleNodeTypeFilter,
  onOpenWarning,
  onFocusNode,
}: {
  root: string;
  status: NavigatorStatus;
  graph: GraphDocument | null;
  desktopAvailable: boolean;
  scanProgress: AnalysisProgress | null;
  error: string;
  query: string;
  searchResults: GraphNode[];
  codebaseGroups: SourceTreeGroup[];
  selectedNodeId: string;
  hiddenNodeTypes: Set<string>;
  counts: CodebaseInventoryCounts;
  unreferencedSourceUnits: GraphNode[];
  onRescan: () => void;
  onFocusSearchResult: (nodeId: string) => void;
  onSelectSourceNode: (nodeId: string) => void;
  onOpenGuideStop: (nodeId: string) => void;
  onResetNodeTypeFilters: () => void;
  onToggleNodeTypeFilter: (type: string) => void;
  onOpenWarning: (citation: Citation) => void;
  onFocusNode: (nodeId: string) => void;
}) {
  const projectLabel = root || "No codebase selected";
  const projectStatus = statusLabel(status);
  const activeSample = sampleForRoot(root);
  const guideStops = activeSample?.guide.stops.map((stop) => ({
    ...stop,
    node: graph?.nodes.find((node) => node.id === stop.nodeId),
  })) ?? [];

  return (
    <aside id="navigator-panel" className="left-pane" aria-label="Navigator" tabIndex={-1}>
      <section className={`pane-block project-summary status-${status}`} aria-label={`Project ${projectStatus}`}>
        <div className="project-strip" title={`${projectStatus}: ${projectLabel}`}>
          <span className="project-status-dot" aria-hidden="true" />
          <span className="path-label">{projectLabel}</span>
        </div>
        {!graph ? (
          <p className="graph-empty-note">Choose a project from the welcome in the map. Its programs, jobs, and copybooks will appear here.</p>
        ) : desktopAvailable ? (
          <button type="button" onClick={onRescan} disabled={status === "running"} title="Re-scan the current folder">
            Re-scan
          </button>
        ) : null}
        {status === "running" ? <div className="scan-progress">{scanProgressLabel(scanProgress)}</div> : null}
        {status === "error" && error ? <div className="inline-error">{error}</div> : null}
      </section>

      {graph && activeSample ? (
        <details className="pane-block sample-guide" aria-label={`${activeSample.name} guided trace`} open>
          <summary>
            <span>Guided trace</span>
            <small>{guideStops.length} stops</small>
          </summary>
          <div className="sample-guide-body">
          <div className="pane-heading-row">
            <h2>{activeSample.guide.title}</h2>
          </div>
          <p>{activeSample.guide.description}</p>
          <ol>
            {guideStops.map((stop) => (
              <li key={stop.nodeId}>
                <button type="button" disabled={!stop.node} onClick={() => stop.node && onOpenGuideStop(stop.node.id)}>
                  {stop.label}
                </button>
              </li>
            ))}
          </ol>
          <small>{activeSample.guide.footnote}</small>
          </div>
        </details>
      ) : null}

      {query.trim() ? (
        <section className="pane-block">
          <h2>Search Results</h2>
          <div className="search-results">
            {searchResults.length ? (
              searchResults.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  aria-label={`Search result ${node.name} ${node.type}`}
                  onClick={() => onFocusSearchResult(node.id)}
                >
                  <span className="swatch" style={{ background: nodeColor(node.type) }} />
                  <span>{node.name}</span>
                  <small>{node.type}</small>
                </button>
              ))
            ) : (
              <div className="empty-copy">No matching graph symbols. Source text search is not implemented yet.</div>
            )}
          </div>
        </section>
      ) : null}

      <SourceTree groups={codebaseGroups} selectedNodeId={selectedNodeId} onSelectNode={onSelectSourceNode} />

      <div className="navigator-secondary" aria-label="Status and filters">
        <NavigatorDetails
          title="Legend & Filters"
          badge={hiddenNodeTypes.size ? `${hiddenNodeTypes.size} hidden` : "All visible"}
          defaultOpen={hiddenNodeTypes.size > 0}
        >
          <div className="pane-heading-row">
            <div className="settings-footnote">
              {hiddenNodeTypes.size
                ? `${hiddenNodeTypes.size} type${hiddenNodeTypes.size === 1 ? "" : "s"} hidden`
                : "All types visible"}
            </div>
            <button type="button" onClick={onResetNodeTypeFilters} disabled={!hiddenNodeTypes.size}>
              Reset
            </button>
          </div>
          <div className="filter-grid">
            {LEGEND_NODE_TYPES.map(([type, label]) => (
              <LegendItem
                key={type}
                type={type}
                label={label}
                checked={!hiddenNodeTypes.has(type)}
                disabled={!graph}
                onToggle={() => onToggleNodeTypeFilter(type)}
              />
            ))}
          </div>
        </NavigatorDetails>

        <NavigatorDetails title="Inventory" badge={`${graph?.meta.fileCount ?? 0} files`}>
          <div className="settings-footnote">What this scan found (read-only counts).</div>
          <Metric label="Files" value={graph?.meta.fileCount ?? 0} />
          <Metric label="Parsed" value={graph?.meta.parsedFileCount ?? 0} />
          <Metric label="Source programs" value={counts.programs} />
          <Metric label="Copybooks" value={counts.copybooks} />
          <Metric label="JCL jobs" value={counts.jobs} />
          <Metric label="JCL steps" value={counts.steps} />
          <Metric label="External refs" value={counts.external} />
        </NavigatorDetails>

        <ParseHealth graph={graph} onOpenWarning={onOpenWarning} />

        <GraphHints
          graph={graph}
          unreferencedSourceUnits={unreferencedSourceUnits}
          onFocusNode={onFocusNode}
        />
      </div>
    </aside>
  );
}

function statusLabel(status: NavigatorStatus) {
  if (status === "running") return "Scanning…";
  if (status === "ready") return "Ready";
  if (status === "error") return "Needs attention";
  return "No codebase loaded";
}

function scanProgressLabel(progress: AnalysisProgress | null) {
  if (!progress) return "Preparing analyzer";
  const total = Number.isFinite(progress.total) ? progress.total : 0;
  const done = Number.isFinite(progress.done) ? progress.done : 0;
  const phase = progress.phase ? progress.phase[0].toUpperCase() + progress.phase.slice(1) : "Analyzing";
  return total > 0 ? `${phase} ${Math.min(done, total)}/${total}` : phase;
}
