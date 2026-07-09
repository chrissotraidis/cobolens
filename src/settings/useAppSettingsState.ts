import { useCallback, useState } from "react";
import {
  DEFAULT_SCAN_SETTINGS,
  type ScanSettings,
} from "../lib/appSettings";
import {
  DEFAULT_MODEL_SETTINGS,
  type ModelSettings,
  isCloudProvider,
} from "../model/config";
import { useAppSettingsPersistence } from "./useAppSettingsPersistence";
import { useModelReadiness } from "./useModelReadiness";
import { useProviderKeyState } from "./useProviderKeyState";

export function useAppSettingsState() {
  const [scanSettings, setScanSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS);
  const [modelSettings, setModelSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelCallCount, setModelCallCount] = useState(0);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const {
    keyDraft,
    setKeyDraft,
    hasProviderKey,
    settingsMessage,
    saveKey,
    clearKey,
  } = useProviderKeyState(modelSettings.provider);
  const {
    modelReadiness,
    chooseProvider,
    checkModelReadiness,
    refreshInstalledModels,
    prepareModelCall,
  } = useModelReadiness({
    modelSettings,
    onModelSettingsChange: setModelSettings,
    hasProviderKey,
    settingsOpen,
  });

  useAppSettingsPersistence({
    modelSettings,
    scanSettings,
    onModelSettingsLoaded: setModelSettings,
    onScanSettingsLoaded: setScanSettings,
  });

  const noteModelCallComplete = useCallback(() => {
    setModelCallCount((count) => count + 1);
  }, []);
  const hasLocalAiConfig = Boolean(modelSettings.model.trim() && modelSettings.baseUrl.trim());
  const aiConfigured = isCloudProvider(modelSettings.provider)
    ? hasProviderKey
    : hasLocalAiConfig && modelReadiness.status !== "error";

  return {
    scanSettings,
    setScanSettings,
    modelSettings,
    setModelSettings,
    settingsOpen,
    openSettings,
    closeSettings,
    modelCallCount,
    noteModelCallComplete,
    keyDraft,
    setKeyDraft,
    hasProviderKey,
    settingsMessage,
    saveKey,
    clearKey,
    modelReadiness,
    chooseProvider,
    checkModelReadiness,
    refreshInstalledModels,
    prepareModelCall,
    aiConfigured,
  };
}
