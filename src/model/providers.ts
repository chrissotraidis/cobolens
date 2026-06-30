import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import type { ModelSettings } from "./config";

export function createLanguageModel(settings: ModelSettings, apiKey?: string): LanguageModel {
  if (settings.privacyMode === "local" && settings.provider !== "ollama") {
    throw new Error("Local mode only permits the Ollama provider.");
  }

  if (settings.provider === "ollama") {
    assertLocalOllamaUrl(settings.baseUrl);
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

export function assertLocalOllamaUrl(baseUrl: string) {
  const parsed = new URL(baseUrl || "http://127.0.0.1:11434/api");
  const host = parsed.hostname.toLocaleLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error("Local mode only permits Ollama on localhost.");
  }
}

export function normalizeOllamaBaseUrl(baseUrl: string) {
  const trimmed = (baseUrl || "http://127.0.0.1:11434/api").replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}
