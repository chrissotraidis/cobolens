import { useRef } from "react";
import type { GraphDocument, GraphNode, SourceExcerpt } from "../lib/graph";
import type { ModelSettings } from "../model/config";
import { generateGroundedAnswer } from "../model/chat";
import {
  friendlyModelError,
  isStoppedModelCall,
  runStreamingModelCall,
} from "../model/modelRuntime";
import { retrieveQuestionContext, type RetrievedContext } from "../retrieval/context";
import { graphAnswerFallback, isGraphQuestion } from "../retrieval/graphAnswer";
import type { SemanticMatch } from "../retrieval/semantic";
import type { SemanticIndexState } from "../retrieval/useSemanticIndex";
import { shouldSyncAskFocus } from "../retrieval/askFocus";
import type { ChatAnswer, ChatMode, ChatStatus } from "./ChatAnswerPanel";
import type { InspectorTab } from "./InspectorTabs";

const COMPLETE_QUESTION_MESSAGE = 'Ask a complete question, like "What does this program do?"';

export function useAskGeneration({
  graph,
  selectedNode,
  modelSettings,
  chatQuestion,
  setChatQuestion,
  setChatStatus,
  setChatAnswer,
  setChatError,
  rememberChatAnswer,
  readExcerptForNode,
  prepareModelCall,
  onModelCallComplete,
  onSyncFocusNode,
  onTabChange,
  semanticIndex,
  searchSemanticIndex,
}: {
  graph: GraphDocument | null;
  selectedNode: GraphNode | null;
  modelSettings: ModelSettings;
  chatQuestion: string;
  setChatQuestion: (question: string) => void;
  setChatStatus: (status: ChatStatus) => void;
  setChatAnswer: (answer: ChatAnswer | null) => void;
  setChatError: (error: string) => void;
  rememberChatAnswer: (answer: ChatAnswer) => void;
  readExcerptForNode: (node: GraphNode) => Promise<SourceExcerpt>;
  prepareModelCall: () => Promise<string | undefined>;
  onModelCallComplete: () => void;
  onSyncFocusNode: (nodeId: string) => void;
  onTabChange: (tab: InspectorTab) => void;
  semanticIndex: SemanticIndexState;
  searchSemanticIndex: (question: string) => Promise<SemanticMatch[]>;
}) {
  const activeChatAbortRef = useRef<AbortController | null>(null);

  async function askQuestion(questionDraft = chatQuestion, mode: ChatMode = "auto") {
    if (!graph || !questionDraft.trim()) return;
    const question = questionDraft.trim();
    const qualityMessage = inputQualityMessage(question);
    if (qualityMessage) {
      setChatQuestion(question);
      setChatAnswer(null);
      setChatError(qualityMessage);
      setChatStatus("error");
      onTabChange("ask");
      return;
    }
    const useGraphRoute = mode === "graph" || (mode === "auto" && isGraphQuestion(question));
    setChatQuestion(question);
    setChatStatus("running");
    setChatAnswer(null);
    setChatError("");
    let context: RetrievedContext | null = null;
    const semanticNote = semanticStatusNote(semanticIndex);

    try {
      context = await retrieveQuestionContext({
        graph,
        question,
        preferredNode: selectedNode,
        readExcerpt: readExcerptForNode,
        semanticSearch: useGraphRoute || semanticIndex.status !== "ready" ? undefined : searchSemanticIndex,
        includeSourceExcerpts: !useGraphRoute,
      });
      if (useGraphRoute) {
        const fallback = graphAnswerFallback(graph, question, context);
        const graphAnswer: ChatAnswer = { question, text: fallback.text, citations: fallback.citations, source: "graph" };
        setChatAnswer(graphAnswer);
        rememberChatAnswer(graphAnswer);
        setChatStatus("ready");
        setChatQuestion("");
        if (context.focusNodes[0] && shouldSyncAskFocus(question)) {
          onSyncFocusNode(context.focusNodes[0].id);
        }
        return;
      }
      const answerContext = context;
      const apiKey = await prepareModelCall();
      const answer = await runStreamingModelCall("Ask", activeChatAbortRef, (abortSignal, noteFirstToken) =>
        generateGroundedAnswer({
          question,
          context: answerContext,
          settings: modelSettings,
          apiKey,
          abortSignal,
          onFirstToken: noteFirstToken,
          onTextDelta: (draft) => {
            setChatAnswer({
              question,
              text: draft,
              citations: [],
              source: "model",
            });
          },
        }),
      );
      onModelCallComplete();
      const fellBackToGraph = Boolean(answer.guarded && !answer.repaired);
      const displayedAnswer = fellBackToGraph
        ? graphAnswerFallback(
            graph,
            question,
            answerContext,
            `model answer had ${answer.guardReason ?? "citation issues"}`,
            "citation",
          )
        : { text: answer.text, citations: answerContext.citations };
      const modelAnswer: ChatAnswer = {
        question,
        text: displayedAnswer.text,
        citations: displayedAnswer.citations,
        source: fellBackToGraph ? "graph" : "model",
        guarded: fellBackToGraph,
        citationFiltered: Boolean(answer.repaired),
        fallbackReason: answer.repaired
          ? "Citation guard removed uncited Local AI claims and kept only source-backed text."
          : fellBackToGraph
            ? `Citation guard: ${answer.guardReason ?? "citation issues"}.`
            : undefined,
        semanticNote:
          answerContext.semanticError
            ? `Semantic retrieval was unavailable (${answerContext.semanticError}), so this answer used graph and keyword retrieval.`
            : semanticNote,
      };
      setChatAnswer(modelAnswer);
      rememberChatAnswer(modelAnswer);
      setChatStatus("ready");
      setChatQuestion("");
      if (answerContext.focusNodes[0] && shouldSyncAskFocus(question)) {
        onSyncFocusNode(answerContext.focusNodes[0].id);
      }
    } catch (err) {
      const fallbackReason = friendlyModelError(err, modelSettings);
      if (isStoppedModelCall(fallbackReason)) {
        setChatError(fallbackReason);
        setChatStatus("error");
        return;
      }
      if (context) {
        const fallback = graphAnswerFallback(graph, question, context, fallbackReason);
        const fallbackAnswer: ChatAnswer = {
          question,
          text: fallback.text,
          citations: fallback.citations,
          source: "graph",
          fallbackReason,
          semanticNote: context.semanticError
            ? `Semantic retrieval was unavailable (${context.semanticError}), so this answer used graph and keyword retrieval.`
            : semanticNote,
        };
        setChatAnswer(fallbackAnswer);
        rememberChatAnswer(fallbackAnswer);
        setChatStatus("ready");
        setChatQuestion("");
        if (context.focusNodes[0] && shouldSyncAskFocus(question)) {
          onSyncFocusNode(context.focusNodes[0].id);
        }
        return;
      }
      setChatError(fallbackReason);
      setChatStatus("error");
    }
  }

  function askAboutSelectedNode() {
    if (!selectedNode) return;
    setChatQuestion(`Explain ${selectedNode.name} in plain English.`);
    setChatAnswer(null);
    setChatError("");
    setChatStatus("idle");
    onTabChange("ask");
  }

  function askCurrentQuestion(mode: ChatMode = "auto") {
    askQuestion(chatQuestion, mode);
  }

  function cancelAsk() {
    activeChatAbortRef.current?.abort();
  }

  return {
    askQuestion,
    askCurrentQuestion,
    askAboutSelectedNode,
    cancelAsk,
  };
}

export function inputQualityMessage(question: string) {
  const words = question
    .trim()
    .toLocaleLowerCase()
    .split(/[^a-z0-9_-]+/i)
    .filter(Boolean);
  const meaningfulWords = words.filter((word) => !["a", "an", "the", "this", "that", "it", "its", "does", "do", "is", "are"].includes(word));
  if (question.trim().length < 8 || meaningfulWords.length < 2) return COMPLETE_QUESTION_MESSAGE;
  return "";
}

function semanticStatusNote(state: SemanticIndexState) {
  if (state.status === "warming") return "Semantic retrieval is warming; this answer used graph and keyword retrieval.";
  if (state.status === "error") return `Semantic retrieval is unavailable (${state.message}); this answer used graph and keyword retrieval.`;
  return undefined;
}
