import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { GraphDocument } from "../lib/graph";
import {
  buildDocumentationExport,
  documentationExportPackageName,
  documentationExportPrefix,
  documentationPngBytes,
  downloadBuiltDocumentationExport,
  selectedDocumentationExportCount,
  selectedDocumentationExportLabels,
  type DocumentationExportOptions,
  type SummaryExportState,
} from "./docs";

export async function runDocumentationExport({
  graph,
  summaries,
  focusNodeId,
  desktopAvailable,
  options,
}: {
  graph: GraphDocument;
  summaries: SummaryExportState;
  focusNodeId: string;
  desktopAvailable: boolean;
  options: DocumentationExportOptions;
}) {
  try {
    return await runPreferredDocumentationExport({ graph, summaries, focusNodeId, desktopAvailable, options });
  } catch {
    try {
      return await runBrowserDownloadExport(graph, summaries, focusNodeId, options);
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
  options,
}: {
  graph: GraphDocument;
  summaries: SummaryExportState;
  focusNodeId: string;
  desktopAvailable: boolean;
  options: DocumentationExportOptions;
}) {
  if (selectedDocumentationExportCount(options) === 0) {
    return "Choose at least one export artifact.";
  }

  const docs = buildDocumentationExport(graph, summaries, focusNodeId);
  if (!desktopAvailable) {
    const files = await downloadBuiltDocumentationExport(graph, focusNodeId, docs, options);
    return `Downloaded ${Object.values(files).join(", ")}. Desktop export creates a clean folder.`;
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choose where Cobolens should create the export folder",
  });

  if (typeof selected !== "string") {
    return "Export canceled.";
  }

  const png = options.png ? await documentationPngBytes(graph, focusNodeId, docs.diagramTitle) : [];
  const target = await invoke<string>("write_export_files", {
    outputDir: selected,
    packageName: documentationExportPackageName(docs),
    prefix: documentationExportPrefix(docs),
    includeMarkdown: options.markdown,
    includeMermaid: options.mermaid,
    includePng: options.png,
    markdown: docs.markdown,
    mermaid: docs.mermaid,
    png,
  });
  return `Exported ${selectedDocumentationExportLabels(options).join(", ")} to ${target}`;
}

async function runBrowserDownloadExport(
  graph: GraphDocument,
  summaries: SummaryExportState,
  focusNodeId: string,
  options: DocumentationExportOptions,
) {
  const docs = buildDocumentationExport(graph, summaries, focusNodeId);
  const files = await downloadBuiltDocumentationExport(graph, focusNodeId, docs, options);
  return `Downloaded ${Object.values(files).join(", ")}. Desktop export creates a clean folder.`;
}
