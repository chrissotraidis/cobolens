import { useEffect, useRef, useState } from "react";
import { DEFAULT_OLLAMA_EMBEDDING_MODEL, ModelProvider, ModelSettings, PROVIDER_LABELS, isCloudProvider } from "../model/config";
import { RECOMMENDED_SMALL_OLLAMA_MODEL, isSameOllamaModel } from "../model/readiness";
import type { SemanticIndexState } from "../retrieval/useSemanticIndex";
import type { ScanFormat, ScanSettings } from "../lib/appSettings";

export type ModelReadiness = {
  status: "idle" | "checking" | "ready" | "error";
  message: string;
  installedModels?: string[];
  suggestedModel?: string;
};

type ReadinessStepStatus = "ready" | "checking" | "error" | "pending";

type ReadinessStep = {
  label: string;
  status: ReadinessStepStatus;
  detail: string;
  command?: string;
};

export function SettingsDialog({
  desktopAvailable,
  scanSettings,
  scanDisabled,
  modelSettings,
  keyDraft,
  hasProviderKey,
  settingsMessage,
  modelReadiness,
  modelCallCount,
  bulkTokenEstimate,
  onScanSettingsChange,
  onProviderChange,
  onModelSettingsChange,
  onKeyDraftChange,
  onSaveKey,
  onClearKey,
  onCheckModel,
  onWarmSemanticIndex,
  onRefreshModels,
  semanticIndex,
  onClose,
}: {
  desktopAvailable: boolean;
  scanSettings: ScanSettings;
  scanDisabled: boolean;
  modelSettings: ModelSettings;
  keyDraft: string;
  hasProviderKey: boolean;
  settingsMessage: string;
  modelReadiness: ModelReadiness;
  modelCallCount: number;
  bulkTokenEstimate: number;
  onScanSettingsChange: (settings: ScanSettings) => void;
  onProviderChange: (provider: ModelProvider) => void;
  onModelSettingsChange: (settings: ModelSettings) => void;
  onKeyDraftChange: (value: string) => void;
  onSaveKey: () => void;
  onClearKey: () => void;
  onCheckModel: () => void;
  onWarmSemanticIndex: () => void;
  onRefreshModels: () => void;
  onClose: () => void;
  semanticIndex: SemanticIndexState;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    return () => {
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="settings-dialog-header">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Graph answers work without AI. Configure AI only for generated summaries and broader Ask answers.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings">
            Close
          </button>
        </div>
        <ModelSettingsPanel
          settings={modelSettings}
          keyDraft={keyDraft}
          hasProviderKey={hasProviderKey}
          message={settingsMessage}
          onProviderChange={onProviderChange}
          onSettingsChange={onModelSettingsChange}
          onKeyDraftChange={onKeyDraftChange}
          onSaveKey={onSaveKey}
          onClearKey={onClearKey}
          onCheckModel={onCheckModel}
          onWarmSemanticIndex={onWarmSemanticIndex}
          onRefreshModels={onRefreshModels}
          modelReadiness={modelReadiness}
          semanticIndex={semanticIndex}
          modelCallCount={modelCallCount}
          bulkTokenEstimate={bulkTokenEstimate}
        />
        <section className="settings-section">
          <h2>Scanning</h2>
          {desktopAvailable ? (
            <ScanSettingsPanel settings={scanSettings} disabled={scanDisabled} onSettingsChange={onScanSettingsChange} />
          ) : (
            <div className="desktop-preview-note">Scan settings apply when Cobolens is running as the desktop app.</div>
          )}
        </section>
      </section>
    </div>
  );
}

function ScanSettingsPanel({
  settings,
  disabled,
  onSettingsChange,
}: {
  settings: ScanSettings;
  disabled: boolean;
  onSettingsChange: (settings: ScanSettings) => void;
}) {
  return (
    <div className="scan-settings" aria-label="Scan settings">
      <label className="form-row">
        <span>Format</span>
        <select
          value={settings.format}
          disabled={disabled}
          onChange={(event) => onSettingsChange({ ...settings, format: event.currentTarget.value as ScanFormat })}
        >
          <option value="auto">Auto</option>
          <option value="fixed">Fixed</option>
          <option value="free">Free</option>
        </select>
      </label>
      <label className="form-row">
        <span>Extensions</span>
        <input
          value={settings.extensions}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => onSettingsChange({ ...settings, extensions: event.currentTarget.value })}
        />
      </label>
      <label className="form-row">
        <span>Encoding</span>
        <select
          value={settings.encoding}
          disabled={disabled}
          onChange={(event) => onSettingsChange({ ...settings, encoding: event.currentTarget.value })}
        >
          <option value="utf8">UTF-8</option>
          <option value="cp037">CP037 / EBCDIC US</option>
        </select>
      </label>
    </div>
  );
}

