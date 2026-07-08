import { useEffect, useState } from "react";
import type { ScanSettings } from "../lib/appSettings";
import { loadAppSettings, normalizedScanSettings, saveAppSettings } from "../lib/appSettings";
import type { ModelSettings } from "../model/config";

export function useAppSettingsPersistence({
  modelSettings,
  scanSettings,
  onModelSettingsLoaded,
  onScanSettingsLoaded,
}: {
  modelSettings: ModelSettings;
  scanSettings: ScanSettings;
  onModelSettingsLoaded: (settings: ModelSettings) => void;
  onScanSettingsLoaded: (settings: ScanSettings) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAppSettings()
      .then((settings) => {
        if (cancelled || !settings) return;
        onModelSettingsLoaded(settings.model);
        onScanSettingsLoaded(settings.scan);
      })
      .catch(() => {
        // Settings are convenience state; defaults keep the app usable.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [onModelSettingsLoaded, onScanSettingsLoaded]);

  useEffect(() => {
    if (!loaded) return;
    const timeout = window.setTimeout(() => {
      saveAppSettings({
        schemaVersion: 1,
        model: modelSettings,
        scan: normalizedScanSettings(scanSettings),
      }).catch(() => {
        // Saving settings should never block codebase exploration.
      });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [loaded, modelSettings, scanSettings]);

  return loaded;
}
