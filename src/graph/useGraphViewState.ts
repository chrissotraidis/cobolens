import { useCallback, useMemo, useState } from "react";
import type { GraphDocument } from "../lib/graph";
import { graphExpansionState } from "../lib/graphSelectors";

export function useGraphViewState({
  graph,
  focusNodeId,
}: {
  graph: GraphDocument | null;
  focusNodeId: string;
}) {
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(() => new Set());
  const [showGraphNodeList, setShowGraphNodeList] = useState(false);

  const focusExpansion = useMemo(
    () => graphExpansionState(graph, focusNodeId, hiddenNodeTypes),
    [focusNodeId, graph, hiddenNodeTypes],
  );
  const focusExpanded = Boolean(focusNodeId && expandedNodeIds.has(focusNodeId));
  const expandButtonTitle = focusExpanded
    ? "Collapse the expanded neighbors"
    : `Show ${focusExpansion.hiddenByLimit} more direct neighbor${focusExpansion.hiddenByLimit === 1 ? "" : "s"} of this symbol`;

  const clearGraphExpansion = useCallback(() => {
    setExpandedNodeIds(new Set());
  }, []);

  const resetGraphViewState = useCallback(() => {
    setExpandedNodeIds(new Set());
    setHiddenNodeTypes(new Set());
    setShowGraphNodeList(false);
  }, []);

  const toggleExpandedNode = useCallback((nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const toggleExpandFocus = useCallback(() => {
    if (!focusNodeId) return;
    toggleExpandedNode(focusNodeId);
  }, [focusNodeId, toggleExpandedNode]);

  const expandNode = useCallback((nodeId: string) => {
    setExpandedNodeIds((current) => {
      if (current.has(nodeId)) return current;
      const next = new Set(current);
      next.add(nodeId);
      return next;
    });
  }, []);

  const toggleNodeTypeFilter = useCallback((type: string) => {
    setHiddenNodeTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const resetNodeTypeFilters = useCallback(() => {
    setHiddenNodeTypes(new Set());
  }, []);

  const toggleGraphNodeList = useCallback(() => {
    setShowGraphNodeList((visible) => !visible);
  }, []);

  return {
    expandedNodeIds,
    hiddenNodeTypes,
    showGraphNodeList,
    focusExpansion,
    focusExpanded,
    expandButtonTitle,
    clearGraphExpansion,
    resetGraphViewState,
    toggleExpandFocus,
    expandNode,
    toggleNodeTypeFilter,
    resetNodeTypeFilters,
    toggleGraphNodeList,
  };
}
