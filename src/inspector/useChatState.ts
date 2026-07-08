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

  function restoreChatAnswer(answer: ChatAnswer) {
    setChatQuestion(answer.question);
    setChatAnswer(answer);
    setChatStatus("ready");
    setChatError("");
    onTabChange("ask");
  }

  function clearChatHistory() {
    setChatHistory([]);
    setChatAnswer(null);
    setChatQuestion("");
    setChatStatus("idle");
    setChatError("");
  }

  function resetChatDraftForNavigation() {
    setChatQuestion("");
    setChatError("");
    if (chatStatus !== "running") setChatStatus("idle");
  }

  function resetChatForHome() {
    setChatQuestion("");
    setChatAnswer(null);
    setChatStatus("idle");
    setChatError("");
    onTabChange("summary");
  }

  function resetChatForProjectLoad() {
    setChatAnswer(null);
    setChatHistory([]);
    setChatQuestion("");
    setChatStatus("idle");
    setChatError("");
    onTabChange("summary");
  }

  return {
    chatQuestion,
    setChatQuestion,
    chatStatus,
    setChatStatus,
    chatAnswer,
    setChatAnswer,
    chatHistory,
    setChatHistory,
    chatError,
    setChatError,
    rememberChatAnswer,
    restoreChatAnswer,
    clearChatHistory,
    resetChatDraftForNavigation,
    resetChatForHome,
    resetChatForProjectLoad,
  };
}
