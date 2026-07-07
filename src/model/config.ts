export type ModelProvider = "ollama" | "anthropic" | "openai" | "openrouter";
export type PrivacyMode = "local" | "cloud";

export type ModelSettings = {
  provider: ModelProvider;
  model: string;
  embeddingModel: string;
  baseUrl: string;
  privacyMode: PrivacyMode;
  rosettaLanguage: string;
};

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  ollama: "Ollama",
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

export const DEFAULT_MODELS: Record<ModelProvider, string> = {
  ollama: "llama3.2",
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-5-mini",
  openrouter: "anthropic/claude-sonnet-4.5",
};

// Embedding-tuned local model used for semantic retrieval. Generation models
// can emit vectors too, but retrieval quality needs an embedding model.
export const DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: "ollama",
  model: DEFAULT_MODELS.ollama,
  embeddingModel: DEFAULT_OLLAMA_EMBEDDING_MODEL,
  baseUrl: "http://127.0.0.1:11434",
  privacyMode: "local",
  rosettaLanguage: "python",
};

export function isCloudProvider(provider: ModelProvider) {
  return provider !== "ollama";
}

export function settingsForProvider(current: ModelSettings, provider: ModelProvider): ModelSettings {
  return {
    ...current,
    provider,
    model: DEFAULT_MODELS[provider],
    embeddingModel: provider === "ollama" ? current.embeddingModel || DEFAULT_OLLAMA_EMBEDDING_MODEL : "",
    privacyMode: isCloudProvider(provider) ? "cloud" : "local",
    baseUrl: provider === "ollama" ? current.baseUrl || DEFAULT_MODEL_SETTINGS.baseUrl : "",
  };
}
