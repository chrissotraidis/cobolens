import type { ModelSettings } from "./config";
import { assertLocalOllamaUrl, normalizeOllamaBaseUrl } from "./privacy";

export const RECOMMENDED_SMALL_OLLAMA_MODEL = "llama3.2:1b";

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
  suggestedModel: string;

  constructor(
    message: string,
    configuredModel: string,
    installedModels: string[] = [],
    suggestedModel = RECOMMENDED_SMALL_OLLAMA_MODEL,
  ) {
    super(message);
    this.name = "OllamaReadinessError";
    this.configuredModel = configuredModel;
    this.installedModels = installedModels;
    this.suggestedModel = suggestedModel;
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
    throw new Error(
      `Could not reach Ollama at ${settings.baseUrl}. If Ollama is installed, start it with: ollama serve. Otherwise install it from ollama.com, then run: ollama pull ${settings.model.trim() || "llama3.2"}.`,
    );
  });
  if (!response.ok) {
    throw new Error(`Ollama responded with ${response.status}. Check the host and try again.`);
  }

  const body = (await response.json()) as { models?: Array<{ name?: string }> };
  const modelNames = body.models?.map((model) => model.name).filter((name): name is string => Boolean(name)) ?? [];
  if (!modelNames.length) {
    throw new OllamaReadinessError(`Ollama is reachable, but no local models are installed. Run: ollama pull ${configuredModel}`, configuredModel);
  }

  // Match only the exact tag (or the :latest a bare name resolves to). A
  // different tag such as llama3.2:1b does NOT satisfy a configured llama3.2:
  // Ollama resolves a bare name to :latest and 404s on generate otherwise, so
  // accepting the variant here would green-light a model that cannot run.
  const hasModel = modelNames.some((name) => isSameOllamaModel(name, configuredModel));
  if (!hasModel) {
    const variantHint = variantSuggestion(modelNames, configuredModel);
    throw new OllamaReadinessError(
      `Ollama is reachable, but ${configuredModel} is not installed.${variantHint} Use an installed model below or run: ollama pull ${configuredModel}.`,
      configuredModel,
      modelNames,
    );
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
        // Disable reasoning for the probe: a thinking model left to "think"
        // spends the whole num_predict budget on hidden chain-of-thought and
        // returns empty answer text, failing an otherwise-working model.
        // think:false is a no-op on non-reasoning models.
        think: false,
        options: {
          num_predict: 160,
          temperature: 0,
        },
      }),
    },
    generationTimeoutMs,
    () => {
      throw new OllamaReadinessError(
        `Ollama is reachable, but ${configuredModel} did not finish a test generation. Use a listed local model, install the smaller model shown below, or check Ollama logs.`,
        configuredModel,
        modelNames,
      );
    },
  );
  if (!generation.ok) {
    throw new OllamaReadinessError(`Ollama generation responded with ${generation.status}. Use a listed local model, install the smaller model shown below, or check Ollama logs.`, configuredModel, modelNames);
  }
  const generationBody = (await generation.json()) as { response?: string };
  if (!generationBody.response?.trim()) {
    throw new OllamaReadinessError(`Ollama generation returned no text for ${configuredModel}. Use a listed local model, install the smaller model shown below, or check Ollama logs.`, configuredModel, modelNames);
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
      suggestedModel: err.suggestedModel,
    };
  }
  return {
    configuredModel: "",
    installedModels: [],
    suggestedModel: "",
  };
}

export function isSameOllamaModel(left: string, right: string) {
  return normalizeModelName(left) === normalizeModelName(right);
}

function normalizeModelName(model: string) {
  return model.trim().replace(/:latest$/, "");
}

// When a differently-tagged variant of the configured base is installed
// (config llama3.2, installed llama3.2:1b), name the exact installed tag so the
// user can pick it instead of guessing why a "reachable" model 404s.
function variantSuggestion(installedModels: string[], configuredModel: string) {
  const base = configuredModel.trim().split(":")[0].toLocaleLowerCase();
  if (!base) return "";
  const variants = installedModels.filter((name) => {
    const [candidateBase] = name.split(":");
    return candidateBase.toLocaleLowerCase() === base && !isSameOllamaModel(name, configuredModel);
  });
  if (!variants.length) return "";
  return ` You have ${variants.join(", ")} installed with a different tag.`;
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
