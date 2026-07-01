import type { ModelSettings } from "./config";
import { assertLocalOllamaUrl, normalizeOllamaBaseUrl } from "./privacy";

export type EmbeddingResult = {
  model: string;
  vectors: number[][];
};

export type EmbedTextsOptions = {
  settings: ModelSettings;
  texts: string[];
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type OllamaEmbedResponse = {
  embeddings?: unknown;
};

export async function embedTexts({
  settings,
  texts,
  model,
  timeoutMs = 30_000,
  fetchImpl = fetch,
}: EmbedTextsOptions): Promise<EmbeddingResult> {
  const inputs = texts.map((text) => text.trim()).filter(Boolean);
  const embeddingModel = (model || settings.model).trim();
  assertEmbeddingPrivacy(settings);
  if (!inputs.length) return { model: embeddingModel, vectors: [] };

  const response = await fetchWithTimeout(
    ollamaEmbedUrl(settings.baseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: embeddingModel,
        input: inputs,
      }),
    },
    timeoutMs,
    fetchImpl,
  );
  if (!response.ok) {
    throw new Error(`Ollama embeddings responded with ${response.status}. Check the host and embedding model.`);
  }

  const body = (await response.json()) as OllamaEmbedResponse;
  const vectors = normalizeOllamaEmbeddings(body.embeddings);
  if (vectors.length !== inputs.length) {
    throw new Error(`Ollama returned ${vectors.length} embedding vector${vectors.length === 1 ? "" : "s"} for ${inputs.length} input text${inputs.length === 1 ? "" : "s"}.`);
  }
  return { model: embeddingModel, vectors };
}

export function assertEmbeddingPrivacy(settings: ModelSettings) {
  if (settings.privacyMode === "local") {
    if (settings.provider !== "ollama") {
      throw new Error("Local embedding mode only permits the Ollama provider.");
    }
    assertLocalOllamaUrl(settings.baseUrl);
    return;
  }
  throw new Error("Cloud embeddings are not implemented yet; no embedding request was sent.");
}

export function ollamaEmbedUrl(baseUrl: string) {
  return `${normalizeOllamaBaseUrl(baseUrl)}/embed`;
}

function normalizeOllamaEmbeddings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isEmbeddingVector);
}

function isEmbeddingVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error("Ollama embeddings timed out. Use a smaller local embedding model or check Ollama logs.");
    }
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
