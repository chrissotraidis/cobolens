import type { Citation } from "../retrieval/context";
import type { GraphDocument, GraphNode } from "../lib/graph";
import { nodeColor } from "../lib/graph";
import { nodeTypeLabel } from "../lib/graphLabels";
import type { SourceTreeGroup } from "../lib/graphSelectors";
import type { ReactNode } from "react";

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
      badge={graph ? `${parsed}/${total}` : "No graph"}
      defaultOpen={parseErrors.length > 0}
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
      defaultOpen={unreferencedSourceUnits.length > 0}
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

  return (
    <section className="pane-block source-tree" aria-label="Codebase browser">
      <div className="pane-heading-row">
        <h2>Codebase</h2>
        {totalNodes ? <span className="source-tree-total">{totalNodes}</span> : null}
      </div>
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
                  title={`Focus ${node.name} (${nodeTypeLabel(node.type)})${node.file ? ` — ${node.file}` : ""}`}
                  aria-label={`Focus ${node.name}, ${nodeTypeLabel(node.type)}`}
                >
                  <span className="swatch" style={{ background: nodeColor(node.type) }} />
                  <span>{node.name}</span>
                  <small>{node.file ?? "external"}</small>
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="empty-copy">Open a folder or sample to browse programs, copybooks, and JCL.</div>
      )}
    </section>
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
