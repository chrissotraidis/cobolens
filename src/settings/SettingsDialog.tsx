import { useEffect, useRef, useState } from "react";
import { DEFAULT_OLLAMA_EMBEDDING_MODEL, ModelProvider, ModelSettings, PROVIDER_LABELS, isCloudProvider } from "../model/config";
import { RECOMMENDED_SMALL_OLLAMA_MODEL, isEmbeddingOnlyOllamaModel, isSameOllamaModel } from "../model/readiness";
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
            <p>Choose how Chat explains code. Graph answers remain available without AI.</p>
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
        <details className="settings-disclosure settings-scan-disclosure">
          <summary>
            <span>Scanning</span>
            <small>{desktopAvailable ? `${scanSettings.format} · ${scanSettings.encoding}` : "Desktop app"}</small>
          </summary>
          <div className="settings-disclosure-body">
            {desktopAvailable ? (
              <ScanSettingsPanel settings={scanSettings} disabled={scanDisabled} onSettingsChange={onScanSettingsChange} />
            ) : (
              <div className="desktop-preview-note">Scan settings are available in the desktop app.</div>
            )}
          </div>
        </details>
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
  const generationModels = installedModels.filter((model) => !isEmbeddingOnlyOllamaModel(model));
  const modelInList = generationModels.some((model) => isSameOllamaModel(model, settings.model));
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
  const readyStepCount = readinessSteps.filter((step) => step.status === "ready").length;
  const readinessComplete = readyStepCount === readinessSteps.length;

  return (
    <section className="pane-block model-settings">
      <div className="settings-section-heading">
        <div>
          <h2>Chat &amp; AI</h2>
          <p>Structural questions use the graph. AI is only used for broader explanations.</p>
        </div>
        <span className={`settings-summary-status ${modelReadiness.status}`}>{modelStatusLabel(modelReadiness, installedModels.length)}</span>
      </div>
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
              {generationModels.length ? (
                generationModels.map((model) => (
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
                : generationModels.length
                  ? `${generationModels.length} generation model${generationModels.length === 1 ? "" : "s"} installed locally`
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
      {cloud ? (
        <label className="form-row">
          <span>API key</span>
          <input
            type="password"
            value={keyDraft}
            placeholder={hasProviderKey ? "Saved in keychain" : ""}
            onChange={(event) => onKeyDraftChange(event.currentTarget.value)}
          />
        </label>
      ) : null}
      <div className="settings-primary-actions">
        <button type="button" className="primary-action" onClick={onCheckModel} disabled={modelReadiness.status === "checking"}>
          {modelReadiness.status === "checking" ? "Checking…" : "Check connection"}
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
        ) : null}
      </div>
      <div className={`settings-status-line ${modelReadiness.status}`} role="status">
        {modelReadiness.message || (cloud ? message || (hasProviderKey ? "Key ready" : "No key") : "Local mode: model calls stay on this machine.")}
      </div>
      <details className={`readiness-disclosure${readinessComplete ? " is-ready" : ""}`}>
        <summary>
          <span>Connection details</span>
          <small>{readyStepCount}/{readinessSteps.length} checks</small>
        </summary>
        <ol className="readiness-stepper" aria-label="AI setup readiness">
          {readinessSteps.map((step, index) => (
            <li key={step.label} className={`readiness-step ${step.status}`}>
              <span className="readiness-step-index" aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
                {step.command ? <code>{step.command}</code> : null}
              </div>
            </li>
          ))}
        </ol>
      </details>
      <details className="settings-disclosure">
        <summary>
          <span>Retrieval &amp; explanation</span>
          <small>{settings.provider === "ollama" ? settings.embeddingModel : settings.rosettaLanguage}</small>
        </summary>
        <div className="settings-disclosure-body">
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
              <label className="form-row">
                <span>Ollama host</span>
                <input
                  value={settings.baseUrl}
                  onChange={(event) => onSettingsChange({ ...settings, baseUrl: event.currentTarget.value })}
                />
              </label>
              <button type="button" onClick={onWarmSemanticIndex} disabled={semanticBusy} aria-label="Prepare semantic retrieval">
                {semanticBusy ? "Preparing semantic search…" : "Prepare semantic search"}
              </button>
              <div className={`settings-footnote ${semanticIndex.status}`}>{semanticIndex.message}</div>
            </>
          ) : null}
          <label className="form-row">
            <span>Explain concepts using</span>
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
          <p className="settings-footnote">Cobolens may compare concepts with this language; it never translates or changes the source.</p>
        </div>
      </details>
      <details className="settings-disclosure">
        <summary>
          <span>Usage this session</span>
          <small>{modelCallCount} call{modelCallCount === 1 ? "" : "s"}</small>
        </summary>
        <div className="settings-disclosure-body">
          <div className="ai-usage" aria-label="AI usage and token estimate">
            <div>
              <span>{cloud ? "Cloud calls" : "Local calls"}</span>
              <strong>{modelCallCount}</strong>
            </div>
            <div>
              <span>Explain-all input estimate</span>
              <strong>{bulkTokenEstimate.toLocaleString()}</strong>
            </div>
            <p>
              {cloud
                ? `Only requested explanations send cited context to ${PROVIDER_LABELS[settings.provider]}.`
                : "Graph answers need no model. Local AI runs only when you request an explanation."}
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

function modelStatusLabel(readiness: ModelReadiness, installedModelCount: number) {
  if (readiness.status === "checking") return "Checking";
  if (readiness.status === "ready") return "Connected";
  if (readiness.status === "error") return "Needs attention";
  return installedModelCount ? "Models found" : "Not checked";
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
        detail: hasProviderKey ? "Saved in the desktop keychain." : "Save a key before cloud Chat or summaries.",
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
        ? `${configuredModel} is available for Chat and summaries.`
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
      detail: semanticIndex.message || "Load a graph and prepare local embeddings for semantic Chat retrieval.",
    },
    {
      label: "Test",
      status: localGenerationTestStatus(modelReadiness, generationVerified),
      detail: generationVerified
        ? "A quick local generation returned text."
        : modelReadiness.status === "checking"
          ? "Checking local generation with the configured model."
          : "Check the connection before relying on model-backed Chat or summaries.",
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
