import { useCallback, useEffect, useState } from "react";
import type { GraphDocument } from "../lib/graph";
import {
  buildDocumentationExport,
  DEFAULT_DOCUMENTATION_EXPORT_OPTIONS,
  documentationExportPackageName,
  selectedDocumentationExportCount,
  type DocumentationExportOptions,
  type SummaryExportState,
} from "./docs";
import { runDocumentationExport } from "./runDocumentationExport";

export function useDocumentationExport({
  graph,
  summaries,
  focusNodeId,
  desktopAvailable,
}: {
  graph: GraphDocument | null;
  summaries: SummaryExportState;
  focusNodeId: string;
  desktopAvailable: boolean;
}) {
  const [exportStatus, setExportStatus] = useState("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<DocumentationExportOptions>(DEFAULT_DOCUMENTATION_EXPORT_OPTIONS);

  useEffect(() => {
    if (!exportStatus || exportStatus === "Exporting") return;
    const timeout = window.setTimeout(() => setExportStatus(""), 8000);
    return () => window.clearTimeout(timeout);
  }, [exportStatus]);

  const showExportStatus = useCallback((message: string) => {
    setExportStatus(message);
  }, []);

  const clearExportStatus = useCallback(() => {
    setExportStatus("");
  }, []);

  const openExportDialog = useCallback(() => {
    if (!graph) return;
    setExportDialogOpen(true);
  }, [graph]);

  const closeExportDialog = useCallback(() => {
    if (exportStatus === "Exporting") return;
    setExportDialogOpen(false);
  }, [exportStatus]);

  const exportDocs = useCallback(async () => {
    if (!graph) return;
    if (selectedDocumentationExportCount(exportOptions) === 0) {
      setExportStatus("Choose at least one export artifact.");
      return;
    }
    setExportStatus("Exporting");
    const message = await runDocumentationExport({
      graph,
      summaries,
      focusNodeId,
      desktopAvailable,
      options: exportOptions,
    });
    setExportStatus(message);
    setExportDialogOpen(false);
  }, [desktopAvailable, exportOptions, focusNodeId, graph, summaries]);

  const exportPackageName = graph ? documentationExportPackageName(buildDocumentationExport(graph, summaries, focusNodeId)) : "cobolens-export";

  return {
    exportStatus,
    exportDialogOpen,
    exportOptions,
    exportPackageName,
    exportDocsRunning: exportStatus === "Exporting",
    showExportStatus,
    clearExportStatus,
    setExportOptions,
    openExportDialog,
    closeExportDialog,
    exportDocs,
  };
}
