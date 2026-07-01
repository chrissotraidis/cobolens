import type { ModelSettings } from "./config";
import { assertLocalOllamaUrl, normalizeOllamaBaseUrl } from "./privacy";

type OllamaReadinessOptions = {
  verifyGeneration?: boolean;
  tagsTimeoutMs?: number;
  generationTimeoutMs?: number;
};

export async function checkOllamaReadiness(settings: ModelSettings, options: OllamaReadinessOptions = {}) {
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
    throw new Error(`Ollama is reachable, but no local models are installed. Run: ollama pull ${configuredModel}`);
  }

  const hasModel = modelNames.some(
    (name) => name === configuredModel || name === `${configuredModel}:latest` || name.startsWith(`${configuredModel}:`),
  );
  if (!hasModel) {
    throw new Error(`Ollama is reachable, but ${configuredModel} is not installed. Run: ollama pull ${configuredModel}`);
  }

  if (!options.verifyGeneration) {
    return `Ollama is ready on localhost with ${configuredModel}.`;
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
      throw new Error(`Ollama is reachable, but ${configuredModel} did not finish a test generation. Try a smaller model or check Ollama logs.`);
    },
  );
  if (!generation.ok) {
    throw new Error(`Ollama generation responded with ${generation.status}. Check the model and server logs.`);
  }
  const generationBody = (await generation.json()) as { response?: string };
  if (!generationBody.response?.trim()) {
    throw new Error(`Ollama generation returned no text for ${configuredModel}. Check the model and try again.`);
  }

  return `Ollama is ready on localhost with ${configuredModel}; test generation returned text.`;
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
