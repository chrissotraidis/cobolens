import { useMemo } from "react";
import type { GraphDocument, GraphNode } from "../lib/graph";
import { dependencyCounts } from "../lib/graphSelectors";
import { nodeTypeLabel } from "../lib/graphLabels";
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
  onAskSuggestion,
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
  onAskSuggestion: (question: string) => void;
  onOpenSettings: () => void;
  onViewSource: () => void;
  onOpenCitation: (citation: Citation) => void;
}) {
  const elapsedSeconds = useElapsedSeconds(state?.status === "running");
  const evidence = useMemo(() => (node && graph ? summaryEvidenceCitations(node, graph) : []), [graph, node]);
  const counts = useMemo(
    () => (node ? dependencyCounts(node, graph) : { incoming: 0, outgoing: 0, total: 0 }),
    [graph, node],
  );
  const generating = state?.status === "running";
  const hasStoredSummary = state?.status === "ready" && Boolean(state.summary);
  const providerLabel = PROVIDER_LABELS[settings.provider];
  const aiCanRun = aiConfigured;
  const aiReady = aiConfigured && modelReadiness.status === "ready";
  const aiChecking = modelReadiness.status === "checking";
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
    <section className="summary-card investigation-card">
      <div className="summary-actions">
        <div className="summary-action-header">
          <span className="summary-eyebrow">Context</span>
          <strong>{node ? node.name : "Explore the codebase"}</strong>
          <span
            className="summary-context-meta"
            title={node?.file ? `${node.file}:${node.lines?.[0] ?? 1}` : undefined}
          >
            {node
              ? `${nodeTypeLabel(node.type)} · ${counts.total} link${counts.total === 1 ? "" : "s"}`
              : "Select a codebase item or start a project-wide chat."}
          </span>
        </div>
        <div className="summary-action-buttons">
          <button
            type="button"
            onClick={onViewSource}
            disabled={!node?.file}
            title={node?.file ? "Open the source tab and focus the source viewer" : "Select an item with source to view code"}
          >
            Open source
          </button>
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
            {generating ? `Stop ${providerLabel}` : hasStoredSummary ? `Refresh ${providerLabel} explanation` : `Explain with ${providerLabel}`}
          </button>
        </div>
        {modelReadiness.status === "checking" || modelReadiness.status === "error" ? (
          <span className={`summary-ai-status ${modelReadiness.status}`} title={modelReadiness.message || aiStatusText}>{aiStatusText}</span>
        ) : null}
      </div>
      {state?.status === "running" ? (
        <div className="summary-live-output">
          <ProgressNote
            label="Generating grounded explanation"
            detail={aiProgressDetail(settings, elapsedSeconds, Boolean(state.draftText))}
            elapsedSeconds={elapsedSeconds}
          />
          {state.draftText ? <MessageText text={state.draftText} /> : null}
        </div>
      ) : state?.status === "error" ? <p className="error-text">{state.error}</p> : null}
      <div className="explore-suggestions" aria-label="Suggested questions">
        <span>Try asking</span>
        {suggestedQuestions(node).slice(0, 2).map((question) => (
          <button key={question} type="button" onClick={() => onAskSuggestion(question)}>
            {question}
          </button>
        ))}
      </div>
      <details className="investigation-details">
        <summary>
          <span>Context &amp; evidence</span>
          <small>{evidence.length} source{evidence.length === 1 ? "" : "s"}</small>
        </summary>
        <div className="summary-output">
          {state?.status === "ready" && state.summary ? (
            <>
              {showFallbackNotice ? (
                <div className="summary-guard-note" role="status">
                  Local AI fallback: {state.summary.guardReason ?? `${providerLabel} missed citation rules`}.
                </div>
              ) : null}
              <MessageText text={state.summary.text} />
              {hasStoredSummary ? <button type="button" className="restore-graph-facts" onClick={onExplainNode}>Restore graph facts</button> : null}
              <EvidenceList citations={evidence} onOpenCitation={onOpenCitation} />
            </>
          ) : node && graph ? (
            <>
              <MessageText text={nodeGraphOverview(node, graph)} />
              <EvidenceList citations={evidence} onOpenCitation={onOpenCitation} />
            </>
          ) : (
            <p>Select a codebase item to inspect its source, dependencies, and graph overview.</p>
          )}
          <details className="summary-tools">
            <summary>Project-wide explanation</summary>
            <div className="summary-meta">
              <button
                type="button"
                onClick={aiCanRun ? onGenerateAll : onOpenSettings}
                disabled={!summaryUnitCount || generating || aiChecking}
                title={aiCanRun ? `Check ${providerLabel}, then summarize all source units` : `Set up ${providerLabel} before summarizing all`}
              >
                {aiCanRun ? `Explain all with ${providerLabel}` : `Set up ${providerLabel}`}
              </button>
              <span>{bulkStatus || `${summaryUnitCount} source unit${summaryUnitCount === 1 ? "" : "s"}`}</span>
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}

function suggestedQuestions(node: GraphNode | null) {
  if (!node) {
    return ["Where should I start?", "How is this codebase structured?", "Which programs read or write data?"];
  }
  return [
    "What does this do?",
    `What does ${node.name} read and write?`,
    `Walk me through the data flow through ${node.name}.`,
  ];
}
