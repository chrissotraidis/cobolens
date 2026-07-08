import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { canUseTauri } from "../lib/tauri";
import type { ModelProvider } from "../model/config";
import { isCloudProvider } from "../model/config";

export function useProviderKeyState(provider: ModelProvider) {
  const [keyDraft, setKeyDraft] = useState("");
  const [hasProviderKey, setHasProviderKey] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setKeyDraft("");
    setSettingsMessage("");
    if (!isCloudProvider(provider)) {
      setHasProviderKey(false);
      return;
    }
    if (!canUseTauri()) {
      setHasProviderKey(false);
      setSettingsMessage("Keychain is available in the desktop app.");
      return;
    }

    invoke<boolean>("provider_key_state", { provider })
      .then((result) => {
        if (!cancelled) setHasProviderKey(result);
      })
      .catch(() => {
        if (!cancelled) setHasProviderKey(false);
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  const saveKey = useCallback(async () => {
    if (!isCloudProvider(provider) || !keyDraft.trim()) return;
    if (!canUseTauri()) {
      setSettingsMessage("Keychain is available in the desktop app.");
      return;
    }
    try {
      await invoke("save_provider_key", {
        provider,
        apiKey: keyDraft.trim(),
      });
      setHasProviderKey(true);
      setKeyDraft("");
      setSettingsMessage("Key saved");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : String(err));
    }
  }, [keyDraft, provider]);

  const clearKey = useCallback(async () => {
    if (!isCloudProvider(provider)) return;
    if (!canUseTauri()) {
      setSettingsMessage("Keychain is available in the desktop app.");
      return;
    }
    try {
      await invoke("clear_provider_key", { provider });
      setHasProviderKey(false);
      setSettingsMessage("Key cleared");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : String(err));
    }
  }, [provider]);

  return {
    keyDraft,
    setKeyDraft,
    hasProviderKey,
    settingsMessage,
    saveKey,
    clearKey,
  };
}