function ModelSettingsPanel({
  settings,
  keyDraft,
  hasProviderKey,
  message,
  modelCallCount,
  bulkTokenEstimate,
  onProviderChange,
  onSettingsChange,
  onKeyDraftChange,
  onSaveKey,
  onClearKey,
  onCheckModel,
  onWarmSemanticIndex,
  onRefreshModels,
  modelReadiness,
  semanticIndex,
}: {
  settings: ModelSettings;
  keyDraft: string;
  hasProviderKey: boolean;
  message: string;
  modelCallCount: number;
  bulkTokenEstimate: number;
  onProviderChange: (provider: ModelProvider) => void;
  onSettingsChange: (settings: ModelSettings) => void;
  onKeyDraftChange: (value: string) => void;
  onSaveKey: () => void;
  onClearKey: () => void;
  onCheckModel: () => void;
  onWarmSemanticIndex: () => void;
  onRefreshModels: () => void;
  modelReadiness: ModelReadiness;
  semanticIndex: SemanticIndexState;
}) {
  const cloud = isCloudProvider(settings.provider);
  const installedModels = cloud ? [] : modelReadiness.installedModels ?? [];
  const modelInList = installedModels.some((model) => isSameOllamaModel(model, settings.model));
  const loadingModels = !cloud && modelReadiness.status === "checking";
  const [customMode, setCustomMode] = useState(false);
  const suggestedModel = !cloud && modelReadiness.status === "error" ? modelReadiness.suggestedModel : "";
  const showSuggestedModel =
    Boolean(suggestedModel) && !installedModels.some((model) => suggestedModel && isSameOllamaModel(model, suggestedModel));
  const readinessSteps = aiReadinessSteps({
    settings,
    cloud,
    hasProviderKey,
    installedModels,
    modelInList,
    modelReadiness,
    semanticIndex,
  });
  const semanticBusy = semanticIndex.status === "warming";

  return (
    <section className="pane-block model-settings">
      <h2>AI</h2>
      <details className="answer-mode-help settings-answer-mode">
        <summary>How answers work</summary>
        <ul>
          <li>Graph uses the parsed dependency graph and source lines. No AI.</li>
          <li>{PROVIDER_LABELS[settings.provider]} uses retrieved graph and source context.</li>
          <li>Semantic retrieval uses local embeddings when the index is ready.</li>
        </ul>
      </details>
      <ol className="readiness-stepper" aria-label="AI setup readiness">
        {readinessSteps.map((step, index) => (
          <li key={step.label} className={`readiness-step ${step.status}`}>
            <span className="readiness-step-index" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
              {step.command ? <code>{step.command}</code> : null}
            </div>
          </li>
        ))}
      </ol>
      <label className="form-row">
        <span>Provider</span>
        <select
          value={settings.provider}
          onChange={(event) => onProviderChange(event.currentTarget.value as ModelProvider)}
        >
          {Object.entries(PROVIDER_LABELS).map(([provider, label]) => (
            <option key={provider} value={provider}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {cloud ? (
        <label className="form-row">
          <span>Model</span>
          <input
            value={settings.model}
            spellCheck={false}
            onChange={(event) => onSettingsChange({ ...settings, model: event.currentTarget.value })}
          />
        </label>
      ) : (
        <div className="model-picker">
          <label className="form-row">
            <span>Model</span>
            <select
              value={modelInList && !customMode ? settings.model : "__custom__"}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === "__custom__") {
                  setCustomMode(true);
                  return;
                }
                setCustomMode(false);
                onSettingsChange({ ...settings, model: value });
              }}
            >
              {installedModels.length ? (
                installedModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                    {isSameOllamaModel(model, RECOMMENDED_SMALL_OLLAMA_MODEL) ? "  (fast)" : ""}
                  </option>
                ))
              ) : (
                <option value={settings.model || "__custom__"} disabled>
                  {loadingModels ? "Loading installed models…" : "No models found — start Ollama, then Refresh"}
                </option>
              )}
              <option value="__custom__">Custom name…</option>
            </select>
          </label>
          {customMode || !modelInList ? (
            <label className="form-row">
              <span>Name</span>
              <input
                value={settings.model}
                spellCheck={false}
                placeholder="e.g. gemma4:12b-mlx"
                onChange={(event) => onSettingsChange({ ...settings, model: event.currentTarget.value })}
              />
            </label>
          ) : null}
          <div className="model-picker-meta">
            <span>
              {loadingModels
                ? "Reading models installed on this machine…"
                : installedModels.length
                  ? `${installedModels.length} model${installedModels.length === 1 ? "" : "s"} installed locally`
                  : "No models listed yet. Run Check AI or Refresh to confirm local Ollama."}
            </span>
            <button
              type="button"
              className="link-action"
              onClick={onRefreshModels}
              disabled={loadingModels}
            >
              {loadingModels ? "Refreshing…" : "Refresh list"}
            </button>
          </div>
        </div>
      )}
      {showSuggestedModel ? (
        <div className="model-install-hint" role="status">
          <span>For a smaller local test model, run:</span>
          <code>ollama pull {suggestedModel}</code>
        </div>
      ) : null}
      {settings.provider === "ollama" ? (
        <>
          <label className="form-row">
            <span>Embedding model</span>
            <input
              value={settings.embeddingModel}
              spellCheck={false}
              placeholder={DEFAULT_OLLAMA_EMBEDDING_MODEL}
              onChange={(event) => onSettingsChange({ ...settings, embeddingModel: event.currentTarget.value })}
            />
          </label>
          <div className="settings-footnote">
            Semantic Ask retrieval embeds locally with this model. Install it with:{" "}
            <code>ollama pull {settings.embeddingModel.trim() || DEFAULT_OLLAMA_EMBEDDING_MODEL}</code>
          </div>
          <label className="form-row">
            <span>Host</span>
            <input
              value={settings.baseUrl}
              onChange={(event) => onSettingsChange({ ...settings, baseUrl: event.currentTarget.value })}
            />
          </label>
        </>
      ) : (
        <label className="form-row">
          <span>API key</span>
          <input
            type="password"
            value={keyDraft}
            placeholder={hasProviderKey ? "Saved in keychain" : ""}
            onChange={(event) => onKeyDraftChange(event.currentTarget.value)}
          />
        </label>
      )}
      <label className="form-row">
        <span>Rosetta</span>
        <select
          value={settings.rosettaLanguage}
          onChange={(event) => onSettingsChange({ ...settings, rosettaLanguage: event.currentTarget.value })}
        >
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="java">Java</option>
          <option value="c#">C#</option>
        </select>
      </label>
      <div className="button-row three">
        <button type="button" onClick={onCheckModel} disabled={modelReadiness.status === "checking"}>
          {modelReadiness.status === "checking" ? "Checking" : "Check AI"}
        </button>
        {cloud ? (
          <>
            <button type="button" onClick={onSaveKey} disabled={!keyDraft.trim()}>
              Save Key
            </button>
            <button type="button" onClick={onClearKey} disabled={!hasProviderKey}>
              Clear
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onWarmSemanticIndex} disabled={semanticBusy} aria-label="Test semantic retrieval">
              {semanticBusy ? "Warming" : "Test semantic"}
            </button>
            <button
              type="button"
              onClick={onRefreshModels}
              disabled={modelReadiness.status === "checking"}
              aria-label="Refresh models"
              title="Refresh installed Ollama models"
            >
              Refresh
            </button>
          </>
        )}
      </div>
      <div className={`settings-footnote ${modelReadiness.status}`}>
        {modelReadiness.message || (cloud ? message || (hasProviderKey ? "Key ready" : "No key") : "Local mode: model calls stay on this machine.")}
      </div>
      <div className="ai-usage" aria-label="AI usage and token estimate">
        <div>
          <span>{cloud ? "Cloud calls this session" : "Local calls this session"}</span>
          <strong>{modelCallCount}</strong>
        </div>
        <div>
          <span>Bulk summary input estimate</span>
          <strong>{bulkTokenEstimate.toLocaleString()}</strong>
        </div>
        <p>
          {cloud
            ? `Non-graph Ask and summaries send cited context to ${PROVIDER_LABELS[settings.provider]} only when you run them.`
            : "Graph answers need no model; summaries and non-graph Ask use localhost Ollama only when you run them."}
        </p>
      </div>
    </section>
  );
}

