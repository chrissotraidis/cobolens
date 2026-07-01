import Graph from "graphology";
import Sigma from "sigma";
import { useEffect, useMemo, useRef } from "react";
import {
  GraphDocument,
  GraphEdge,
  GraphNode,
  edgeLabel,
  nodeColor,
  nodeLabel,
} from "../lib/graph";

type NodeAttributes = {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  forceLabel?: boolean;
  hidden?: boolean;
  synthetic?: boolean;
};

type EdgeAttributes = {
  label: string;
  color: string;
  size: number;
  sourceEdge?: GraphEdge;
};

type FocusSlice = {
  graph: Graph<NodeAttributes, EdgeAttributes>;
  visibleNodeIds: Set<string>;
  hiddenNeighborCount: number;
  syntheticNodeOwners: Map<string, string>;
  syntheticNodeIds: Set<string>;
};

type GraphViewProps = {
  graph: GraphDocument | null;
  focusNodeId: string;
  expandedNodeIds: Set<string>;
  hiddenNodeTypes: Set<string>;
  selectedEdge: GraphEdge | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
  onExpandNode: (nodeId: string) => void;
  canOpenFolder: boolean;
  onOpenFolder: () => void;
  onOpenSample: () => void;
};

const DIRECT_LIMIT_PER_TYPE = 14;
const EXPANDED_LIMIT_PER_TYPE = 6;

