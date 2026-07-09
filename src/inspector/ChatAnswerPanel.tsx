import { useEffect, useRef, useState } from "react";
import type { GraphNode } from "../lib/graph";
import { PROVIDER_LABELS, type ModelSettings } from "../model/config";
import type { Citation } from "../retrieval/context";
import { isGraphQuestion } from "../retrieval/graphAnswer";
import type { SemanticIndexState } from "../retrieval/useSemanticIndex";
import type { ModelReadiness } from "../settings/SettingsDialog";
import { aiProgressDetail, useElapsedSeconds } from "./aiProgress";
import { MessageText, ProgressNote } from "./MessageParts";

export type ChatStatus = "idle" | "running" | "ready" | "error";
export type ChatMode = "auto" | "graph" | "ai";
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
  semanticIndex,
  question,
  aiConfigured,
  canAsk,
  onOpenSettings,
  onQuestionChange,
  onAsk,
  onCancel,
}: {
  status: ChatStatus;
  answer: ChatAnswer | null;
  history: ChatAnswer[];
  error: string;
  node: GraphNode | null;
  settings: ModelSettings;
  modelReadiness: ModelReadiness;
  semanticIndex: SemanticIndexState;
  question: string;
  aiConfigured: boolean;
  canAsk: boolean;
  onOpenSettings: () => void;
  onQuestionChange: (question: string) => void;
  onAsk: (mode?: ChatMode) => void;
  onCancel: () => void;
}) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ChatMode>("auto");
  const elapsedSeconds = useElapsedSeconds(status === "running");
  const questionText = question.trim();
  const autoIdle = mode === "auto" && !questionText;
  const workingWithModel = routeNeedsModel(questionText, mode);
  const activeRouteDetail = autoIdle
    ? "Auto chooses graph for structural questions and Local AI for open-ended ones."
    : workingWithModel
      ? aiConfigured
        ? `Uses ${PROVIDER_LABELS[settings.provider]} on only the retrieved, cited code slice.`
        : `${PROVIDER_LABELS[settings.provider]} is not ready. Structural questions still answer without it.`
      : "Instant, cited answer from the dependency graph — no AI needed.";
  const progressLabel = workingWithModel ? `${PROVIDER_LABELS[settings.provider]} is thinking` : "Reading the graph";
  const askButtonLabel = status === "running" ? "Stop" : workingWithModel && !aiConfigured ? "Set up AI" : "Send";
  const providerLabel = PROVIDER_LABELS[settings.provider];
  const aiStatusTooltip =
    modelReadiness.status === "ready"
      ? modelReadiness.message || `${providerLabel} is live`
      : modelReadiness.status === "checking"
        ? `Checking ${providerLabel}…`
        : modelReadiness.status === "error"
          ? modelReadiness.message || `${providerLabel} is not reachable`
          : aiConfigured
            ? `${providerLabel} is configured. Cobolens will check it when you send.`
            : "Set up local AI in Settings to chat with open-ended questions";
  const emptyResponseText = questionText
    ? workingWithModel
      ? aiConfigured
        ? `Send to ${PROVIDER_LABELS[settings.provider]} with only retrieved, cited code.`
        : `${PROVIDER_LABELS[settings.provider]} is not ready. Check Settings, or switch to Graph for structural answers.`
      : "Ready for an instant answer from the dependency graph."
    : "Type a question below when you want to inspect this selection.";
  const submitAsk = () => {
    if (status === "running") {
      onCancel();
      return;
    }
    if (workingWithModel && !aiConfigured) {
      onOpenSettings();
      return;
    }
    onAsk(mode);
  };
  const resizeComposer = () => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    composer.style.height = `${Math.min(Math.max(composer.scrollHeight, 76), 150)}px`;
  };
  const localAiRouteTitle = workingWithModel
    ? `${activeRouteDetail} ${aiStatusTooltip}`
    : "Use Local AI for this question.";
  const errorLabel = isStoppedError(error) ? "Stopped" : "Check question";
  const visibleAnswers = [...history].reverse();
  const pendingAnswer = answer && !visibleAnswers.some((item) => sameChatAnswer(item, answer)) ? answer : null;
  const hasConversation = Boolean(visibleAnswers.length || pendingAnswer || status === "running" || status === "error");

  useEffect(() => {
    resizeComposer();
  }, [question]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [visibleAnswers.length, pendingAnswer?.text, status]);

  return (
    <section className="answer-card chat-workspace">
      <div className="chat-thread" ref={threadRef} aria-live="polite">
        {!hasConversation ? <AnswerModeDisclosure providerLabel={providerLabel} semanticIndex={semanticIndex} /> : null}
        {visibleAnswers.map((item, index) => (
          <ChatTurn key={`${item.question}:${item.text}:${index}`} answer={item} providerLabel={providerLabel} />
        ))}
        {status === "running" ? (
          <>
            <ProgressNote
              label={progressLabel}
              detail={aiProgressDetail(settings, elapsedSeconds, Boolean(answer?.text && answer.source === "model"))}
              elapsedSeconds={elapsedSeconds}
            />
            <StreamingStages workingWithModel={workingWithModel} providerLabel={providerLabel} hasDraft={Boolean(answer?.text)} />
          </>
        ) : status === "error" ? (
          <div className="chat-turn is-error">
            <div className="chat-user-message">{questionText || "Ask"}</div>
            <div className="chat-answer-bubble">
              <span className="chat-route-label stopped">{errorLabel}</span>
              <p className="error-text">{error}</p>
            </div>
          </div>
        ) : null}
        {pendingAnswer ? (
          <ChatTurn answer={pendingAnswer} providerLabel={providerLabel} />
        ) : null}
        {!hasConversation ? (
          <div className="chat-empty-state">
            <strong>{node ? `Ask about ${node.name}` : "Ask about this codebase"}</strong>
            <span>{emptyResponseText}</span>
          </div>
        ) : null}
      </div>
      <div className="chat-composer" aria-label="Ask a question">
        <div className="chat-composer-box">
          <textarea
            autoFocus
            ref={composerRef}
            rows={3}
            aria-label="Ask about the codebase"
            placeholder="Ask about data flow, dependencies, files, behavior, or what to inspect next..."
            value={question}
            onChange={(event) => {
              onQuestionChange(event.currentTarget.value);
              resizeComposer();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitAsk();
              }
            }}
            disabled={!canAsk || status === "running"}
          />
          <div className="chat-composer-footer">
            <div className="chat-mode-control" aria-label="Answer route">
              {(["auto", "graph", "ai"] as ChatMode[]).map((route) => {
                const isLocalAiRoute = route === "ai";
                const isRoutedToLocalAi = isLocalAiRoute && workingWithModel;
                const className = [
                  mode === route ? "is-active" : "",
                  isLocalAiRoute ? "chat-route-ai" : "",
                  isRoutedToLocalAi ? `is-routed ai-${modelReadiness.status}` : "",
                ].filter(Boolean).join(" ");
                return (
                  <button
                    key={route}
                    type="button"
                    className={className}
                    onClick={() => setMode(route)}
                    disabled={status === "running"}
                    aria-pressed={mode === route}
                    title={isLocalAiRoute ? localAiRouteTitle : undefined}
                    aria-label={isLocalAiRoute && isRoutedToLocalAi ? `Local AI. ${localAiRouteTitle}` : undefined}
                  >
                    {isRoutedToLocalAi ? <i className="chat-mode-status-dot" aria-hidden="true" /> : null}
                    <span>{isLocalAiRoute ? "Local AI" : route[0].toUpperCase() + route.slice(1)}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="chat-send-button"
              onClick={submitAsk}
              disabled={!canAsk || (status !== "running" && !question.trim())}
            >
              {askButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatTurn({ answer, providerLabel }: { answer: ChatAnswer; providerLabel: string }) {
  return (
    <article className="chat-turn">
      <div className="chat-user-message">{answer.question}</div>
      <div className="chat-answer-bubble">
        <span className={`chat-route-label ${answerRouteClass(answer)}`}>{answerRouteLabel(answer, providerLabel)}</span>
        <div className="chat-answer-text">
          <MessageText text={answer.text} />
        </div>
        {answer.semanticNote ? (
          <div className="answer-semantic-note" role="status">
            {answer.semanticNote}
          </div>
        ) : null}
        {answer.fallbackReason ? (
          <details className="answer-details">
            <summary>Details</summary>
            <p>{answer.fallbackReason}</p>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function AnswerModeDisclosure({
  providerLabel,
  semanticIndex,
}: {
  providerLabel: string;
  semanticIndex: SemanticIndexState;
}) {
  return (
    <details className="answer-mode-help">
      <summary>How answers work</summary>
      <ul>
        <li>Graph uses the parsed dependency graph and source lines. No AI.</li>
        <li>{providerLabel} uses retrieved graph and source context.</li>
        <li>Semantic retrieval uses local embeddings when the index is ready.</li>
      </ul>
      <p>{semanticIndex.message}</p>
    </details>
  );
}

function StreamingStages({
  workingWithModel,
  providerLabel,
  hasDraft,
}: {
  workingWithModel: boolean;
  providerLabel: string;
  hasDraft: boolean;
}) {
  const stages = workingWithModel
    ? ["Finding graph context", "Retrieving cited source", `Asking ${providerLabel}`, "Checking citations", "Writing answer"]
    : ["Finding graph context", "Retrieving cited source", "Writing graph answer"];

  return (
    <ol className="chat-stream-stages" aria-label="Answer progress">
      {stages.map((stage, index) => (
        <li key={stage} className={index === 0 || (hasDraft && index >= stages.length - 2) ? "is-active" : ""}>
          {stage}
        </li>
      ))}
    </ol>
  );
}

function routeNeedsModel(question: string, mode: ChatMode) {
  if (!question) return mode === "ai";
  if (mode === "graph") return false;
  if (mode === "ai") return true;
  return !isGraphQuestion(question);
}

function isStoppedError(error: string) {
  return /\bwas stopped\.$/i.test(error);
}

function sameChatAnswer(left: ChatAnswer, right: ChatAnswer) {
  return left.question === right.question && left.text === right.text && left.source === right.source;
}

function answerRouteLabel(answer: ChatAnswer, providerLabel: string) {
  if (answer.guarded || answer.fallbackReason) return "Graph fallback";
  return answer.source === "model" ? `${providerLabel} answer` : "Graph answer";
}

function answerRouteClass(answer: ChatAnswer) {
  if (answer.guarded || answer.fallbackReason) return "fallback";
  return answer.source === "model" ? "model" : "graph";
}
