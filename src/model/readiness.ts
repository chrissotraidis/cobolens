import type { ModelSettings } from "./config";
import { assertLocalOllamaUrl, normalizeOllamaBaseUrl } from "./privacy";

type OllamaReadinessOptions = {
  verifyGeneration?: boolean;
  tagsTimeoutMs?: number;
  generationTimeoutMs?: number;
};

export type OllamaReadinessResult = {
  message: string;
  configuredModel: string;
  installedModels: string[];
};

export class OllamaReadinessError extends Error {
  configuredModel: string;
  installedModels: string[];

  constructor(message: string, configuredModel: string, installedModels: string[] = []) {
    super(message);
    this.name = "OllamaReadinessError";
    this.configuredModel = configuredModel;
    this.installedModels = installedModels;
  }
}

export async function checkOllamaReadiness(settings: ModelSettings, options: OllamaReadinessOptions = {}) {
  return (await inspectOllamaReadiness(settings, options)).message;
}

export async function inspectOllamaReadiness(settings: ModelSettings, options: OllamaReadinessOptions = {}): Promise<OllamaReadinessResult> {
  assertLocalOllamaUrl(settings.baseUrl);
  const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
  const tagsTimeoutMs = options.tagsTimeoutMs ?? 2500;
  const generationTimeoutMs = options.generationTimeoutMs ?? 45_000;
  const configuredModel = settings.model.trim();

  const response = await fetchWithTimeout(`${baseUrl}/tags`, { method: "GET" }, tagsTimeoutMs, () => {
    throw new Error(`Could not reach Ollama at ${settings.baseUrl}. Start Ollama or check the host.`);
  });
  if (!response.ok) {
    throw new Error(`Ollama responded with ${response.status}. Check the host and try again.`);
  }

  const body = (await response.json()) as { models?: Array<{ name?: string }> };
  const modelNames = body.models?.map((model) => model.name).filter((name): name is string => Boolean(name)) ?? [];
  if (!modelNames.length) {
    throw new OllamaReadinessError(`Ollama is reachable, but no local models are installed. Run: ollama pull ${configuredModel}`, configuredModel);
  }

  const hasModel = modelNames.some(
    (name) => name === configuredModel || name === `${configuredModel}:latest` || name.startsWith(`${configuredModel}:`),
  );
  if (!hasModel) {
    throw new OllamaReadinessError(`Ollama is reachable, but ${configuredModel} is not installed. Use an installed model below or run: ollama pull ${configuredModel}`, configuredModel, modelNames);
  }

  if (!options.verifyGeneration) {
    return {
      message: `Ollama is ready on localhost with ${configuredModel}.`,
      configuredModel,
      installedModels: modelNames,
    };
  }

  const generation = await fetchWithTimeout(
    `${baseUrl}/generate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: configuredModel,
        prompt: "Reply with one short sentence that says local inference is ready.",
        stream: false,
        options: {
          num_predict: 24,
          temperature: 0,
        },
      }),
    },
    generationTimeoutMs,
    () => {
      throw new OllamaReadinessError(
        `Ollama is reachable, but ${configuredModel} did not finish a test generation. Use an installed model below or check Ollama logs.`,
        configuredModel,
        modelNames,
      );
    },
  );
  if (!generation.ok) {
    throw new OllamaReadinessError(`Ollama generation responded with ${generation.status}. Use an installed model below or check Ollama logs.`, configuredModel, modelNames);
  }
  const generationBody = (await generation.json()) as { response?: string };
  if (!generationBody.response?.trim()) {
    throw new OllamaReadinessError(`Ollama generation returned no text for ${configuredModel}. Use an installed model below or check Ollama logs.`, configuredModel, modelNames);
  }

  return {
    message: `Ollama is ready on localhost with ${configuredModel}; test generation returned text.`,
    configuredModel,
    installedModels: modelNames,
  };
}

export function ollamaReadinessDetails(err: unknown) {
  if (err instanceof OllamaReadinessError) {
    return {
      configuredModel: err.configuredModel,
      installedModels: err.installedModels,
    };
  }
  return {
    configuredModel: "",
    installedModels: [],
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  onTimeout: () => never,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (isAbortError(err)) onTimeout();
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || /\babort(?:ed)?\b/i.test(err.message);
}
