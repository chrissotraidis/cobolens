import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import type { ModelSettings } from "./config";
import { assertLocalOllamaUrl, normalizeOllamaBaseUrl } from "./privacy";

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
