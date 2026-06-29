export type ModelProvider = "ollama" | "anthropic" | "openai" | "openrouter";
export type PrivacyMode = "local" | "cloud";

export type ModelSettings = {
  provider: ModelProvider;
  model: string;
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

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: "ollama",
  model: DEFAULT_MODELS.ollama,
  baseUrl: "http://127.0.0.1:11434/api",
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
    privacyMode: isCloudProvider(provider) ? "cloud" : "local",
    baseUrl: provider === "ollama" ? current.baseUrl || DEFAULT_MODEL_SETTINGS.baseUrl : "",
  };
}
