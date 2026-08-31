import { useMemo } from "react";
import type { GraphDocument, GraphEdge, GraphNode } from "../lib/graph";
import { edgeLabel, nodeColor } from "../lib/graph";
import { nodeTypeLabel } from "../lib/graphLabels";
import { graphIndex, incomingEdges, outgoingEdges } from "../lib/graphIndex";

export function LineageImpactPanel({
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
    const index = graphIndex(graph);
    const incoming = incomingEdges(index, node.id);
    const outgoing = outgoingEdges(index, node.id);
    return {
      dependents: incoming,
      dependencies: outgoing,
    };
  }, [graph, node]);

  if (!node || !graph || !relationships) {
    return (
      <section className="lineage-card">
        <div className="relationship-title">Depends on / Used by</div>
        <p>Select a codebase item to inspect dependencies and recorded data flow.</p>
      </section>
    );
  }

  return (
    <section className="lineage-card">
      <div className="relationship-title">Dependencies</div>
      <div className="lineage-focus">
        <span className="swatch" style={{ background: nodeColor(node.type) }} />
        <strong>{node.name}</strong>
        <small>{nodeTypeLabel(node.type)}</small>
      </div>
      <p className="relationship-help">
        How {node.name} connects. Click a symbol to focus it on the map; click a <code>file:line</code> to open the code.
      </p>
      <RelationshipList
        title={node.type === "data-item" ? "Flows to" : "Uses / calls / reads"}
        empty="Nothing outgoing recorded."
        edges={relationships.dependencies}
        graph={graph}
        selectedNodeId={node.id}
        direction="out"
        onFocusNode={onFocusNode}
        onOpenEdge={onOpenEdge}
      />
      <RelationshipList
        title={node.type === "data-item" ? "Defined / used by" : "Used by"}
        empty="Nothing points back at this yet."
        edges={relationships.dependents}
        graph={graph}
        selectedNodeId={node.id}
        direction="in"
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
  const nodes = useMemo(() => graphIndex(graph).nodeById, [graph]);

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
                  <span>
                    <strong>{related?.name ?? relatedId}</strong>
                    <small>{nodeTypeLabel(related?.type ?? "")}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="lineage-edge"
                  aria-label={`${title}: show ${edgeLabel(edge, graph)}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : ""}`}
                  onClick={() => onOpenEdge(edge)}
                  disabled={!edge.site}
                  title={edge.site ? `Show cited relationship at ${edge.site.file}:${edge.site.line}` : "No source location recorded"}
                >
                  <span>{edge.type}</span>
                  <small>{edge.site ? `${edge.site.file}:${edge.site.line}` : "No source site"}</small>
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

export function RelationshipDetails({
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
    const index = graphIndex(graph);
    const incoming = incomingEdges(index, node.id);
    const outgoing = outgoingEdges(index, node.id);
    return { incoming, outgoing };
  }, [graph, node]);

  return (
    <section className="relationship-card">
      <div className="relationship-title">{selectedEdge ? "Relationship" : "Relationships"}</div>
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

function EdgeExplanation({
  edge,
  graph,
  onFocusNode,
}: {
  edge: GraphEdge;
  graph: GraphDocument;
  onFocusNode: (nodeId: string) => void;
}) {
  const nodes = graphIndex(graph).nodeById;
  const fromNode = nodes.get(edge.from);
  const toNode = nodes.get(edge.to);
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

function nodeLocationLabel(node: GraphNode) {
  if (!node.file) return "external";
  const start = node.lines?.[0] ?? 1;
  const end = node.lines?.[1];
  return end && end !== start ? `${node.file}:${start}-${end}` : `${node.file}:${start}`;
}
