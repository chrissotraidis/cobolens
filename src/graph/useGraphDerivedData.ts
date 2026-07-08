import { useMemo } from "react";
import type { GraphDocument } from "../lib/graph";
import { nodeTypeLabel } from "../lib/graphLabels";
import {
  codebaseInventoryCounts,
  graphHintSourceUnits,
  sourceFilesForGraph,
  sourceTreeGroups,
} from "../lib/graphSelectors";

export function useGraphDerivedData({
  graph,
  focusNodeId,
  selectedNodeId,
}: {
  graph: GraphDocument | null;
  focusNodeId: string;
  selectedNodeId: string;
}) {
  const nodeById = useMemo(() => new Map(graph?.nodes.map((node) => [node.id, node]) ?? []), [graph]);
  const focusedNode = nodeById.get(focusNodeId) ?? null;
  const selectedNode = nodeById.get(selectedNodeId) ?? focusedNode;
  const focusedNodeTypeLabel = focusedNode ? nodeTypeLabel(focusedNode.type) : "";
  const counts = useMemo(() => codebaseInventoryCounts(graph), [graph]);
  const codebaseGroups = useMemo(() => sourceTreeGroups(graph), [graph]);
  const sourceFiles = useMemo(() => sourceFilesForGraph(graph), [graph]);
  const unreferencedSourceUnits = useMemo(() => graphHintSourceUnits(graph), [graph]);

  return {
    nodeById,
    focusedNode,
    focusedNodeTypeLabel,
    selectedNode,
    counts,
    codebaseGroups,
    sourceFiles,
    unreferencedSourceUnits,
  };
}