function aiReadinessSteps({
  settings,
  cloud,
  hasProviderKey,
  installedModels,
  modelInList,
  modelReadiness,
  semanticIndex,
}: {
  settings: ModelSettings;
  cloud: boolean;
  hasProviderKey: boolean;
  installedModels: string[];
  modelInList: boolean;
  modelReadiness: ModelReadiness;
  semanticIndex: SemanticIndexState;
}): ReadinessStep[] {
  if (cloud) {
    return [
      {
        label: "Provider",
        status: "ready",
        detail: `${PROVIDER_LABELS[settings.provider]} is selected for non-graph AI calls.`,
      },
      {
        label: "API key",
        status: hasProviderKey ? "ready" : "pending",
        detail: hasProviderKey ? "Saved in the desktop keychain." : "Save a key before cloud Ask or summaries.",
      },
      {
        label: "Test",
        status: cloudTestStatus(modelReadiness),
        detail:
          modelReadiness.status === "ready"
            ? modelReadiness.message
            : hasProviderKey
              ? "Run Check AI to confirm the saved key before model calls."
              : "Save a key, then run Check AI.",
      },
    ];
  }

  const configuredModel = settings.model.trim() || "llama3.2";
  const embeddingModel = settings.embeddingModel.trim() || DEFAULT_OLLAMA_EMBEDDING_MODEL;
  const embeddingInList = installedModels.some((model) => isSameOllamaModel(model, embeddingModel));
  const hasModelList = installedModels.length > 0;
  const serverUnavailable = modelReadiness.status === "error" && !hasModelList && /could not reach|responded with/i.test(modelReadiness.message);
  const generationVerified = /test generation returned text/i.test(modelReadiness.message);

  return [
    {
      label: "Ollama server",
      status: localServerStatus(modelReadiness, hasModelList, serverUnavailable),
      detail: serverUnavailable
        ? "Ollama did not answer on localhost."
        : hasModelList || modelReadiness.status === "ready"
          ? "Ollama answered on localhost."
          : "Run Check AI or Refresh to confirm localhost Ollama.",
      command: serverUnavailable ? "ollama serve" : undefined,
    },
    {
      label: "Generation model",
      status: localModelStatus(modelReadiness, hasModelList, modelInList),
      detail: modelInList
        ? `${configuredModel} is available for Ask and summaries.`
        : hasModelList
          ? `${configuredModel} is not in the installed model list.`
          : "Run Check AI or Refresh to confirm the configured generation model.",
      command: !modelInList && hasModelList ? `ollama pull ${configuredModel}` : undefined,
    },
    {
      label: "Embedding model",
      status: localModelStatus(modelReadiness, hasModelList, embeddingInList),
      detail: embeddingInList
        ? `${embeddingModel} is available for semantic retrieval.`
        : hasModelList
          ? `${embeddingModel} is not in the installed model list.`
          : "Run Check AI or Refresh to confirm the semantic retrieval model.",
      command: !embeddingInList && hasModelList ? `ollama pull ${embeddingModel}` : undefined,
    },
    {
      label: "Semantic index",
      status: semanticStepStatus(semanticIndex, embeddingInList),
      detail: semanticIndex.message || "Load a graph and warm local embeddings for semantic Ask retrieval.",
    },
    {
      label: "Test",
      status: localGenerationTestStatus(modelReadiness, generationVerified),
      detail: generationVerified
        ? "A quick local generation returned text."
        : modelReadiness.status === "checking"
          ? "Checking local generation with the configured model."
          : "Run Check AI before relying on model-backed Ask or summaries.",
    },
  ];
}

