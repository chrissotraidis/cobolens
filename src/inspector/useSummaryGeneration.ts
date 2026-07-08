import { useMemo, useRef, useState } from "react";
import type { GraphDocument, GraphNode, SourceExcerpt } from "../lib/graph";
import type { ModelSettings } from "../model/config";
import { friendlyModelError, isStoppedModelCall, runStreamingModelCall } from "../model/modelRuntime";
import { generateUnitSummary, type UnitSummary } from "../model/summaries";
import { bulkSummaryProgressLabel } from "./summaryProgress";
import { estimateBulkSummaryTokens, summaryGenerationNodes } from "./summaryPlanning";
import { graphBackedSummaryFallback, selectedNodeGraphAnswer } from "./summaryGraph";
import type { SummaryState } from "./SummaryDock";
import type { InspectorTab } from "./InspectorTabs";

type SummaryGenerationResult = "ready" | "fallback" | "stopped";
type FocusNode = (nodeId: string, options?: { preserveChat?: boolean; preserveExpansion?: boolean }) => void;

export function useSummaryGeneration({
  graph,
  selectedNode,
  modelSettings,
  readExcerptForNode,
  prepareModelCall,
  onModelCallComplete,
  onTabChange,
  onFocusNode,
}: {
  graph: GraphDocument | null;
  selectedNode: GraphNode | null;
  modelSettings: ModelSettings;
  readExcerptForNode: (node: GraphNode) => Promise<SourceExcerpt>;
  prepareModelCall: () => Promise<string | undefined>;
  onModelCallComplete: () => void;
  onTabChange: (tab: InspectorTab) => void;
  onFocusNode: FocusNode;
}) {
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
  const [bulkSummaryStatus, setBulkSummaryStatus] = useState("");
  const activeSummaryAbortRef = useRef<AbortController | null>(null);

  const summaryNodes = useMemo(() => summaryGenerationNodes(graph), [graph]);
  const bulkTokenEstimate = useMemo(() => estimateBulkSummaryTokens(summaryNodes), [summaryNodes]);
  const selectedSummaryState = selectedNode ? summaries[selectedNode.id] : undefined;

  async function generateSelectedSummary() {
    if (!graph || !selectedNode) return;
    onTabChange("summary");
    await generateSummaryForNode(selectedNode);
  }

  async function generateAllSummaries() {
    if (!graph || !summaryNodes.length) return;
    onTabChange("summary");
    setBulkSummaryStatus(`0/${summaryNodes.length}`);
    let fallbackCount = 0;
    for (let index = 0; index < summaryNodes.length; index += 1) {
      const generated = await generateSummaryForNode(summaryNodes[index]);
      if (generated === "stopped") {
        setBulkSummaryStatus(`Stopped at ${index}/${summaryNodes.length}`);
        return;
      }
      if (generated === "fallback") fallbackCount += 1;
      setBulkSummaryStatus(bulkSummaryProgressLabel(index + 1, summaryNodes.length, fallbackCount));
    }
  }

  async function generateSummaryForNode(node: GraphNode): Promise<SummaryGenerationResult> {
    if (!graph || !node.file) return "stopped";
    setSummaries((current) => ({
      ...current,
      [node.id]: { status: "running", draftText: "" },
    }));

    try {
      const excerpt = await readExcerptForNode(node);
      const apiKey = await prepareModelCall();
      const summary = await runStreamingModelCall("Summary generation", activeSummaryAbortRef, (abortSignal, noteFirstToken) =>
        generateUnitSummary({
          graph,
          node,
          excerpt,
          settings: modelSettings,
          apiKey,
          abortSignal,
          onFirstToken: noteFirstToken,
          onTextDelta: (draftText) => {
            setSummaries((current) => ({
              ...current,
              [node.id]: { status: "running", draftText },
            }));
          },
        }),
      );
      onModelCallComplete();
      const displayedSummary = summary.guarded
        ? graphBackedSummaryFallback(
            graph,
            node,
            summary,
            `model summary had ${summary.guardReason ?? "citation issues"}`,
          )
        : summary;
      setSummaries((current) => ({
        ...current,
        [node.id]: { status: "ready", summary: displayedSummary },
      }));
      return displayedSummary.guarded ? "fallback" : "ready";
    } catch (err) {
      const fallbackReason = friendlyModelError(err, modelSettings);
      if (isStoppedModelCall(fallbackReason)) {
        setSummaries((current) => ({
          ...current,
          [node.id]: { status: "error", error: fallbackReason },
        }));
        return "stopped";
      }
      const fallbackSummary = graphBackedSummaryFallback(
        graph,
        node,
        {
          nodeId: node.id,
          text: "",
          provider: modelSettings.provider,
          model: modelSettings.model,
        },
        fallbackReason,
      );
      setSummaries((current) => ({
        ...current,
        [node.id]: { status: "ready", summary: fallbackSummary },
      }));
      return "fallback";
    }
  }

  function resetSummaries() {
    setSummaries({});
    setBulkSummaryStatus("");
  }

  function storeSummary(nodeId: string, summary: SummaryState["summary"]) {
    if (!summary) return;
    setSummaries((current) => ({
      ...current,
      [nodeId]: { status: "ready", summary },
    }));
  }

  function explainSelectedNode() {
    if (!selectedNode || !graph) return;
    const graphExplanation = selectedNodeGraphAnswer(selectedNode, graph);
    const summary: UnitSummary = {
      nodeId: selectedNode.id,
      text: graphExplanation.text,
      provider: "graph",
      model: "deterministic",
      guarded: true,
      guardReason: "answered from graph facts without a model",
    };
    storeSummary(selectedNode.id, summary);
    onFocusNode(selectedNode.id, { preserveChat: true });
    onTabChange("summary");
  }

  function cancelSummary() {
    activeSummaryAbortRef.current?.abort();
  }

  return {
    summaries,
    selectedSummaryState,
    summaryNodes,
    bulkTokenEstimate,
    bulkSummaryStatus,
    resetSummaries,
    explainSelectedNode,
    generateSelectedSummary,
    generateAllSummaries,
    cancelSummary,
  };
}
