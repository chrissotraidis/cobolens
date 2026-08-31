import { useState } from "react";
import type { ChatAnswer, ChatStatus } from "./ChatAnswerPanel";
import type { InspectorTab } from "./InspectorTabs";
import { rememberRecentChatAnswer } from "./chatHistory";

export function useChatState({ onTabChange }: { onTabChange: (tab: InspectorTab) => void }) {
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [chatAnswer, setChatAnswer] = useState<ChatAnswer | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatAnswer[]>([]);
  const [chatError, setChatError] = useState("");

  function rememberChatAnswer(answer: ChatAnswer) {
    setChatHistory((current) => rememberRecentChatAnswer(current, answer));
  }

  function updateChatQuestion(question: string) {
    setChatQuestion(question);
    if (chatStatus === "error") {
      setChatError("");
      setChatStatus("idle");
    }
  }

  function resetChatDraftForNavigation() {
    setChatQuestion("");
    setChatAnswer(null);
    setChatError("");
    if (chatStatus !== "running") setChatStatus("idle");
  }

  function resetChatForHome() {
    setChatQuestion("");
    setChatAnswer(null);
    setChatStatus("idle");
    setChatError("");
    onTabChange("ask");
  }

  function resetChatForProjectLoad() {
    setChatAnswer(null);
    setChatHistory([]);
    setChatQuestion("");
    setChatStatus("idle");
    setChatError("");
    onTabChange("ask");
  }

  return {
    chatQuestion,
    setChatQuestion,
    updateChatQuestion,
    chatStatus,
    setChatStatus,
    chatAnswer,
    setChatAnswer,
    chatHistory,
    chatError,
    setChatError,
    rememberChatAnswer,
    resetChatDraftForNavigation,
    resetChatForHome,
    resetChatForProjectLoad,
  };
}
