import { useCallback, useEffect, useState } from "react";
import type { GraphDocument } from "../lib/graph";
import type { SummaryExportState } from "./docs";
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

  const exportDocs = useCallback(async () => {
    if (!graph) return;
    setExportStatus("Exporting");
    const message = await runDocumentationExport({
      graph,
      summaries,
      focusNodeId,
      desktopAvailable,
    });
    setExportStatus(message);
  }, [desktopAvailable, focusNodeId, graph, summaries]);

  return {
    exportStatus,
    showExportStatus,
    clearExportStatus,
    exportDocs,
  };
}
