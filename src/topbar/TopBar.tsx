import { type ChangeEvent, type KeyboardEvent, type RefObject, useEffect, useRef } from "react";
import type { ScanSettings } from "../lib/appSettings";
import { type ModelSettings, PROVIDER_LABELS } from "../model/config";

type TopBarStatus = "idle" | "running" | "ready" | "error";

const SEARCH_SHORTCUT = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";

const BROWSER_DIRECTORY_INPUT_PROPS = {
  directory: "",
  webkitdirectory: "",
} as Record<string, string>;

export function TopBar({
  railCollapsed,
  askOpen,
  status,
  desktopAvailable,
  graphLoaded,
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
  onToggleAsk,
  onExport,
  onOpenSettings,
}: {
  railCollapsed: boolean;
  askOpen: boolean;
  status: TopBarStatus;
  desktopAvailable: boolean;
  graphLoaded: boolean;
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
  onToggleAsk: () => void;
  onExport: () => void;
  onOpenSettings: () => void;
}) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Cmd/Ctrl+K jumps to symbol search from anywhere in the workspace.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const input = searchInputRef.current;
      if (!input || input.disabled) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        <button
          type="button"
          className="brand-home"
          onClick={onHome}
          disabled={!graphLoaded}
          aria-label="Go to Cobolens Home"
          title="Return to the map home"
        >
          <img className="brand-mark" src="/favicon.png" alt="" aria-hidden="true" />
          <span className="brand-name">Cobolens</span>
        </button>
        <span
          className={`privacy-dot ${modelSettings.privacyMode}`}
          role="img"
          aria-label={privacyModeLabel(modelSettings)}
          title={privacyModeLabel(modelSettings)}
        />
      </div>

      <label className="global-search">
        <svg className="global-search-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.4 10.4 3.1 3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={searchInputRef}
          type="search"
          aria-label="Search symbols"
          aria-keyshortcuts="Meta+K Control+K"
          placeholder="Find programs, copybooks, jobs..."
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          disabled={!graphLoaded}
        />
        {graphLoaded && !query ? <kbd className="global-search-shortcut" aria-hidden="true">{SEARCH_SHORTCUT}</kbd> : null}
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
      </nav>

      <div className="topbar-actions" aria-label="Workspace actions">
        <button
          type="button"
          className="topbar-import"
          onClick={onChooseFolder}
          disabled={status === "running"}
          title={desktopAvailable ? "Import a local COBOL project folder" : "Import a local COBOL project folder in this browser"}
        >
          Import<span className="topbar-label-extra"> Project</span>
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
        <button type="button" className="topbar-sample" onClick={onOpenSample} disabled={status === "running"} title="Choose a sample project">
          Samples
        </button>
        <button type="button" onClick={onExport} disabled={!graphLoaded} title="Choose export package options">
          Export
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        <button type="button" className="topbar-icon-button" onClick={onOpenSettings} aria-label="Open settings" title="Settings">
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <path
              d="M10 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z M16.2 11.3l1.3 1-1.5 2.6-1.6-.6a6 6 0 0 1-1.6.9l-.3 1.7H9.5l-.3-1.7a6 6 0 0 1-1.6-.9l-1.6.6-1.5-2.6 1.3-1a6 6 0 0 1 0-1.8l-1.3-1L6 5.9l1.6.6a6 6 0 0 1 1.6-.9l.3-1.7h3l.3 1.7a6 6 0 0 1 1.6.9l1.6-.6 1.5 2.6-1.3 1a6 6 0 0 1 0 1.8Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {/* The Chat panel toggle mirrors the navigator toggle on the far left. */}
        <button
          type="button"
          className="inspector-toggle"
          onClick={onToggleAsk}
          aria-pressed={askOpen}
          aria-label={askOpen ? "Close Chat" : "Open Chat"}
          title={askOpen ? "Close Chat" : "Chat about the current selection"}
        >
          <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">
            <rect x="2.5" y="3.5" width="13" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <rect x="11.3" y="4.7" width="3" height="8.6" rx="1" fill="currentColor" />
          </svg>
          <span>Chat</span>
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
