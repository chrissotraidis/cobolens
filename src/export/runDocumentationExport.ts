import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { GraphDocument } from "../lib/graph";
import {
  buildDocumentationExport,
  documentationExportPrefix,
  documentationPngBytes,
  downloadBuiltDocumentationExport,
  type SummaryExportState,
} from "./docs";

export async function runDocumentationExport({
  graph,
  summaries,
  focusNodeId,
  desktopAvailable,
}: {
  graph: GraphDocument;
  summaries: SummaryExportState;
  focusNodeId: string;
  desktopAvailable: boolean;
}) {
  try {
    return await runPreferredDocumentationExport({ graph, summaries, focusNodeId, desktopAvailable });
  } catch {
    try {
      return await runBrowserDownloadExport(graph, summaries, focusNodeId);
    } catch (fallbackErr) {
      return fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    }
  }
}

async function runPreferredDocumentationExport({
  graph,
  summaries,
  focusNodeId,
  desktopAvailable,
}: {
  graph: GraphDocument;
  summaries: SummaryExportState;
  focusNodeId: string;
  desktopAvailable: boolean;
}) {
  const docs = buildDocumentationExport(graph, summaries, focusNodeId);
  if (!desktopAvailable) {
    const files = await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
    return `Downloaded ${Object.values(files).join(", ")}`;
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: "Export Cobolens documentation",
  });

  if (typeof selected !== "string") {
    const files = await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
    return `Downloaded ${Object.values(files).join(", ")}`;
  }

  const target = await invoke<string>("write_export_files", {
    outputDir: selected,
    prefix: documentationExportPrefix(docs),
    markdown: docs.markdown,
    mermaid: docs.mermaid,
    png: await documentationPngBytes(graph, focusNodeId, docs.diagramTitle),
  });
  return `Exported to ${target}`;
}

async function runBrowserDownloadExport(graph: GraphDocument, summaries: SummaryExportState, focusNodeId: string) {
  const docs = buildDocumentationExport(graph, summaries, focusNodeId);
  const files = await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
  return `Downloaded ${Object.values(files).join(", ")}`;
}
