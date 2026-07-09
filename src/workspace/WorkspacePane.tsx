import { GraphView } from "../graph/GraphView";
import type { GraphDocument, GraphEdge, GraphNode, SourceFileContent } from "../lib/graph";
import { nodeColor } from "../lib/graph";
import { nodeTypeLabel } from "../lib/graphLabels";
import { SourceFileView } from "../source/SourceFileView";
import { sourceLineLabel } from "../source/sourceLineLabels";

export type CenterView = "map" | "source";
export type SourceFocus = {
  file: string;
  line: number;
  nodeId?: string;
};

type SourceFileEntry = {
  file: string;
  node: GraphNode;
};

type FocusExpansion = {
  hiddenByLimit: number;
};

export function WorkspacePane({
  centerView,
  graph,
  focusNodeId,
  focusedNode,
  selectedNode,
  selectedEdge,
  expandedNodeIds,
  hiddenNodeTypes,
  sourceFiles,
  source,
  sourceLoading,
  sourceError,
  sourceFocus,
  focusExpanded,
  focusExpansion,
  expandButtonTitle,
  showGraphNodeList,
  onCenterViewChange,
  onSelectNode,
  onSelectEdge,
  onExpandNode,
  onToggleExpandFocus,
  onToggleGraphNodeList,
  onFocusNode,
}: {
  centerView: CenterView;
  graph: GraphDocument | null;
  focusNodeId: string;
  focusedNode: GraphNode | null;
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  expandedNodeIds: Set<string>;
  hiddenNodeTypes: Set<string>;
  sourceFiles: SourceFileEntry[];
  source: SourceFileContent | null;
  sourceLoading: boolean;
  sourceError: string;
  sourceFocus: SourceFocus | null;
  focusExpanded: boolean;
  focusExpansion: FocusExpansion;
  expandButtonTitle: string;
  showGraphNodeList: boolean;
  onCenterViewChange: (view: CenterView) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
  onExpandNode: (nodeId: string) => void;
  onToggleExpandFocus: () => void;
  onToggleGraphNodeList: () => void;
  onFocusNode: (nodeId: string, options?: { preserveChat?: boolean; preserveExpansion?: boolean }) => void;
}) {
  const focusedCitation = Boolean(
    sourceFocus &&
      source &&
      sourceFocus.file === source.file &&
      sourceFocus.line === source.highlightLine,
  );
  const sourceLineText = focusedCitation
    ? `line ${source?.highlightLine ?? sourceFocus?.line ?? selectedNode?.lines?.[0] ?? 1} / ${source?.lineCount ?? "?"}`
    : `${sourceLineLabel(selectedNode?.lines, source?.highlightLine ?? 1)}${source ? ` / ${source.lineCount}` : ""}`;

  return (
    <section
      id="dependency-graph"
      className={`center-pane center-${centerView}${centerView === "map" && !focusedNode ? " is-empty" : ""}`}
      aria-label="Workspace"
      tabIndex={-1}
    >
      <div className="center-toolbar">
        <div className="view-toggle" role="tablist" aria-label="Workspace view">
          <button
            type="button"
            role="tab"
            aria-selected={centerView === "map"}
            className={centerView === "map" ? "is-active" : undefined}
            onClick={() => onCenterViewChange("map")}
            title="Dependency map: how symbols connect"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <circle cx="8" cy="4" r="2" fill="currentColor" />
              <circle cx="3.5" cy="12" r="2" fill="currentColor" />
              <circle cx="12.5" cy="12" r="2" fill="currentColor" />
              <path d="M8 6 L4 10 M8 6 L12 10" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
            Map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={centerView === "source"}
            className={centerView === "source" ? "is-active" : undefined}
            onClick={() => onCenterViewChange("source")}
            disabled={!selectedNode?.file}
            title={selectedNode?.file ? `Read ${selectedNode.file}` : "Select a symbol with source to read its code"}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path d="M6 4 L2.5 8 L6 12 M10 4 L13.5 8 L10 12" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Source
          </button>
        </div>
        <div className={`center-toolbar-meta${centerView === "source" ? " is-source" : ""}`}>
          {centerView === "map" ? (
            focusedNode ? <small>{focusedNode.name} · {nodeTypeLabel(focusedNode.type)}</small> : null
          ) : selectedNode?.file ? (
            <>
              <span className="swatch" style={{ background: nodeColor(selectedNode.type) }} aria-hidden="true" />
              <strong className="source-meta-symbol">{selectedNode.name}</strong>
              <label className="source-file-picker" title="Switch to another file in this codebase">
                <span className="sr-only">Open a different file</span>
                <select
                  value={selectedNode.file}
                  onChange={(event) => {
                    const target = sourceFiles.find((entry) => entry.file === event.currentTarget.value);
                    if (target) onFocusNode(target.node.id, { preserveChat: true });
                  }}
                >
                  {sourceFiles.map((entry) => (
                    <option key={entry.file} value={entry.file}>
                      {entry.file}
                    </option>
                  ))}
                </select>
              </label>
              <small className="source-line-chip">{sourceLineText}</small>
            </>
          ) : (
            <span className="source-meta-file">No source selected</span>
          )}
        </div>
        {centerView === "map" && focusedNode ? (
          <div className="graph-toolbar-actions">
            {focusExpanded || focusExpansion.hiddenByLimit ? (
              <button
                type="button"
                onClick={onToggleExpandFocus}
                title={expandButtonTitle}
                aria-label={expandButtonTitle}
              >
                {focusExpanded ? "Collapse" : `Expand +${focusExpansion.hiddenByLimit}`}
              </button>
            ) : null}
            <button
              type="button"
              className="toggle-button"
              onClick={onToggleGraphNodeList}
              aria-pressed={showGraphNodeList}
              aria-label={showGraphNodeList ? "Hide the list of visible nodes" : "List the nodes visible on the map"}
              title={showGraphNodeList ? "Hide node list" : "List visible nodes"}
            >
              {showGraphNodeList ? "Hide list" : "Nodes"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="center-body">
        <div className="graph-canvas" hidden={centerView !== "map"}>
          <GraphView
            graph={graph}
            focusNodeId={focusNodeId}
            expandedNodeIds={expandedNodeIds}
            hiddenNodeTypes={hiddenNodeTypes}
            selectedEdge={selectedEdge}
            onSelectNode={onSelectNode}
            onSelectEdge={onSelectEdge}
            onExpandNode={onExpandNode}
            showNodeList={showGraphNodeList}
          />
        </div>
        <section
          id="code-panel"
          className="code-panel center-source-view"
          aria-label="Source code"
          tabIndex={-1}
          hidden={centerView !== "source"}
        >
            {selectedNode?.file ? (
              <SourceFileView
                node={selectedNode}
                source={source}
                loading={sourceLoading}
                error={sourceError}
                focusedCitation={focusedCitation}
              />
            ) : (
              <div className="source-empty">
                <p>No source selected. Pick a symbol from the map, the codebase tree, or search — then its code shows here.</p>
                <button type="button" onClick={() => onCenterViewChange("map")}>Back to map</button>
              </div>
            )}
        </section>
      </div>
    </section>
  );
}
