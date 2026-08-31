import type { GraphDocument, GraphEdge, GraphNode } from "./graph";

export type GraphIndex = {
  nodeById: Map<string, GraphNode>;
  incomingByNodeId: Map<string, GraphEdge[]>;
  outgoingByNodeId: Map<string, GraphEdge[]>;
  incidentByNodeId: Map<string, GraphEdge[]>;
  edgeByKey: Map<string, GraphEdge>;
};

const graphIndexCache = new WeakMap<GraphDocument, GraphIndex>();
const EMPTY_EDGES: GraphEdge[] = [];

export function graphIndex(graph: GraphDocument): GraphIndex {
  const cached = graphIndexCache.get(graph);
  if (cached) return cached;

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingByNodeId = new Map<string, GraphEdge[]>();
  const outgoingByNodeId = new Map<string, GraphEdge[]>();
  const incidentByNodeId = new Map<string, GraphEdge[]>();
  const edgeByKey = new Map<string, GraphEdge>();

  for (const edge of graph.edges) {
    pushEdge(outgoingByNodeId, edge.from, edge);
    pushEdge(incomingByNodeId, edge.to, edge);
    pushEdge(incidentByNodeId, edge.from, edge);
    if (edge.to !== edge.from) pushEdge(incidentByNodeId, edge.to, edge);
    edgeByKey.set(graphEdgeKey(edge), edge);
  }

  const index = {
    nodeById,
    incomingByNodeId,
    outgoingByNodeId,
    incidentByNodeId,
    edgeByKey,
  };
  graphIndexCache.set(graph, index);
  return index;
}

export function incomingEdges(index: GraphIndex, nodeId: string) {
  return index.incomingByNodeId.get(nodeId) ?? EMPTY_EDGES;
}

export function outgoingEdges(index: GraphIndex, nodeId: string) {
  return index.outgoingByNodeId.get(nodeId) ?? EMPTY_EDGES;
}

export function incidentEdges(index: GraphIndex, nodeId: string) {
  return index.incidentByNodeId.get(nodeId) ?? EMPTY_EDGES;
}

export function graphEdgeKey(edge: GraphEdge) {
  return [
    edge.from,
    edge.to,
    edge.type,
    edge.site?.file ?? "",
    edge.site?.line ?? "",
  ].join("|");
}

function pushEdge(index: Map<string, GraphEdge[]>, nodeId: string, edge: GraphEdge) {
  const edges = index.get(nodeId);
  if (edges) edges.push(edge);
  else index.set(nodeId, [edge]);
}
