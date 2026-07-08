import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
        setModelReadiness({
          status: "ready",
          message: `${PROVIDER_LABELS[modelSettings.provider]} key is saved. Cloud calls happen only when you run AI Summary or non-graph Ask.`,
        });
        return apiKey;
      }

      const readiness = await inspectOllamaReadiness(modelSettings);
      setModelReadiness({ status: "ready", message: readiness.message, installedModels: readiness.installedModels });
      return undefined;
    } catch (err) {
      const message = friendlyModelError(err, modelSettings);
      const details = ollamaReadinessDetails(err);
      setModelReadiness((current) => ({
        status: "error",
        message,
        installedModels: details.installedModels.length ? details.installedModels : current.installedModels,
        suggestedModel: details.suggestedModel || current.suggestedModel,
      }));
      throw new Error(message);
    }
  }, [hasProviderKey, modelSettings]);

  const checkModelReadiness = useCallback(async () => {
    try {
      if (!isCloudProvider(modelSettings.provider)) {
        setModelReadiness({ status: "checking", message: "Checking local generation with a quick probe" });
        const readiness = await inspectOllamaReadiness(modelSettings, {
          verifyGeneration: true,
          generationTimeoutMs: MODEL_READINESS_TIMEOUT_MS,
        });
        setModelReadiness({ status: "ready", message: readiness.message, installedModels: readiness.installedModels });
        return;
      }
      await prepareModelCall();
    } catch (err) {
      const details = ollamaReadinessDetails(err);
      setModelReadiness({
        status: "error",
        message: friendlyModelError(err, modelSettings),
        installedModels: details.installedModels,
        suggestedModel: details.suggestedModel,
      });
    }
  }, [modelSettings, prepareModelCall]);

  const refreshInstalledModels = useCallback(async () => {
    if (isCloudProvider(modelSettings.provider)) return;
    try {
      setModelReadiness((current) => ({
        status: "checking",
        message: "Reading installed Ollama models",
        installedModels: current.installedModels,
        suggestedModel: current.suggestedModel,
      }));
      const readiness = await inspectOllamaReadiness(modelSettings);
      setModelReadiness({
        status: "ready",
        message: `${readiness.installedModels.length} installed Ollama model${readiness.installedModels.length === 1 ? "" : "s"} found.`,
        installedModels: readiness.installedModels,
      });
    } catch (err) {
      const details = ollamaReadinessDetails(err);
      setModelReadiness({
        status: "error",
        message: friendlyModelError(err, modelSettings),
        installedModels: details.installedModels,
        suggestedModel: details.suggestedModel,
      });
    }
  }, [modelSettings]);

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
