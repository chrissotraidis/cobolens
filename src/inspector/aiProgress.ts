import { useEffect, useState } from "react";
import { PROVIDER_LABELS, type ModelSettings } from "../model/config";
import { RECOMMENDED_SMALL_OLLAMA_MODEL } from "../model/readiness";

export function useElapsedSeconds(active: boolean) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    setElapsedSeconds(0);
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [active]);

  return elapsedSeconds;
}

export function aiProgressDetail(settings: ModelSettings, elapsedSeconds: number, hasStreamingText = false) {
  if (hasStreamingText) {
    return "Streaming draft text. Final citations are checked before the answer is trusted.";
  }
  if (settings.provider === "ollama") {
    if (elapsedSeconds >= 70) {
      return `Still waiting on local Ollama. Stop is available, and if this repeats try ${RECOMMENDED_SMALL_OLLAMA_MODEL} or a smaller model.`;
    }
    if (elapsedSeconds >= 20) {
      return "Still waiting for first local model text. Code stays on this machine, and you can stop the request without losing the graph answer path.";
    }
    return elapsedSeconds >= 8
      ? "Waiting for first local model text; code stays on this machine."
      : "Using local Ollama; no code leaves this machine.";
  }

  return elapsedSeconds >= 8
    ? `Waiting on ${PROVIDER_LABELS[settings.provider]}; only the retrieved code slice was sent.`
    : `Using ${PROVIDER_LABELS[settings.provider]} with cited graph context.`;
}