function cloudTestStatus(modelReadiness: ModelReadiness): ReadinessStepStatus {
  if (modelReadiness.status === "checking") return "checking";
  if (modelReadiness.status === "ready") return "ready";
  if (modelReadiness.status === "error") return "error";
  return "pending";
}

function localServerStatus(
  modelReadiness: ModelReadiness,
  hasModelList: boolean,
  serverUnavailable: boolean,
): ReadinessStepStatus {
  if (modelReadiness.status === "checking") return "checking";
  if (serverUnavailable) return "error";
  if (hasModelList || modelReadiness.status === "ready") return "ready";
  return "pending";
}

function localModelStatus(
  modelReadiness: ModelReadiness,
  hasModelList: boolean,
  modelAvailable: boolean,
): ReadinessStepStatus {
  if (modelReadiness.status === "checking") return "checking";
  if (modelAvailable) return "ready";
  if (hasModelList || modelReadiness.status === "error") return "error";
  return "pending";
}

function localGenerationTestStatus(modelReadiness: ModelReadiness, generationVerified: boolean): ReadinessStepStatus {
  if (modelReadiness.status === "checking") return "checking";
  if (generationVerified) return "ready";
  if (modelReadiness.status === "error") return "error";
  return "pending";
}

function semanticStepStatus(semanticIndex: SemanticIndexState, embeddingReady: boolean): ReadinessStepStatus {
  if (semanticIndex.status === "warming") return "checking";
  if (semanticIndex.status === "ready") return "ready";
  if (semanticIndex.status === "error") return "error";
  if (!embeddingReady) return "pending";
  return "pending";
}
