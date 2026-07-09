import { useMemo } from "react";
import type { GraphDocument, GraphNode } from "../lib/graph";
import { PROVIDER_LABELS, type ModelSettings } from "../model/config";
import type { UnitSummary } from "../model/summaries";
import type { Citation } from "../retrieval/context";
import { aiProgressDetail, useElapsedSeconds } from "./aiProgress";
import { EvidenceList, MessageText, ProgressNote } from "./MessageParts";
import { nodeGraphOverview, summaryEvidenceCitations } from "./summaryGraph";
import type { ModelReadiness } from "../settings/SettingsDialog";

export type SummaryStatus = "idle" | "running" | "ready" | "error";
export type SummaryState = {
  status: SummaryStatus;
  summary?: UnitSummary;
  draftText?: string;
  error?: string;
};

export function SummaryDock({
  node,
  graph,
  state,
  settings,
  modelReadiness,
  summaryUnitCount,
  bulkStatus,
  aiConfigured,
  onGenerateSelected,
  onGenerateAll,
  onCancelSummary,
  onExplainNode,
  onAskFollowUp,
  onOpenSettings,
  onViewSource,
  onOpenCitation,
}: {
  node: GraphNode | null;
  graph: GraphDocument | null;
  state?: SummaryState;
  settings: ModelSettings;
  modelReadiness: ModelReadiness;
  summaryUnitCount: number;
  bulkStatus: string;
  aiConfigured: boolean;
  onGenerateSelected: () => void;
  onGenerateAll: () => void;
  onCancelSummary: () => void;
  onExplainNode: () => void;
  onAskFollowUp: () => void;
  onOpenSettings: () => void;
  onViewSource: () => void;
  onOpenCitation: (citation: Citation) => void;
}) {
  const elapsedSeconds = useElapsedSeconds(state?.status === "running");
  const evidence = useMemo(() => (node && graph ? summaryEvidenceCitations(node, graph) : []), [graph, node]);
  const generating = state?.status === "running";
  const hasStoredSummary = state?.status === "ready" && Boolean(state.summary);
  const providerLabel = PROVIDER_LABELS[settings.provider];
  const aiCanRun = aiConfigured;
  const aiReady = aiConfigured && modelReadiness.status === "ready";
  const aiChecking = modelReadiness.status === "checking";
  const aiSummaryLabel = generating ? `Stop ${providerLabel}` : state?.summary ? `Regenerate with ${providerLabel}` : `Generate with ${providerLabel}`;
  const aiStatusText = aiReady
    ? `${providerLabel} ready`
    : aiChecking
      ? `Checking ${providerLabel}`
      : modelReadiness.status === "error"
        ? `${providerLabel} offline`
        : aiConfigured
          ? `${providerLabel} will check on run`
          : `${providerLabel} not set up`;
  const showFallbackNotice = state?.status === "ready" && state.summary?.guarded && state.summary.provider !== "graph";

  return (
    <section className="summary-card">
      <div className="summary-actions">
        <div className="summary-action-header">
          <strong>Overview</strong>
          <span>{node ? "Graph facts first. Use Chat for follow-up questions." : "Select a codebase item to inspect it."}</span>
        </div>
        <div className="summary-action-buttons">
          <button
            type="button"
            className={hasStoredSummary ? "" : "summary-primary-action"}
            onClick={onExplainNode}
            disabled={!node}
            title={node ? "Show the deterministic graph overview" : "Select a symbol to summarize it"}
          >
            Graph overview
          </button>
          <button
            type="button"
            onClick={onViewSource}
            disabled={!node?.file}
            title={node?.file ? "Open the source tab and focus the source viewer" : "Select an item with source to view code"}
          >
            View source
          </button>
          <button
            type="button"
            onClick={onAskFollowUp}
            disabled={!node}
            title={node ? "Open Ask with a plain-English follow-up for this symbol" : "Select a symbol to ask about it"}
          >
            Ask follow-up
          </button>
        </div>
        <div className="summary-ai-row">
          <button
            className="summary-ai-action"
            type="button"
            onClick={generating ? onCancelSummary : aiCanRun ? onGenerateSelected : onOpenSettings}
            disabled={aiChecking || (!generating && aiCanRun && !node?.file)}
            title={
              generating
                ? "Stop the running local AI request"
                : !aiCanRun
                  ? "Open Settings to configure AI"
                : !node?.file
                  ? "Select a symbol with source to summarize"
                  : modelReadiness.status === "ready"
                    ? `Generate a ${providerLabel} summary for this item`
                    : `Check ${providerLabel}, then generate a summary for this item`
            }
          >
            {aiCanRun || generating ? aiSummaryLabel : `Set up ${providerLabel}`}
          </button>
          <span className={`summary-ai-status ${modelReadiness.status}`} title={modelReadiness.message || aiStatusText}>
            {aiStatusText}
          </span>
        </div>
      </div>
      <div className="summary-output">
        {state?.status === "ready" && state.summary ? (
          <>
            {showFallbackNotice ? (
              <div className="summary-guard-note" role="status">
                Local AI fallback: {state.summary.guardReason ?? `${providerLabel} missed citation rules`}.
              </div>
            ) : null}
            <MessageText text={state.summary.text} />
            <EvidenceList citations={evidence} onOpenCitation={onOpenCitation} />
          </>
        ) : state?.status === "running" ? (
          <>
            <ProgressNote
              label="Generating grounded summary"
              detail={aiProgressDetail(settings, elapsedSeconds, Boolean(state.draftText))}
              elapsedSeconds={elapsedSeconds}
            />
            {state.draftText ? (
              <div className="summary-draft">
                <span>Draft summary</span>
                <MessageText text={state.draftText} />
              </div>
            ) : null}
          </>
        ) : state?.status === "error" ? (
          <p className="error-text">{state.error}</p>
        ) : node && graph ? (
          <>
            <MessageText text={nodeGraphOverview(node, graph)} />
            <EvidenceList citations={evidence} onOpenCitation={onOpenCitation} />
          </>
        ) : (
          <p>Select a codebase item to inspect its source, dependencies, and graph overview.</p>
        )}
      </div>
      <div className="summary-meta">
        <button
          type="button"
          onClick={aiCanRun ? onGenerateAll : onOpenSettings}
          disabled={!summaryUnitCount || generating || aiChecking}
          title={aiCanRun ? `Check ${providerLabel}, then summarize all source units` : `Set up ${providerLabel} before summarizing all`}
        >
          {aiCanRun ? `Summarize all with ${providerLabel}` : `Set up ${providerLabel} for all summaries`}
        </button>
        <span>{bulkStatus || `${summaryUnitCount} source unit${summaryUnitCount === 1 ? "" : "s"}`}</span>
      </div>
    </section>
  );
}
