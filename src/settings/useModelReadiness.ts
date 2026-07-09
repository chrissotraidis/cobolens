import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { canUseTauri } from "../lib/tauri";
import {
  ModelProvider,
  ModelSettings,
  PROVIDER_LABELS,
  isCloudProvider,
  settingsForProvider,
} from "../model/config";
import { friendlyModelError, providerKeyForModel } from "../model/modelRuntime";
import { inspectOllamaReadiness, ollamaReadinessDetails } from "../model/readiness";
import type { ModelReadiness } from "./SettingsDialog";
import { createReadinessRequestTracker, modelReadinessKey } from "./readinessRequest";

// Large local models (e.g. a 12B) can take well over 12s to cold-start their
// first generation. Keep the readiness probe close to the Ask timeout so a
// capable local model that answers fine in Ask does not fail "Check AI".
const MODEL_READINESS_TIMEOUT_MS = 40_000;

export function useModelReadiness({
  modelSettings,
  onModelSettingsChange,
  hasProviderKey,
  settingsOpen,
}: {
  modelSettings: ModelSettings;
  onModelSettingsChange: Dispatch<SetStateAction<ModelSettings>>;
  hasProviderKey: boolean;
  settingsOpen: boolean;
}) {
  const [modelReadiness, setModelReadiness] = useState<ModelReadiness>({ status: "idle", message: "" });
  const readinessKey = modelReadinessKey(modelSettings, hasProviderKey);
  const requestTrackerRef = useRef<ReturnType<typeof createReadinessRequestTracker> | null>(null);
  if (!requestTrackerRef.current) {
    requestTrackerRef.current = createReadinessRequestTracker(readinessKey);
  } else {
    requestTrackerRef.current.syncKey(readinessKey);
  }
  const requestTracker = requestTrackerRef.current;

  useEffect(() => {
    setModelReadiness((current) => ({
      status: "idle",
      message: "",
      installedModels: isCloudProvider(modelSettings.provider) ? [] : current.installedModels,
      suggestedModel: isCloudProvider(modelSettings.provider) ? "" : current.suggestedModel,
    }));
  }, [modelSettings.provider, modelSettings.model, modelSettings.baseUrl, hasProviderKey]);

  const chooseProvider = useCallback(
    (provider: ModelProvider) => {
      onModelSettingsChange((current) => settingsForProvider(current, provider));
    },
    [onModelSettingsChange],
  );

  const prepareModelCall = useCallback(async () => {
    const request = requestTracker.begin();
    setModelReadiness({ status: "checking", message: "Checking AI settings" });
    try {
      if (isCloudProvider(modelSettings.provider)) {
        if (!canUseTauri()) {
          throw new Error("Cloud API keys are stored in the desktop keychain. Use the desktop app to check cloud AI settings.");
        }
        if (!hasProviderKey) {
          throw new Error(`Save a ${PROVIDER_LABELS[modelSettings.provider]} key before using cloud AI.`);
        }
        const apiKey = await providerKeyForModel(modelSettings);
        if (!requestTracker.isCurrent(request)) {
          throw new Error("AI settings changed while they were being checked. Try again.");
        }
        setModelReadiness({
          status: "ready",
          message: `${PROVIDER_LABELS[modelSettings.provider]} key is saved. Cloud calls happen only when you run AI Summary or non-graph Ask.`,
        });
        return apiKey;
      }

      const readiness = await inspectOllamaReadiness(modelSettings);
      if (!requestTracker.isCurrent(request)) {
        throw new Error("AI settings changed while they were being checked. Try again.");
      }
      setModelReadiness({ status: "ready", message: readiness.message, installedModels: readiness.installedModels });
      return undefined;
    } catch (err) {
      const requestIsCurrent = requestTracker.isCurrent(request);
      const message = friendlyModelError(err, modelSettings);
      const details = ollamaReadinessDetails(err);
      if (requestIsCurrent) {
        setModelReadiness((current) => ({
          status: "error",
          message,
          installedModels: details.installedModels.length ? details.installedModels : current.installedModels,
          suggestedModel: details.suggestedModel || current.suggestedModel,
        }));
      }
      throw new Error(message);
    }
  }, [hasProviderKey, modelSettings, requestTracker]);

  const checkModelReadiness = useCallback(async () => {
    if (isCloudProvider(modelSettings.provider)) {
      await prepareModelCall().catch(() => {});
      return;
    }
    const request = requestTracker.begin();
    try {
      setModelReadiness({ status: "checking", message: "Checking local generation with a quick probe" });
      const readiness = await inspectOllamaReadiness(modelSettings, {
        verifyGeneration: true,
        generationTimeoutMs: MODEL_READINESS_TIMEOUT_MS,
      });
      if (!requestTracker.isCurrent(request)) return;
      setModelReadiness({ status: "ready", message: readiness.message, installedModels: readiness.installedModels });
    } catch (err) {
      if (!requestTracker.isCurrent(request)) return;
      const details = ollamaReadinessDetails(err);
      setModelReadiness({
        status: "error",
        message: friendlyModelError(err, modelSettings),
        installedModels: details.installedModels,
        suggestedModel: details.suggestedModel,
      });
    }
  }, [modelSettings, prepareModelCall, requestTracker]);

  const refreshInstalledModels = useCallback(async () => {
    if (isCloudProvider(modelSettings.provider)) return;
    const request = requestTracker.begin();
    try {
      setModelReadiness((current) => ({
        status: "checking",
        message: "Reading installed Ollama models",
        installedModels: current.installedModels,
        suggestedModel: current.suggestedModel,
      }));
      const readiness = await inspectOllamaReadiness(modelSettings);
      if (!requestTracker.isCurrent(request)) return;
      setModelReadiness({
        status: "ready",
        message: `${readiness.installedModels.length} installed Ollama model${readiness.installedModels.length === 1 ? "" : "s"} found.`,
        installedModels: readiness.installedModels,
      });
    } catch (err) {
      if (!requestTracker.isCurrent(request)) return;
      const details = ollamaReadinessDetails(err);
      setModelReadiness({
        status: "error",
        message: friendlyModelError(err, modelSettings),
        installedModels: details.installedModels,
        suggestedModel: details.suggestedModel,
      });
    }
  }, [modelSettings, requestTracker]);

  const installedModelCount = modelReadiness.installedModels?.length ?? 0;
  useEffect(() => {
    if (!settingsOpen || isCloudProvider(modelSettings.provider)) return;
    if (installedModelCount) return;
    refreshInstalledModels().catch(() => {
      // Listing models is a convenience; failure leaves the text field usable.
    });
  }, [installedModelCount, modelSettings.provider, refreshInstalledModels, settingsOpen]);

  return {
    modelReadiness,
    chooseProvider,
    checkModelReadiness,
    refreshInstalledModels,
    prepareModelCall,
  };
}
