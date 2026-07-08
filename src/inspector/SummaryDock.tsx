import { useMemo } from "react";
import type { GraphDocument, GraphNode } from "../lib/graph";
import { PROVIDER_LABELS, type ModelSettings } from "../model/config";
import type { UnitSummary } from "../model/summaries";
import type { Citation } from "../retrieval/context";
import { aiProgressDetail, useElapsedSeconds } from "./aiProgress";
import { EvidenceList, MessageText, ProgressNote } from "./MessageParts";
import { nodeGraphOverview, summaryEvidenceCitations } from "./summaryGraph";

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
  const aiSummaryLabel = generating ? "Stop" : state?.summary ? "Refresh AI summary" : "Generate AI summary";

  return (
    <section className="summary-card">
      <div className="summary-actions">
        <div>
          <strong>Overview</strong>
          <span>
            {node ? `${node.name} - graph facts, source evidence, and optional AI` : "No codebase item selected"}
          </span>
        </div>
        <div className="summary-action-buttons">
          {hasStoredSummary ? (
            <button
              type="button"
              onClick={onExplainNode}
              disabled={!node}
              title={node ? "Return Summary to the cited graph overview" : "Select a symbol to summarize it"}
            >
              Use graph overview
            </button>
          ) : null}
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
          {aiConfigured || generating ? (
            <button
              className="summary-wide-action"
              type="button"
              onClick={generating ? onCancelSummary : onGenerateSelected}
              disabled={!generating && !node?.file}
              title={
                generating
                  ? "Stop the running summary request"
                  : !node?.file
                    ? "Select a symbol with source to summarize"
                    : "Generate an AI summary for this item"
              }
            >
              {aiSummaryLabel}
            </button>
          ) : null}
        </div>
      </div>
      {!aiConfigured && !generating ? (
        <button type="button" className="link-action" onClick={onOpenSettings}>
          Optional: set up local Ollama or a cloud key for AI summaries
        </button>
      ) : null}
      <div className="summary-guard-note" role="status">
        Graph answers work without AI. AI runs only when you choose an AI action.
      </div>
      <div className="summary-output">
        {state?.status === "ready" && state.summary ? (
          <>
            {state.summary.guarded ? (
              <div className="summary-guard-note" role="status">
                Showing a cited graph overview:{" "}
                {state.summary.guardReason ?? `${PROVIDER_LABELS[settings.provider]} missed citation rules`}.
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
        {aiConfigured ? (
          <button type="button" onClick={onGenerateAll} disabled={!summaryUnitCount || generating}>
            Summarize all with AI
          </button>
        ) : null}
        <span>{bulkStatus || `${summaryUnitCount} source units`}</span>
      </div>
    </section>
  );
}
