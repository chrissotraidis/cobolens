import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GraphNode } from "../lib/graph";
import { PROVIDER_LABELS, type ModelSettings } from "../model/config";
import type { Citation } from "../retrieval/context";
import { isGraphQuestion } from "../retrieval/graphAnswer";
import type { SemanticIndexState } from "../retrieval/useSemanticIndex";
import type { ModelReadiness } from "../settings/SettingsDialog";
import { aiProgressDetail, useElapsedSeconds } from "./aiProgress";
import { EvidenceList, MessageText, ProgressNote } from "./MessageParts";
import { inputQualityMessage } from "./questionQuality";

export type ChatStatus = "idle" | "running" | "ready" | "error";
export type ChatMode = "auto" | "graph" | "ai";
export type ChatAnswer = {
  question: string;
  text: string;
  citations: Citation[];
  source: "graph" | "model";
  contextLabel?: string;
  guarded?: boolean;
  citationFiltered?: boolean;
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
  overview,
  onOpenSettings,
  onQuestionChange,
  onAsk,
  onCancel,
  onOpenCitation,
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
  overview: ReactNode;
  onOpenSettings: () => void;
  onQuestionChange: (question: string) => void;
  onAsk: (mode?: ChatMode) => void;
  onCancel: () => void;
  onOpenCitation: (citation: Citation) => void;
}) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const routeMenuRef = useRef<HTMLDetailsElement>(null);
  const [mode, setMode] = useState<ChatMode>("auto");
  const elapsedSeconds = useElapsedSeconds(status === "running");
  const questionText = question.trim();
  const qualityMessage = inputQualityMessage(questionText, Boolean(node));
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
  const askButtonLabel = status === "running" ? "Stop" : !qualityMessage && workingWithModel && !aiConfigured ? "Set up AI" : "Send";
  const providerLabel = PROVIDER_LABELS[settings.provider];
  const routeLabel = mode === "ai" ? "Local AI" : mode[0].toUpperCase() + mode.slice(1);
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
  const submitAsk = () => {
    if (status === "running") {
      onCancel();
      return;
    }
    if (qualityMessage) {
      onAsk(mode);
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
    composer.style.height = `${Math.min(Math.max(composer.scrollHeight, 54), 132)}px`;
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
    if (question && status !== "running") composerRef.current?.focus({ preventScroll: true });
  }, [question, status]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    if (status === "ready" || (!visibleAnswers.length && !pendingAnswer && status === "idle")) {
      thread.scrollTop = 0;
      return;
    }
    thread.scrollTop = thread.scrollHeight;
  }, [visibleAnswers.length, pendingAnswer, status]);

  return (
    <section className="answer-card chat-workspace">
      <div className="chat-thread" ref={threadRef} aria-live="polite">
        {hasConversation && node ? <div className="chat-context-banner">Context · {node.name}</div> : null}
        {!hasConversation ? overview : null}
        {visibleAnswers.map((item, index) => (
          <ChatTurn
            key={`${item.question}:${item.text}:${index}`}
            answer={item}
            providerLabel={providerLabel}
            onOpenCitation={onOpenCitation}
          />
        ))}
        {status === "running" ? (
          <ProgressNote
            label={progressLabel}
            detail={aiProgressDetail(settings, elapsedSeconds, Boolean(answer?.text && answer.source === "model"))}
            elapsedSeconds={elapsedSeconds}
          />
        ) : status === "error" ? (
          <div className="chat-turn is-error">
            <div className="chat-user-message">{questionText || "Chat"}</div>
            <div className="chat-answer-bubble">
              <span className="chat-route-label stopped">{errorLabel}</span>
              <p className="error-text">{error}</p>
            </div>
          </div>
        ) : null}
        {pendingAnswer ? (
          <ChatTurn answer={pendingAnswer} providerLabel={providerLabel} onOpenCitation={onOpenCitation} />
        ) : null}
      </div>
      <div className="chat-composer" aria-label="Chat about the codebase">
        <div className="chat-composer-box">
          <textarea
            autoFocus
            ref={composerRef}
            rows={2}
            aria-label="Message about the codebase"
            placeholder={node ? `Message about ${node.name}…` : "Message about this codebase…"}
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
            <details className="answer-route-menu" ref={routeMenuRef}>
              <summary aria-label={`Answer route: ${routeLabel}`}>{routeLabel}</summary>
              <div className="answer-route-popover">
                <span>Answer route</span>
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
                        onClick={() => {
                          setMode(route);
                          routeMenuRef.current?.removeAttribute("open");
                        }}
                        disabled={status === "running"}
                        aria-pressed={mode === route}
                        title={isLocalAiRoute ? localAiRouteTitle : undefined}
                      >
                        {isRoutedToLocalAi ? <i className="chat-mode-status-dot" aria-hidden="true" /> : null}
                        <span>{isLocalAiRoute ? "Local AI" : route[0].toUpperCase() + route.slice(1)}</span>
                      </button>
                    );
                  })}
                </div>
                <p>{activeRouteDetail}</p>
                {workingWithModel ? <small>{semanticIndex.message}</small> : null}
              </div>
            </details>
            <span className={`chat-grounding-cue${workingWithModel ? " is-model" : ""}`}>
              {workingWithModel ? `${providerLabel} + cited code` : "Dependency graph + source"}
            </span>
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

function ChatTurn({
  answer,
  providerLabel,
  onOpenCitation,
}: {
  answer: ChatAnswer;
  providerLabel: string;
  onOpenCitation: (citation: Citation) => void;
}) {
  return (
    <article className="chat-turn">
      <div className="chat-user-message">
        <span>{answer.question}</span>
        {answer.contextLabel ? <small>Asked while inspecting {answer.contextLabel}</small> : null}
      </div>
      <div className="chat-answer-bubble">
        <span className={`chat-route-label ${answerRouteClass(answer)}`}>{answerRouteLabel(answer, providerLabel)}</span>
        <div className="chat-answer-text">
          <MessageText text={answer.text} />
        </div>
        <EvidenceList citations={answer.citations} onOpenCitation={onOpenCitation} />
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
  if (answer.guarded || (answer.source === "graph" && answer.fallbackReason)) return "Graph fallback";
  return answer.source === "model" ? `${providerLabel} answer` : "Graph answer";
}

function answerRouteClass(answer: ChatAnswer) {
  if (answer.guarded || (answer.source === "graph" && answer.fallbackReason)) return "fallback";
  return answer.source === "model" ? "model" : "graph";
}
