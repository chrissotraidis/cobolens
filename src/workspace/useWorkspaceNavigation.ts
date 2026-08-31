import { useState, type Dispatch, type SetStateAction } from "react";
import type { GraphDocument, GraphEdge } from "../lib/graph";
import { edgeLabel } from "../lib/graph";
import { firstFocusableNode } from "../lib/graphSelectors";
import type { Citation } from "../retrieval/context";
import { resolveCitationTarget } from "../source/citationFocus";
import type { CenterView, SourceFocus } from "./WorkspacePane";

type FocusOptions = { preserveChat?: boolean; preserveExpansion?: boolean };

export function useWorkspaceNavigation({
  graph,
  nodeById,
  clearGraphExpansion,
  preserveInspectorTabForNextEdge,
  onStandardFocusReset,
  onHomeReset,
  onSetInspectorImpact,
  setFocusNodeId,
  setSelectedNodeId,
  setSelectedEdge,
  setSourceFocus,
}: {
  graph: GraphDocument | null;
  nodeById: Map<string, GraphDocument["nodes"][number]>;
  clearGraphExpansion: () => void;
  preserveInspectorTabForNextEdge: () => void;
  onStandardFocusReset: () => void;
  onHomeReset: () => void;
  onSetInspectorImpact: () => void;
  setFocusNodeId: Dispatch<SetStateAction<string>>;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setSelectedEdge: Dispatch<SetStateAction<GraphEdge | null>>;
  setSourceFocus: Dispatch<SetStateAction<SourceFocus | null>>;
}) {
  const [centerView, setCenterView] = useState<CenterView>("map");

  function showCenterView(view: CenterView) {
    setCenterView(view);
    // At stacked breakpoints the shell is the page scroll surface. Returning
    // to Map or Source must also return that surface to the canvas toolbar;
    // otherwise keyboard focus can leave the user halfway down another pane.
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".shell")?.scrollTo({ top: 0 }));
  }

  function focusOnNode(nodeId: string, options: FocusOptions = {}) {
    if (!nodeById.has(nodeId)) return;
    setFocusNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setSelectedEdge(null);
    setSourceFocus(null);
    if (!options.preserveExpansion) clearGraphExpansion();
    // Standard focus changes should make Chat feel fresh for the new selection.
    // Ask-driven sync preserves the just-created answer and graph context.
    if (!options.preserveChat) onStandardFocusReset();
  }

  function syncAskFocusNode(nodeId: string) {
    focusOnNode(nodeId, { preserveChat: true, preserveExpansion: true });
  }

  function goHome(clearSearch: () => void) {
    if (!graph) return;
    const homeNodeId = firstFocusableNode(graph);
    if (!homeNodeId) return;
    setFocusNodeId(homeNodeId);
    setSelectedNodeId(homeNodeId);
    setSelectedEdge(null);
    setSourceFocus(null);
    clearGraphExpansion();
    clearSearch();
    onHomeReset();
    showCenterView("map");
  }

  function focusOnMapNode(nodeId: string) {
    focusOnNode(nodeId);
    showCenterView("map");
  }

  function readNodeSource(nodeId: string, options: FocusOptions = {}) {
    focusOnNode(nodeId, options);
    if (nodeById.get(nodeId)?.file) {
      showCenterView("source");
      window.requestAnimationFrame(() => document.getElementById("code-panel")?.focus({ preventScroll: true }));
    }
  }

  function selectNode(nodeId: string) {
    focusOnNode(nodeId);
  }

  function selectEdge(edge: GraphEdge | null) {
    if (!edge) {
      setSelectedEdge(null);
      return;
    }
    setSelectedEdge(edge);
    if (edge.site && graph) {
      jumpToCitation({
        file: edge.site.file,
        line: edge.site.line,
        label: edgeLabel(edge, graph),
        nodeId: edge.from,
      }, true);
    }
  }

  function showSourcePanel() {
    showCenterView("source");
    window.requestAnimationFrame(() => document.getElementById("code-panel")?.focus({ preventScroll: true }));
  }

  function openRelationshipEdge(edge: GraphEdge) {
    if (!edge.site || !graph) return;
    setSelectedEdge(edge);
    jumpToCitation({
      file: edge.site.file,
      line: edge.site.line,
      label: edgeLabel(edge, graph),
      nodeId: edge.from,
    }, true);
  }

  function jumpToCitation(citation: Citation, keepEdge = false, preserveInspectorTab = false) {
    const { edge: citedEdge, node: citedNode } = resolveCitationTarget({ graph, nodeById, citation });

    if (citedNode) {
      setFocusNodeId(citedNode.id);
      setSelectedNodeId(citedNode.id);
    }
    if (citedEdge) {
      if (preserveInspectorTab) preserveInspectorTabForNextEdge();
      setSelectedEdge(citedEdge);
      if (!preserveInspectorTab) onSetInspectorImpact();
    } else if (!keepEdge) {
      setSelectedEdge(null);
    }
    setSourceFocus({ file: citation.file, line: citation.line, nodeId: citedNode?.id });
    // Evidence -> code is the core trust interaction: bring Source forward in the
    // center workspace so the cited line is visible immediately, then move
    // keyboard focus to the reader.
    showCenterView("source");
    window.requestAnimationFrame(() => document.getElementById("code-panel")?.focus({ preventScroll: true }));
  }

  function openAskCitation(citation: Citation) {
    jumpToCitation(citation, false, true);
  }

  return {
    centerView,
    setCenterView: showCenterView,
    focusOnNode,
    focusOnMapNode,
    syncAskFocusNode,
    goHome,
    readNodeSource,
    selectNode,
    selectEdge,
    showSourcePanel,
    openRelationshipEdge,
    jumpToCitation,
    openAskCitation,
  };
}
