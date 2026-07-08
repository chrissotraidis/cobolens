import { useRef } from "react";
import type { GraphNode } from "../lib/graph";
import { PROVIDER_LABELS, type ModelSettings } from "../model/config";
import type { Citation } from "../retrieval/context";
import { isGraphQuestion } from "../retrieval/graphAnswer";
import type { ModelReadiness } from "../settings/SettingsDialog";
import { aiProgressDetail, useElapsedSeconds } from "./aiProgress";
import { EvidenceList, MessageText, ProgressNote } from "./MessageParts";

export type ChatStatus = "idle" | "running" | "ready" | "error";
export type ChatAnswer = {
  question: string;
  text: string;
  citations: Citation[];
  source: "graph" | "model";
  guarded?: boolean;
  fallbackReason?: string;
  semanticNote?: string;
};

export function ChatAnswerPanel({
  status,
  answer,
  history,
  error,
  node,
  settings,
  modelReadiness,
  question,
  focusLinkCount,
  aiConfigured,
  canAsk,
  onOpenSettings,
  onQuestionChange,
  onAsk,
  onCancel,
  onAskPreset,
  onRestoreAnswer,
  onClearHistory,
  onOpenCitation,
}: {
  status: ChatStatus;
  answer: ChatAnswer | null;
  history: ChatAnswer[];
  error: string;
  node: GraphNode | null;
  settings: ModelSettings;
  modelReadiness: ModelReadiness;
  question: string;
  focusLinkCount: number;
  aiConfigured: boolean;
  canAsk: boolean;
  onOpenSettings: () => void;
  onQuestionChange: (question: string) => void;
  onAsk: () => void;
  onCancel: () => void;
  onAskPreset: (question: string) => void;
  onRestoreAnswer: (answer: ChatAnswer) => void;
  onClearHistory: () => void;
  onOpenCitation: (citation: Citation) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const starterQuestions = suggestedGraphQuestions(node);
  const elapsedSeconds = useElapsedSeconds(status === "running");
  const questionText = question.trim();
  const workingWithModel = Boolean(questionText && !isGraphQuestion(questionText));
  const answerWasModelQuestion = Boolean(answer && !isGraphQuestion(answer.question));
  const activeRouteLabel = workingWithModel ? "AI mode" : "Graph mode";
  const activeRouteDetail = workingWithModel
    ? aiConfigured
      ? `Uses ${PROVIDER_LABELS[settings.provider]} on only the retrieved, cited code slice.`
      : "Needs local AI. Structural questions still answer without it."
    : "Instant, cited answer from the dependency graph — no AI needed.";
  const answerSubtitle =
    status === "running"
      ? workingWithModel
        ? `${PROVIDER_LABELS[settings.provider]} is reading your code…`
        : "Reading the dependency graph…"
      : answer?.guarded
        ? `Answered from the graph — ${PROVIDER_LABELS[settings.provider]}'s reply wasn't citation-clean`
        : answer?.fallbackReason
          ? "Answered from the graph"
          : answer?.source === "model"
            ? `Answered by ${PROVIDER_LABELS[settings.provider]}, grounded in your code`
            : answer?.source === "graph"
              ? answerWasModelQuestion
                ? "Answered from the graph"
                : "Answered from the dependency graph"
              : workingWithModel
                ? aiConfigured
                  ? `Ready — ${PROVIDER_LABELS[settings.provider]} will answer from your code`
                  : "Set up local AI for open-ended questions; structural questions work now"
                : "Grounded, cited answers about your codebase";
  const progressLabel = workingWithModel ? `${PROVIDER_LABELS[settings.provider]} is thinking` : "Reading the graph";
  const askButtonLabel = status === "running" ? "Stop" : workingWithModel && !aiConfigured ? "Set up AI" : "Send";
  const previousAnswers = history.filter((item) => item !== answer).slice(0, 5);
  const visibleStarterQuestions = starterQuestions.filter((starterQuestion) => starterQuestion !== answer?.question);
  const starterQuestionsLabel = answer ? "Ask another question" : "Try asking";
  const providerLabel = PROVIDER_LABELS[settings.provider];
  const aiStatusText =
    modelReadiness.status === "ready"
      ? "Live"
      : modelReadiness.status === "checking"
        ? "Checking…"
        : modelReadiness.status === "error"
          ? "Offline"
          : aiConfigured
            ? "Ready"
            : "Set up AI";
  const aiStatusTooltip =
    modelReadiness.status === "ready"
      ? modelReadiness.message || `${providerLabel} is live`
      : modelReadiness.status === "checking"
        ? `Checking ${providerLabel}…`
        : modelReadiness.status === "error"
          ? modelReadiness.message || `${providerLabel} is not reachable`
          : aiConfigured
            ? `${providerLabel} is configured — run Check AI in Settings to verify`
            : "Set up local AI in Settings to chat with open-ended questions";
  const emptyResponseText = questionText
    ? workingWithModel
      ? aiConfigured
        ? `Press Send — ${PROVIDER_LABELS[settings.provider]} will answer from the retrieved, cited code.`
        : "Set up local AI for open-ended questions. Structural questions work without it."
      : "Press Send for an instant, cited answer from the dependency graph."
    : "Ask anything about this codebase — data flow, dependencies, files, or behavior. Every answer is grounded in your code and cited.";
  const submitAsk = () => {
    if (status === "running") {
      onCancel();
      return;
    }
    if (workingWithModel && !aiConfigured) {
      onOpenSettings();
      return;
    }
    onAsk();
  };

  return (
    <section className="answer-card">
      <div className="answer-header">
        <div>
          <strong>Chat</strong>
          <span>{answerSubtitle}</span>
        </div>
      </div>
      <div className="ask-focus-strip" aria-label="Current chat focus">
        <span>Talking about</span>
        <strong>{node?.name ?? "Codebase"}</strong>
        <small>{node ? `${node.type} - ${focusLinkCount} graph link${focusLinkCount === 1 ? "" : "s"}` : "All indexed symbols"}</small>
      </div>
      <div className="chat-composer" aria-label="Ask a question">
        <input
          type="text"
          autoFocus
          ref={inputRef}
          aria-label="Ask about the codebase"
          placeholder="Ask about data flow, dependencies, files, or business logic..."
          value={question}
          onChange={(event) => onQuestionChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitAsk();
          }}
          disabled={!canAsk || status === "running"}
        />
        <button
          type="button"
          onClick={submitAsk}
          disabled={!canAsk || (status !== "running" && !question.trim())}
        >
          {askButtonLabel}
        </button>
      </div>
      <div className="chat-status-row" aria-live="polite">
        <span
          className={`chat-mode-chip ${workingWithModel ? "model" : "graph"}`}
          title={activeRouteDetail}
          aria-label={`${activeRouteLabel}. ${activeRouteDetail}`}
        >
          {activeRouteLabel}
        </span>
        {workingWithModel ? (
          <span
            className={`ai-status ${modelReadiness.status}`}
            title={aiStatusTooltip}
            aria-label={aiStatusTooltip}
            role={modelReadiness.status === "error" ? "alert" : "status"}
          >
            <i className="ai-status-dot" aria-hidden="true" />
            {aiStatusText}
          </span>
        ) : null}
      </div>
      <div className="answer-response" aria-live="polite">
        {status === "running" ? (
          <>
            <ProgressNote
              label={progressLabel}
              detail={aiProgressDetail(settings, elapsedSeconds, Boolean(answer?.text && answer.source === "model"))}
              elapsedSeconds={elapsedSeconds}
            />
            {answer?.source === "model" && answer.text ? (
              <div className="answer-turn is-streaming">
                <span>Draft answer</span>
                <MessageText text={answer.text} />
              </div>
            ) : null}
          </>
        ) : status === "error" ? (
          <p className="error-text">{error}</p>
        ) : answer ? (
          <>
            <div className="answer-turn">
              <span>Question</span>
              <strong>{answer.question}</strong>
            </div>
            <div className="answer-turn">
              <span>Answer</span>
              <MessageText text={answer.text} />
            </div>
            {answer.semanticNote ? (
              <div className="answer-semantic-note" role="status">
                {answer.semanticNote}
              </div>
            ) : null}
            <EvidenceList citations={answer.citations} onOpenCitation={onOpenCitation} />
          </>
        ) : (
          <p>{emptyResponseText}</p>
        )}
      </div>
      {visibleStarterQuestions.length ? (
        <div className="question-shortcuts">
          <span>{starterQuestionsLabel}</span>
          <div className="question-chips" aria-label="Suggested questions">
            {visibleStarterQuestions.map((question) => {
              const graphQuestion = isGraphQuestion(question);
              const chipAction = graphQuestion
                ? "Answer instantly from the graph"
                : `Draft ${PROVIDER_LABELS[settings.provider]} question`;
              return (
                <button
                  key={question}
                  type="button"
                  onClick={() => {
                    onAskPreset(question);
                    if (!graphQuestion) {
                      window.requestAnimationFrame(() => inputRef.current?.focus());
                    }
                  }}
                  disabled={status === "running"}
                  title={`${chipAction}: ${question}`}
                  aria-label={`${chipAction}: ${question}`}
                >
                  <span>{question}</span>
                  <small>{graphQuestion ? "Graph" : PROVIDER_LABELS[settings.provider]}</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {previousAnswers.length ? (
        <details className="answer-history" aria-label="Recent Ask answers">
          <summary>
            <span>Recent answers</span>
            <small>{previousAnswers.length}</small>
          </summary>
          <button type="button" onClick={onClearHistory} disabled={status === "running"}>
            Clear
          </button>
          <div className="answer-history-list">
            {previousAnswers.map((item, index) => (
              <button
                key={`${item.question}:${index}`}
                type="button"
                onClick={() => onRestoreAnswer(item)}
                disabled={status === "running"}
                title={item.question}
              >
                <span>{item.question}</span>
                <small>
                  {item.guarded || item.fallbackReason ? "Cited graph answer" : item.source === "model" ? PROVIDER_LABELS[settings.provider] : "Graph"} - {item.citations.length} citation
                  {item.citations.length === 1 ? "" : "s"}
                </small>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function suggestedGraphQuestions(node: GraphNode | null) {
  const overviewQuestion = "Give me a codebase overview.";
  if (!node) return [overviewQuestion];
  const name = node.name;
  const selectedOverview = selectedNodeOverviewQuestion(node);
  if (node.type === "program") {
    return [overviewQuestion, selectedOverview, `What depends on ${name}?`, `What does ${name} call?`, `What files does ${name} read?`, `What does ${name} write?`];
  }
  if (node.type === "data-item") {
    return [overviewQuestion, selectedOverview, `Where does ${name} flow?`, `What uses ${name}?`, `Where does ${name} happen?`];
  }
  if (node.type === "jcl-dd") {
    return [overviewQuestion, selectedOverview, `What uses ${name}?`, `What does ${name} use?`, `Where does ${name} happen?`];
  }
  if (node.type === "dataset") {
    return [overviewQuestion, selectedOverview, `What uses ${name}?`, `Where does ${name} flow?`, `Where does ${name} happen?`];
  }
  return [
    overviewQuestion,
    selectedOverview,
    `What uses ${name}?`,
    `Where does ${name} happen?`,
    `What depends on ${name}?`,
  ];
}

function selectedNodeOverviewQuestion(node: GraphNode) {
  return `Explain ${node.name} in plain English.`;
}
