import { invoke } from "@tauri-apps/api/core";
import { canUseTauri } from "../lib/tauri";
import { isCloudProvider, PROVIDER_LABELS, type ModelSettings } from "./config";

const FIRST_TOKEN_TIMEOUT_MS = 30_000;

export async function providerKeyForModel(settings: ModelSettings) {
  if (!isCloudProvider(settings.provider)) return undefined;
  if (!canUseTauri()) {
    throw new Error("Cloud API keys are stored in the desktop keychain. Use the desktop app to call cloud providers.");
  }
  return invoke<string>("read_provider_key", { provider: settings.provider });
}

export async function runStreamingModelCall<T>(
  label: string,
  activeControllerRef: { current: AbortController | null },
  task: (abortSignal: AbortSignal, noteFirstToken: () => void) => Promise<T>,
) {
  activeControllerRef.current?.abort();
  const controller = new AbortController();
  let timedOutBeforeFirstToken = false;
  let sawFirstToken = false;
  activeControllerRef.current = controller;
  const timeout = window.setTimeout(() => {
    if (sawFirstToken) return;
    timedOutBeforeFirstToken = true;
    controller.abort();
  }, FIRST_TOKEN_TIMEOUT_MS);
  const noteFirstToken = () => {
    if (sawFirstToken) return;
    sawFirstToken = true;
    window.clearTimeout(timeout);
  };

  try {
    return await task(controller.signal, noteFirstToken);
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) {
      const seconds = Math.round(FIRST_TOKEN_TIMEOUT_MS / 1000);
      throw new Error(
        timedOutBeforeFirstToken
          ? `${label} did not receive any model text within ${seconds}s. Stop is available; check AI readiness, try a smaller local model, or switch providers.`
          : `${label} was stopped.`,
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
    if (activeControllerRef.current === controller) {
      activeControllerRef.current = null;
    }
  }
}

export function friendlyModelError(err: unknown, settings: ModelSettings) {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "Failed to fetch" && settings.provider === "ollama") {
    return `Could not reach Ollama at ${settings.baseUrl}. If Ollama is installed, start it with: ollama serve. Otherwise check the host or switch providers.`;
  }
  if (message === "Failed to fetch") {
    return `Could not reach ${PROVIDER_LABELS[settings.provider]}. Check the provider settings and try again.`;
  }
  return message;
}

export function isStoppedModelCall(message: string) {
  return /\bwas stopped\.$/i.test(message);
}

export function semanticEmbeddingModelKey(settings: ModelSettings) {
  return `${settings.provider}|${settings.baseUrl}|${settings.embeddingModel || settings.model}`;
}

function isAbortError(err: unknown) {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || /\babort(?:ed)?\b/i.test(err.message);
}
