import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphEdge } from "../lib/graph";
import type { ChatStatus } from "./ChatAnswerPanel";
import type { InspectorTab } from "./InspectorTabs";

export function useInspectorTabState() {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("summary");
  const showInspectorImpact = useCallback(() => setInspectorTab("impact"), []);

  return {
    inspectorTab,
    setInspectorTab,
    showInspectorImpact,
  };
}

export function useInspectorRouting({
  selectedNodeId,
  selectedEdge,
  chatStatus,
  chatAnswerQuestion,
  onTabChange,
}: {
  selectedNodeId: string;
  selectedEdge: GraphEdge | null;
  chatStatus: ChatStatus;
  chatAnswerQuestion?: string;
  onTabChange: (tab: InspectorTab) => void;
}) {
  const inspectorBodyRef = useRef<HTMLDivElement | null>(null);
  const preserveInspectorForEdgeRef = useRef(false);

  useEffect(() => {
    inspectorBodyRef.current?.scrollTo({ top: 0 });
  }, [selectedNodeId]);

  useEffect(() => {
    if (chatStatus === "ready" || chatStatus === "error") {
      onTabChange("ask");
      inspectorBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [chatAnswerQuestion, chatStatus, onTabChange]);

  useEffect(() => {
    if (selectedEdge) {
      if (preserveInspectorForEdgeRef.current) {
        preserveInspectorForEdgeRef.current = false;
        return;
      }
      onTabChange("impact");
    }
  }, [onTabChange, selectedEdge]);

  const preserveInspectorTabForNextEdge = useCallback(() => {
    preserveInspectorForEdgeRef.current = true;
  }, []);

  return {
    inspectorBodyRef,
    preserveInspectorTabForNextEdge,
  };
}
