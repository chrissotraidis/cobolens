import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import type { GraphNode } from "../lib/graph";
import type { ScanSettings } from "../lib/appSettings";
import { type ModelSettings, PROVIDER_LABELS } from "../model/config";

type TopBarStatus = "idle" | "running" | "ready" | "error";

const BROWSER_DIRECTORY_INPUT_PROPS = {
  directory: "",
  webkitdirectory: "",
} as Record<string, string>;

export function TopBar({
  railCollapsed,
  inspectorCollapsed,
  status,
  desktopAvailable,
  graphLoaded,
  focusedNode,
  focusedNodeTypeLabel,
  modelSettings,
  query,
  scanSettings,
  browserImportInputRef,
  onToggleRail,
  onQueryChange,
  onSearchKeyDown,
  onHome,
  onChooseFolder,
  onBrowserImport,
  onOpenSample,
  onToggleInspector,
  onExport,
  onOpenSettings,
}: {
  railCollapsed: boolean;
  inspectorCollapsed: boolean;
  status: TopBarStatus;
  desktopAvailable: boolean;
  graphLoaded: boolean;
  focusedNode: GraphNode | null;
  focusedNodeTypeLabel: string;
  modelSettings: ModelSettings;
  query: string;
  scanSettings: ScanSettings;
  browserImportInputRef: RefObject<HTMLInputElement | null>;
  onToggleRail: () => void;
  onQueryChange: (query: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onHome: () => void;
  onChooseFolder: () => void;
  onBrowserImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenSample: () => void;
  onToggleInspector: () => void;
  onExport: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <button
          type="button"
          className="rail-toggle"
          onClick={onToggleRail}
          aria-pressed={railCollapsed}
          aria-label={railCollapsed ? "Show navigator panel" : "Hide navigator panel"}
          title={railCollapsed ? "Show navigator" : "Hide navigator"}
        >
          <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">
            <rect x="2.5" y="3.5" width="13" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <rect x="3.7" y="4.7" width="3" height="8.6" rx="1" fill="currentColor" />
          </svg>
        </button>
        <img className="brand-mark" src="/favicon.png" alt="" aria-hidden="true" />
        <span className="brand-name">Cobolens</span>
        <span
          className={`privacy-dot ${modelSettings.privacyMode}`}
          role="img"
          aria-label={privacyModeLabel(modelSettings)}
          title={privacyModeLabel(modelSettings)}
        />
      </div>

      <label className="global-search">
        <input
          type="search"
          aria-label="Search symbols"
          placeholder="Find programs, copybooks, jobs..."
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          disabled={!graphLoaded}
        />
      </label>

      <nav className="breadcrumbs" aria-label="Breadcrumb history">
        <button type="button" className="home-crumb" onClick={onHome} disabled={!graphLoaded} aria-label="Home" title="Home">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M2.5 7.2 8 2.8l5.5 4.4M4.2 6.6v6.1h7.6V6.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {focusedNode ? (
          <span className="current-crumb" aria-current="page" title={`${focusedNode.name} - ${focusedNodeTypeLabel}`}>
            {focusedNode.name}
          </span>
        ) : null}
      </nav>

      <div className="topbar-actions" aria-label="Workspace actions">
        <button
          type="button"
          className="topbar-import"
          onClick={onChooseFolder}
          disabled={status === "running"}
          title={desktopAvailable ? "Import a local COBOL project folder" : "Import a local COBOL project folder in this browser"}
        >
          Import Project
        </button>
        <input
          {...BROWSER_DIRECTORY_INPUT_PROPS}
          ref={browserImportInputRef}
          className="project-import-input"
          type="file"
          multiple
          accept={scanSettings.extensions}
          aria-hidden="true"
          tabIndex={-1}
          onChange={onBrowserImport}
        />
        <button type="button" className="topbar-sample" onClick={onOpenSample} disabled={status === "running"} title="Open the bundled sample graph">
          Sample
        </button>
        <button
          type="button"
          className="rail-toggle"
          onClick={onToggleInspector}
          aria-pressed={!inspectorCollapsed}
          aria-label={inspectorCollapsed ? "Show inspector panel" : "Hide inspector panel"}
          title={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
        >
          <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">
            <rect x="2.5" y="3.5" width="13" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <rect x="11.3" y="4.7" width="3" height="8.6" rx="1" fill="currentColor" />
          </svg>
        </button>
        <button type="button" onClick={onExport} disabled={!graphLoaded} title="Export Markdown, Mermaid, and PNG docs">
          Export
        </button>
        <button type="button" onClick={onOpenSettings} aria-label="Open settings">
          Settings
        </button>
      </div>
    </header>
  );
}

function privacyModeLabel(settings: ModelSettings) {
  if (settings.privacyMode === "local") {
    return "Local: no code leaves";
  }
  return `Cloud: ${PROVIDER_LABELS[settings.provider]}`;
}
