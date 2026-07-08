import { useMemo, useRef } from "react";
import type { GraphDocument, GraphNode, SourceExcerpt } from "../lib/graph";
import type { ModelSettings } from "../model/config";
import { generateGroundedAnswer } from "../model/chat";
import { embedTexts } from "../model/embeddings";
import {
  friendlyModelError,
  isStoppedModelCall,
  runStreamingModelCall,
  semanticEmbeddingModelKey,
} from "../model/modelRuntime";
import { retrieveQuestionContext, type RetrievedContext } from "../retrieval/context";
import { graphAnswerFallback, isGraphQuestion } from "../retrieval/graphAnswer";
import {
  createLocalStorageSemanticVectorStore,
  semanticGraphIndexKey,
  semanticSearchGraph,
} from "../retrieval/semantic";
import { shouldSyncAskFocus } from "../retrieval/askFocus";
import type { ChatAnswer, ChatStatus } from "./ChatAnswerPanel";
import type { InspectorTab } from "./InspectorTabs";

const SEMANTIC_SEARCH_TIMEOUT_MS = 8_000;

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
  onExplainSelectedNode,
  onTabChange,
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
  onExplainSelectedNode: () => void;
  onTabChange: (tab: InspectorTab) => void;
}) {
  const activeChatAbortRef = useRef<AbortController | null>(null);
  const semanticVectorStore = useMemo(() => {
    try {
      return createLocalStorageSemanticVectorStore(window.localStorage);
    } catch {
      return undefined;
    }
  }, []);

  async function askQuestion(questionDraft = chatQuestion) {
    if (!graph || !questionDraft.trim()) return;
    const question = questionDraft.trim();
    setChatQuestion(question);
    setChatStatus("running");
    setChatAnswer(null);
    setChatError("");
    let context: RetrievedContext | null = null;

    try {
      context = await retrieveQuestionContext({
        graph,
        question,
        preferredNode: selectedNode,
        readExcerpt: readExcerptForNode,
        semanticSearch: isGraphQuestion(question)
          ? undefined
          : (semanticQuestion) =>
              semanticSearchGraph({
                graph,
                question: semanticQuestion,
                indexKey: semanticGraphIndexKey(graph, semanticEmbeddingModelKey(modelSettings)),
                vectorStore: semanticVectorStore,
                embedTexts: (texts) =>
                  embedTexts({
                    settings: modelSettings,
                    texts,
                    timeoutMs: SEMANTIC_SEARCH_TIMEOUT_MS,
                  }),
              }),
      });
      if (isGraphQuestion(question)) {
        const fallback = graphAnswerFallback(graph, question, context);
        const graphAnswer: ChatAnswer = { question, text: fallback.text, citations: fallback.citations, source: "graph" };
        setChatAnswer(graphAnswer);
        rememberChatAnswer(graphAnswer);
        setChatStatus("ready");
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
      const displayedAnswer = answer.guarded
        ? graphAnswerFallback(
            graph,
            question,
            answerContext,
            `model answer had ${answer.guardReason ?? "citation issues"}`,
          )
        : { text: answer.text, citations: answerContext.citations };
      const modelAnswer: ChatAnswer = {
        question,
        text: displayedAnswer.text,
        citations: displayedAnswer.citations,
        source: answer.guarded ? "graph" : "model",
        guarded: answer.guarded,
        semanticNote: answerContext.semanticError
          ? `Semantic search was unavailable (${answerContext.semanticError}) so this answer used graph and keyword retrieval only.`
          : undefined,
      };
      setChatAnswer(modelAnswer);
      rememberChatAnswer(modelAnswer);
      setChatStatus("ready");
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
        const fallbackAnswer: ChatAnswer = { question, text: fallback.text, citations: fallback.citations, source: "graph", fallbackReason };
        setChatAnswer(fallbackAnswer);
        rememberChatAnswer(fallbackAnswer);
        setChatStatus("ready");
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

  function askPresetQuestion(question: string) {
    if (selectedNode && question === `Explain ${selectedNode.name} from the graph.`) {
      onExplainSelectedNode();
      return;
    }
    if (!isGraphQuestion(question)) {
      setChatQuestion(question);
      setChatAnswer(null);
      setChatError("");
      setChatStatus("idle");
      onTabChange("ask");
      return;
    }
    askQuestion(question);
  }

  function askCurrentQuestion() {
    askQuestion();
  }

  function cancelAsk() {
    activeChatAbortRef.current?.abort();
  }

  return {
    askQuestion,
    askCurrentQuestion,
    askAboutSelectedNode,
    askPresetQuestion,
    cancelAsk,
  };
}
