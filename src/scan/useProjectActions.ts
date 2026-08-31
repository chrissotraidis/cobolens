import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { type ChangeEvent, useEffect, useRef } from "react";
import { type ScanSettings, normalizedScanSettings } from "../lib/appSettings";
import { analyzeBrowserProject, type BrowserProjectImport } from "../lib/browserImport";
import type { GraphDocument } from "../lib/graph";
import { firstFocusableNode } from "../lib/graphSelectors";
import { sourceBaseForGraphUrl } from "../lib/sourceReader";
import { DEFAULT_SAMPLE_ID, sampleById, sampleForGraphUrl, sampleForRoot } from "../samples/catalog";
import type { ProjectState } from "./useProjectState";

declare global {
  interface Window {
    __cobolensLoadGraph?: (graph: GraphDocument, root?: string, sourceBase?: string) => void;
  }
}

export function useProjectActions({
  desktopAvailable,
  scanSettings,
  project,
  resetScanProgress,
  resetGraphViewState,
  resetSummaries,
  resetChatForProjectLoad,
  clearExportStatus,
  showExportStatus,
  onProjectLoad,
}: {
  desktopAvailable: boolean;
  scanSettings: ScanSettings;
  project: ProjectState;
  resetScanProgress: () => void;
  resetGraphViewState: () => void;
  resetSummaries: () => void;
  resetChatForProjectLoad: () => void;
  clearExportStatus: () => void;
  showExportStatus: (message: string) => void;
  onProjectLoad: () => void;
}) {
  const {
    graph,
    root,
    setRoot,
    setGraph,
    setSourceBase,
    setBrowserSourceFiles,
    setFocusNodeId,
    setSelectedNodeId,
    setSelectedEdge,
    setSourceFocus,
    setError,
    setStatus,
  } = project;
  const browserImportInputRef = useRef<HTMLInputElement | null>(null);

  function beginScan(nextRoot: string, nextSourceBase = "") {
    onProjectLoad();
    setRoot(nextRoot);
    setSourceBase(nextSourceBase);
    setBrowserSourceFiles({});
    setGraph(null);
    setSelectedEdge(null);
    setSourceFocus(null);
    resetScanProgress();
    setError("");
    setStatus("running");
  }

  function acceptGraph(nextGraph: GraphDocument, nextRoot: string, nextSourceBase = "") {
    onProjectLoad();
    const initialFocus = firstFocusableNode(nextGraph);
    setRoot(nextRoot);
    setSourceBase(nextSourceBase);
    setBrowserSourceFiles({});
    setGraph(nextGraph);
    setFocusNodeId(initialFocus);
    setSelectedNodeId(initialFocus);
    setSelectedEdge(null);
    resetGraphViewState();
    resetSummaries();
    resetChatForProjectLoad();
    setSourceFocus(null);
    clearExportStatus();
    resetScanProgress();
    setStatus("ready");
  }

  function acceptBrowserProject(result: BrowserProjectImport) {
    acceptGraph(result.graph, result.rootLabel);
    setBrowserSourceFiles(result.sources);
  }

  async function chooseFolder() {
    if (!desktopAvailable) {
      browserImportInputRef.current?.click();
      return;
    }

    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open COBOL codebase",
    });
    if (typeof selected !== "string") return;

    beginScan(selected);

    try {
      const result = await invoke<GraphDocument>("analyze_codebase", {
        root: selected,
        scan: normalizedScanSettings(scanSettings),
      });
      acceptGraph(result, selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function importBrowserProject(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;

    beginScan("Importing project...");
    try {
      const result = await analyzeBrowserProject(files, normalizedScanSettings(scanSettings));
      acceptBrowserProject(result);
      showExportStatus(`Imported ${result.graph.meta.fileCount} file${result.graph.meta.fileCount === 1 ? "" : "s"} locally.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function openSample(sampleId = DEFAULT_SAMPLE_ID) {
    const sample = sampleById(sampleId) ?? sampleById(DEFAULT_SAMPLE_ID);
    if (!sample) return;

    // Keep the current graph mounted while the bundled JSON is fetched. This
    // makes switching from a long Source view stable and avoids a blank
    // intermediate workspace before the next sample is ready.
    onProjectLoad();
    setSelectedEdge(null);
    setSourceFocus(null);
    setError("");
    setStatus("running");
    try {
      const response = await fetch(sample.graphUrl);
      if (!response.ok) {
        throw new Error(
          `Could not load ${sample.name} (${response.status}). Regenerate the sample library with: npm run samples:build`,
        );
      }
      const result = (await response.json()) as GraphDocument;
      acceptGraph(result, sample.rootLabel, sample.sourceUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function rescanCurrent() {
    if (!graph) return;
    if (!desktopAvailable) {
      const sample = sampleForRoot(root);
      if (sample) await openSample(sample.id);
      return;
    }

    const sample = sampleForRoot(root);
    if (sample) {
      await openSample(sample.id);
      return;
    }

    if (!root) return;
    beginScan(root);
    try {
      const result = await invoke<GraphDocument>("analyze_codebase", {
        root,
        scan: normalizedScanSettings(scanSettings),
      });
      acceptGraph(result, root);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const graphUrl = new URLSearchParams(window.location.search).get("graph");
    if (!graphUrl) return;

    let cancelled = false;
    fetch(graphUrl)
      .then((response) => response.json() as Promise<GraphDocument>)
      .then((loadedGraph) => {
        if (!cancelled) {
          const sample = sampleById(new URLSearchParams(window.location.search).get("sample") ?? "") ?? sampleForGraphUrl(graphUrl);
          acceptGraph(
            loadedGraph,
            sample?.rootLabel ?? "Loaded graph",
            sample?.sourceUrl ?? sourceBaseForGraphUrl(graphUrl),
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.__cobolensLoadGraph = (nextGraph, nextRoot = "", nextSourceBase = "") => {
      acceptGraph(nextGraph, nextRoot, nextSourceBase);
    };
  });

  return {
    browserImportInputRef,
    chooseFolder,
    importBrowserProject,
    openSample,
    rescanCurrent,
  };
}
