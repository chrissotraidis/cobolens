import type { Citation } from "../retrieval/context";
import type { GraphDocument, GraphNode } from "../lib/graph";
import { nodeColor } from "../lib/graph";
import { nodeTypeLabel } from "../lib/graphLabels";
import type { SourceTreeGroup } from "../lib/graphSelectors";
import { useEffect, useState, type ReactNode } from "react";

const SOURCE_TREE_PREVIEW_LIMIT = 12;

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function NavigatorDetails({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="pane-block navigator-details" open={defaultOpen || undefined}>
      <summary>
        <span>{title}</span>
        {badge ? <small>{badge}</small> : null}
      </summary>
      <div className="navigator-details-body">{children}</div>
    </details>
  );
}

export function ParseHealth({
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
    <NavigatorDetails
      title="Parse Health"
      badge={graph ? (parseErrors.length ? `${parseErrors.length} warnings` : `${parsed}/${total}`) : "No graph"}
    >
      <div className="parse-health">
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
      </div>
    </NavigatorDetails>
  );
}

export function GraphHints({
  graph,
  unreferencedSourceUnits,
  onFocusNode,
}: {
  graph: GraphDocument | null;
  unreferencedSourceUnits: GraphNode[];
  onFocusNode: (nodeId: string) => void;
}) {
  return (
    <NavigatorDetails
      title="Graph Hints"
      badge={graph ? `${unreferencedSourceUnits.length}` : "No graph"}
    >
      <div className="graph-hints" aria-label="Graph hints">
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
      </div>
    </NavigatorDetails>
  );
}

export function SourceTree({
  groups,
  selectedNodeId,
  onSelectNode,
}: {
  groups: SourceTreeGroup[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const totalNodes = groups.reduce((total, group) => total + group.nodes.length, 0);
  const selectedGroupTitle = groups.find((group) => group.nodes.some((node) => node.id === selectedNodeId))?.title;
  const [openGroupTitle, setOpenGroupTitle] = useState(groups[0]?.title ?? "");

  useEffect(() => {
    if (selectedGroupTitle) setOpenGroupTitle(selectedGroupTitle);
  }, [selectedGroupTitle]);

  return (
    <section className="pane-block source-tree" aria-label="Codebase browser">
      <div className="pane-heading-row">
        <h2>Codebase</h2>
        {totalNodes ? <span className="source-tree-total">{totalNodes}</span> : null}
      </div>
      {groups.length ? (
        groups.map((group) => (
          <SourceTreeGroupPanel
            key={group.title}
            group={group}
            open={openGroupTitle === group.title}
            onToggle={() => setOpenGroupTitle((current) => current === group.title ? "" : group.title)}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        ))
      ) : (
        <div className="empty-copy">Open a folder or sample to browse programs, copybooks, and JCL.</div>
      )}
    </section>
  );
}

function SourceTreeGroupPanel({
  group,
  open,
  onToggle,
  selectedNodeId,
  onSelectNode,
}: {
  group: SourceTreeGroup;
  open: boolean;
  onToggle: () => void;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const selectedNode = group.nodes.find((node) => node.id === selectedNodeId);

  const previewNodes = showAll ? group.nodes : group.nodes.slice(0, SOURCE_TREE_PREVIEW_LIMIT);
  const visibleNodes = selectedNode && !previewNodes.some((node) => node.id === selectedNode.id)
    ? [...previewNodes, selectedNode]
    : previewNodes;
  const remainingCount = Math.max(0, group.nodes.length - visibleNodes.length);

  return (
    <div className="source-tree-group">
      <button
        type="button"
        className="source-tree-group-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{group.title}</span>
        <strong>{group.nodes.length}</strong>
        <small>{open ? "Hide" : "Show"}</small>
      </button>
      {open ? (
        <div className="source-tree-list">
          {visibleNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={node.id === selectedNodeId ? "is-active" : undefined}
              onClick={() => onSelectNode(node.id)}
              title={`Focus ${node.name} (${nodeTypeLabel(node.type)})${node.file ? ` — ${node.file}` : ""}`}
              aria-label={`Focus ${node.name}, ${nodeTypeLabel(node.type)}`}
            >
              <span className="swatch" style={{ background: nodeColor(node.type) }} />
              <span>{node.name}</span>
              <small>{node.file ?? "external"}</small>
            </button>
          ))}
          {remainingCount ? (
            <button type="button" className="source-tree-more" onClick={() => setShowAll(true)}>
              Show {remainingCount} more {group.title.toLowerCase()}
            </button>
          ) : showAll && group.nodes.length > SOURCE_TREE_PREVIEW_LIMIT ? (
            <button type="button" className="source-tree-more" onClick={() => setShowAll(false)}>
              Show fewer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LegendItem({
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

function parseErrorSite(parseError: { file: string; line?: number }) {
  return parseError.line ? `${parseError.file}:${parseError.line}` : parseError.file;
}