export function GraphView({
  graph,
  focusNodeId,
  expandedNodeIds,
  hiddenNodeTypes,
  selectedEdge,
  onSelectNode,
  onSelectEdge,
  onExpandNode,
  canOpenFolder,
  onOpenFolder,
  onOpenSample,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Sigma<NodeAttributes, EdgeAttributes> | null>(null);
  const selectedEdgeKey = selectedEdge ? edgeKey(selectedEdge) : "";

  const slice = useMemo(() => {
    if (!graph || !focusNodeId) return null;
    return buildFocusSlice(graph, focusNodeId, expandedNodeIds, hiddenNodeTypes, selectedEdgeKey);
  }, [expandedNodeIds, focusNodeId, graph, hiddenNodeTypes, selectedEdgeKey]);
  const visibleNodeControls = useMemo(() => {
    if (!slice) return [];
    return slice.graph
      .nodes()
      .map((nodeId) => {
        const attributes = slice.graph.getNodeAttributes(nodeId);
        return {
          id: nodeId,
          label: attributes.label,
          color: attributes.color,
          isFocus: nodeId === focusNodeId,
          isCluster: slice.syntheticNodeIds.has(nodeId),
        };
      })
      .sort((left, right) => {
        if (left.isFocus) return -1;
        if (right.isFocus) return 1;
        if (left.isCluster !== right.isCluster) return left.isCluster ? 1 : -1;
        return left.label.localeCompare(right.label);
      });
  }, [focusNodeId, slice]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !slice) return;

    const renderer = new Sigma(slice.graph, container, {
      allowInvalidContainer: true,
      defaultEdgeColor: "#313944",
      defaultNodeColor: "#9aa6b2",
      edgeLabelColor: { color: "#cdd5de" },
      edgeLabelSize: 11,
      enableEdgeEvents: true,
      hideEdgesOnMove: true,
      labelColor: { color: "#dbe3ea" },
      labelDensity: 0.08,
      labelGridCellSize: 96,
      labelRenderedSizeThreshold: 7,
      labelSize: 11,
      renderEdgeLabels: false,
      renderLabels: true,
      stagePadding: 68,
    });
    renderer.getCamera().setState({ ratio: 1.18 });

    renderer.on("clickNode", ({ node }) => {
      if (slice.syntheticNodeIds.has(node)) {
        const ownerId = slice.syntheticNodeOwners.get(node);
        if (ownerId === focusNodeId) onExpandNode(ownerId);
        else if (ownerId) onSelectNode(ownerId);
        return;
      }
      onSelectNode(node);
    });
    renderer.on("clickEdge", ({ edge }) => {
      const sourceEdge = slice.graph.getEdgeAttribute(edge, "sourceEdge");
      onSelectEdge(sourceEdge ?? null);
    });

    rendererRef.current = renderer;
    return () => {
      renderer.kill();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
    };
  }, [onExpandNode, onSelectEdge, onSelectNode, slice]);
  function activateVisibleNode(nodeId: string) {
    if (!slice) return;
    if (slice.syntheticNodeIds.has(nodeId)) {
      const ownerId = slice.syntheticNodeOwners.get(nodeId);
      if (ownerId === focusNodeId) onExpandNode(ownerId);
      else if (ownerId) onSelectNode(ownerId);
      return;
    }
    onSelectNode(nodeId);
  }

  if (!graph) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-card">
          <strong>Select a codebase</strong>
          <span>Start with the bundled sample or open a COBOL folder.</span>
          <div className="graph-empty-actions">
            <button type="button" className="primary-action" onClick={onOpenSample}>
              Open Sample
            </button>
            {canOpenFolder ? (
              <button type="button" onClick={onOpenFolder}>
                Open Folder
              </button>
            ) : (
              <span>Open Folder runs in the desktop app.</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!slice) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-card">
          <strong>No focus node available</strong>
          <span>Open Sample or re-scan the selected codebase.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="sigma-canvas" />
      <div className="graph-minimap" aria-label="Graph orientation">
        <span>{slice.visibleNodeIds.size} visible</span>
        <span>{graph.nodes.length} indexed</span>
        <span>{slice.hiddenNeighborCount} hidden</span>
      </div>
      <div className="graph-node-list" aria-label="Visible graph nodes">
        <span>Visible nodes</span>
        <div>
          {visibleNodeControls.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => activateVisibleNode(node.id)}
              aria-current={node.isFocus ? "true" : undefined}
              aria-label={
                node.isCluster
                  ? `Expand hidden ${node.label} neighbors`
                  : node.isFocus
                    ? `Current focus ${node.label}`
                    : `Focus ${node.label}`
              }
              title={node.isCluster ? `Expand ${node.label}` : `Focus ${node.label}`}
            >
              <i aria-hidden="true" style={{ background: node.color }} />
              <span>{node.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function buildFocusSlice(
  document: GraphDocument,
  focusNodeId: string,
  expandedNodeIds: Set<string>,
  hiddenNodeTypes: Set<string>,
  selectedEdgeKey: string,
): FocusSlice {
  const graph = new Graph<NodeAttributes, EdgeAttributes>({ type: "directed", multi: true });
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const edgeByKey = new Map(document.edges.map((edge) => [edgeKey(edge), edge]));
  const visibleNodeIds = new Set<string>();
  const visibleEdgeKeys = new Set<string>();
  const syntheticNodeIds = new Set<string>();
  const syntheticNodeOwners = new Map<string, string>();
  let hiddenNeighborCount = 0;

  const focusNode = nodeById.get(focusNodeId) ?? document.nodes[0];
  visibleNodeIds.add(focusNode.id);
  const focusEdges = incidentEdges(document.edges, focusNode.id);
  addNeighborGroups(
    focusEdges,
    focusNode.id,
    expandedNodeIds.has(focusNode.id) ? Number.MAX_SAFE_INTEGER : DIRECT_LIMIT_PER_TYPE,
  );

  for (const expandedNodeId of expandedNodeIds) {
    if (!visibleNodeIds.has(expandedNodeId)) continue;
    const expandedEdges = incidentEdges(document.edges, expandedNodeId).filter(
      (edge) => edge.from !== focusNode.id && edge.to !== focusNode.id,
    );
    addNeighborGroups(expandedEdges, expandedNodeId, EXPANDED_LIMIT_PER_TYPE);
  }

  const positionedNodes = layoutNodes(
    [...visibleNodeIds].map((id) => nodeById.get(id)).filter(Boolean) as GraphNode[],
    focusNode.id,
  );

  for (const { node, x, y } of positionedNodes) {
    graph.addNode(node.id, {
      x,
      y,
      size: node.id === focusNode.id ? 16 : 9,
      label: nodeLabel(node),
      color: nodeColor(node.type),
      forceLabel: node.id === focusNode.id,
    });
  }

  let syntheticIndex = 0;
  for (const edgeKeyValue of visibleEdgeKeys) {
    const edge = edgeByKey.get(edgeKeyValue);
    if (!edge || !visibleNodeIds.has(edge.from) || !visibleNodeIds.has(edge.to)) continue;
    addGraphEdge(graph, edge, document, selectedEdgeKey);
  }

  function addNeighborGroups(edges: GraphEdge[], ownerId: string, limitPerType: number) {
    const byType = new Map<string, Array<{ edge: GraphEdge; neighborId: string }>>();
    for (const edge of edges) {
      const neighborId = edge.from === ownerId ? edge.to : edge.from;
      const neighbor = nodeById.get(neighborId);
      if (!neighbor) continue;
      if (hiddenNodeTypes.has(neighbor.type)) {
        hiddenNeighborCount += 1;
        continue;
      }
      const bucket = byType.get(neighbor.type) ?? [];
      bucket.push({ edge, neighborId });
      byType.set(neighbor.type, bucket);
    }

    for (const [type, items] of byType) {
      const sorted = items.sort((left, right) => {
        const leftNode = nodeById.get(left.neighborId);
        const rightNode = nodeById.get(right.neighborId);
        return (leftNode?.name ?? left.neighborId).localeCompare(rightNode?.name ?? right.neighborId);
      });
      const visible = sorted.slice(0, limitPerType);
      const hidden = sorted.slice(limitPerType);
      for (const item of visible) {
        visibleNodeIds.add(item.neighborId);
        visibleEdgeKeys.add(edgeKey(item.edge));
      }
      if (hidden.length > 0) {
        hiddenNeighborCount += hidden.length;
        const clusterId = `cluster:${ownerId}:${type}:${syntheticIndex++}`;
        syntheticNodeIds.add(clusterId);
        syntheticNodeOwners.set(clusterId, ownerId);
        visibleNodeIds.add(clusterId);
        nodeById.set(clusterId, {
          id: clusterId,
          type: "cluster",
          name: `+${hidden.length} ${type}`,
        });
        const syntheticEdge: GraphEdge = {
          from: ownerId,
          to: clusterId,
          type: "CLUSTER",
        };
        const syntheticKey = edgeKey(syntheticEdge);
        edgeByKey.set(syntheticKey, syntheticEdge);
        visibleEdgeKeys.add(syntheticKey);
      }
    }
  }

  return {
    graph,
    hiddenNeighborCount,
    syntheticNodeOwners,
    syntheticNodeIds,
    visibleNodeIds,
  };
}

function layoutNodes(nodes: GraphNode[], focusNodeId: string) {
  const focus = nodes.find((node) => node.id === focusNodeId) ?? nodes[0];
  const neighbors = nodes.filter((node) => node.id !== focus.id);
  const radius = Math.max(4.5, Math.min(9.5, neighbors.length * 0.34));
  return [
    { node: focus, x: 0, y: 0 },
    ...neighbors.map((node, index) => {
      const angle = (index / Math.max(1, neighbors.length)) * Math.PI * 2;
      const ring = index % 2 === 0 ? radius : radius * 0.72;
      return {
        node,
        x: Math.cos(angle) * ring,
        y: Math.sin(angle) * ring,
      };
    }),
  ];
}

function incidentEdges(edges: GraphEdge[], nodeId: string) {
  return edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

function addGraphEdge(
  graph: Graph<NodeAttributes, EdgeAttributes>,
  edge: GraphEdge,
  document: GraphDocument,
  selectedEdgeKey: string,
) {
  const key = edgeKey(edge);
  graph.addDirectedEdgeWithKey(key, edge.from, edge.to, {
    color: key === selectedEdgeKey ? "#f2d06b" : edgeColor(edge.type),
    label: edgeLabel(edge, document),
    size: key === selectedEdgeKey ? 3 : 1.4,
    sourceEdge: edge,
  });
}

function edgeColor(type: string) {
  if (type === "CALLS") return "#66c2a5";
  if (type === "PERFORMS") return "#5aa7d6";
  if (type === "COPIES") return "#fc8d62";
  if (type === "RUNS" || type === "RUNS-AFTER") return "#e5c75f";
  return "#48525f";
}

function edgeKey(edge: GraphEdge) {
  return [
    edge.from,
    edge.to,
    edge.type,
    edge.site?.file ?? "",
    edge.site?.line ?? "",
  ].join("|");
}
