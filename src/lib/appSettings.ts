import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_MODELS,
  DEFAULT_MODEL_SETTINGS,
  ModelProvider,
  ModelSettings,
  isCloudProvider,
} from "../model/config";
import { canUseTauri } from "./tauri";

export type ScanFormat = "auto" | "fixed" | "free";

export type ScanSettings = {
  format: ScanFormat;
  extensions: string;
  encoding: string;
};

export type AppSettings = {
  schemaVersion: 1;
  model: ModelSettings;
  scan: ScanSettings;
};

const APP_SETTINGS_STORAGE_KEY = "cobolens.settings.v1";

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  format: "auto",
  extensions: ".cbl,.cob,.cpy,.jcl",
  encoding: "utf8",
};

export function normalizedScanSettings(settings: ScanSettings) {
  return {
    ...settings,
    extensions: settings.extensions
      .split(",")
      .map((extension) => extension.trim())
      .filter(Boolean)
      .map((extension) => extension.toLocaleLowerCase())
      .map((extension) => (extension.startsWith(".") ? extension : `.${extension}`))
      .join(","),
  };
}

export async function loadAppSettings(): Promise<AppSettings | null> {
  if (canUseTauri()) {
    const settings = await invoke<unknown>("load_app_settings");
    return normalizeAppSettings(settings);
  }

  try {
    const stored = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!stored) return null;
    return normalizeAppSettings(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveAppSettings(settings: AppSettings) {
  if (canUseTauri()) {
    await invoke("save_app_settings", { settings });
    return;
  }
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function normalizeAppSettings(value: unknown): AppSettings | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AppSettings>;
  return {
    schemaVersion: 1,
    model: normalizeModelSettings(raw.model),
    scan: normalizeSavedScanSettings(raw.scan),
  };
}

function normalizeModelSettings(value: unknown): ModelSettings {
  if (!value || typeof value !== "object") return DEFAULT_MODEL_SETTINGS;
  const raw = value as Partial<ModelSettings>;
  const provider = isModelProvider(raw.provider) ? raw.provider : DEFAULT_MODEL_SETTINGS.provider;
  return {
    provider,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model : DEFAULT_MODELS[provider],
    embeddingModel:
      provider === "ollama"
        ? typeof raw.embeddingModel === "string" && raw.embeddingModel.trim()
          ? raw.embeddingModel
          : DEFAULT_MODEL_SETTINGS.embeddingModel
        : "",
    baseUrl:
      provider === "ollama"
        ? typeof raw.baseUrl === "string" && raw.baseUrl.trim()
          ? displayOllamaBaseUrl(raw.baseUrl)
          : DEFAULT_MODEL_SETTINGS.baseUrl
        : "",
    privacyMode: isCloudProvider(provider) ? "cloud" : "local",
    rosettaLanguage:
      typeof raw.rosettaLanguage === "string" && raw.rosettaLanguage.trim()
        ? raw.rosettaLanguage
        : DEFAULT_MODEL_SETTINGS.rosettaLanguage,
  };
}

// Settings display and tooling use the bare Ollama origin; the "/api" path is
// an internal detail appended by normalizeOllamaBaseUrl at request time.
function displayOllamaBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/api$/, "") || DEFAULT_MODEL_SETTINGS.baseUrl;
}

function normalizeSavedScanSettings(value: unknown): ScanSettings {
  if (!value || typeof value !== "object") return DEFAULT_SCAN_SETTINGS;
  const raw = value as Partial<ScanSettings>;
  return normalizedScanSettings({
    format: isScanFormat(raw.format) ? raw.format : DEFAULT_SCAN_SETTINGS.format,
    extensions:
      typeof raw.extensions === "string" && raw.extensions.trim()
        ? raw.extensions
        : DEFAULT_SCAN_SETTINGS.extensions,
    encoding: typeof raw.encoding === "string" && raw.encoding.trim() ? raw.encoding : DEFAULT_SCAN_SETTINGS.encoding,
  });
}

function isModelProvider(value: unknown): value is ModelProvider {
  return value === "ollama" || value === "anthropic" || value === "openai" || value === "openrouter";
}

function isScanFormat(value: unknown): value is ScanFormat {
  return value === "auto" || value === "fixed" || value === "free";
}
