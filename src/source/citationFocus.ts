import type { GraphDocument, GraphEdge, GraphNode } from "../lib/graph";
import { edgeLabel } from "../lib/graph";
import type { Citation } from "../retrieval/context";

export function resolveCitationTarget({
  graph,
  nodeById,
  citation,
}: {
  graph: GraphDocument | null;
  nodeById: Map<string, GraphNode>;
  citation: Citation;
}): { edge: GraphEdge | undefined; node: GraphNode | undefined } {
  const edge = graph?.edges.find(
    (edge) =>
      edge.site?.file === citation.file &&
      edge.site.line === citation.line &&
      edgeLabel(edge, graph) === citation.label,
  );
  const node =
    (citation.nodeId ? nodeById.get(citation.nodeId) : undefined) ??
    (edge ? nodeById.get(edge.from) : undefined) ??
    graph?.nodes.find(
      (candidate) =>
        candidate.file === citation.file &&
        (candidate.lines?.[0] ?? 1) <= citation.line &&
        (candidate.lines?.[1] ?? Number.MAX_SAFE_INTEGER) >= citation.line,
    );

  return { edge, node };
}
