import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import type { ModelSettings } from "./config";

export function createLanguageModel(settings: ModelSettings, apiKey?: string): LanguageModel {
  if (settings.provider === "ollama") {
    const ollama = createOllama({ baseURL: normalizeOllamaBaseUrl(settings.baseUrl) });
    return ollama.completion(settings.model);
  }

  if (!apiKey) {
    throw new Error(`${settings.provider} API key is not configured.`);
  }

  if (settings.provider === "anthropic") {
    return createAnthropic({ apiKey })(settings.model);
  }

  if (settings.provider === "openai") {
    return createOpenAI({ apiKey })(settings.model);
  }

  return createOpenRouter({ apiKey })(settings.model);
}

function normalizeOllamaBaseUrl(baseUrl: string) {
  const trimmed = (baseUrl || "http://127.0.0.1:11434/api").replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}
