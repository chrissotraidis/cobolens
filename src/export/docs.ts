import type { GraphDocument } from "../lib/graph";
import type { UnitSummary } from "../model/summaries";

export type SummaryExportState = Record<string, { summary?: UnitSummary } | undefined>;

export type DocumentationExport = {
  markdown: string;
  mermaid: string;
  diagramTitle: string;
};

export function buildDocumentationExport(
  graph: GraphDocument,
  summaries: SummaryExportState,
  focusNodeId: string,
): DocumentationExport {
  const focus = graph.nodes.find((node) => node.id === focusNodeId) ?? graph.nodes.find((node) => node.type === "program");
  const mermaid = buildMermaidDiagram(graph, focus?.id);
  const summaryRows = graph.nodes
    .filter((node) => node.type === "program" || node.type === "copybook" || node.type === "paragraph")
    .slice(0, 120)
    .map((node) => {
      const summary = summaries[node.id]?.summary?.text ?? "No generated summary yet.";
      const file = node.file ? `${node.file}:${node.lines?.[0] ?? 1}` : "external";
      return `### ${node.name}\n\n- Type: ${node.type}\n- Source: ${file}\n\n${summary}\n`;
    })
    .join("\n");

  const parseErrors = graph.meta.parseErrors.length
    ? graph.meta.parseErrors.map((error) => `- ${error.file}: ${error.reason}`).join("\n")
    : "- None";
  const programDiagrams = graph.nodes
    .filter((node) => node.type === "program" && !node.external)
    .slice(0, 40)
    .map((node) => [`### ${node.name}`, "", "```mermaid", buildMermaidDiagram(graph, node.id), "```"].join("\n"))
    .join("\n\n");

  return {
    diagramTitle: focus?.name ?? "Cobolens diagram",
    mermaid,
    markdown: [
      "# Cobolens Documentation",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Inventory",
      "",
      `- Files scanned: ${graph.meta.fileCount}`,
      `- Files parsed: ${graph.meta.parsedFileCount}`,
      `- Nodes: ${graph.nodes.length}`,
      `- Edges: ${graph.edges.length}`,
      "",
      "## Dependency Diagram",
      "",
      "```mermaid",
      mermaid,
      "```",
      "",
      "## Program Diagrams",
      "",
      programDiagrams || "No program diagrams were available.",
      "",
      "## Summaries",
      "",
      summaryRows || "No source-backed units were indexed.",
      "",
      "## Parse Errors",
      "",
      parseErrors,
    ].join("\n"),
  };
}

export function buildMermaidDiagram(graph: GraphDocument, focusNodeId?: string) {
  const visibleEdges = focusNodeId
    ? graph.edges.filter((edge) => edge.from === focusNodeId || edge.to === focusNodeId).slice(0, 40)
    : graph.edges.slice(0, 40);
  const nodeIds = new Set(visibleEdges.flatMap((edge) => [edge.from, edge.to]));
  if (focusNodeId) nodeIds.add(focusNodeId);

  const lines = ["flowchart LR"];
  for (const node of graph.nodes.filter((candidate) => nodeIds.has(candidate.id)).slice(0, 60)) {
    lines.push(`  ${mermaidId(node.id)}["${escapeMermaid(node.name)}"]`);
  }
  for (const edge of visibleEdges) {
    lines.push(`  ${mermaidId(edge.from)} -->|"${escapeMermaid(edge.type)}"| ${mermaidId(edge.to)}`);
  }
  return lines.join("\n");
}

export async function downloadDocumentationExport(
  graph: GraphDocument,
  summaries: SummaryExportState,
  focusNodeId: string,
) {
  const docs = buildDocumentationExport(graph, summaries, focusNodeId);
  const prefix = `cobolens-${safeName(docs.diagramTitle)}`;
  downloadBlob(`${prefix}.md`, new Blob([docs.markdown], { type: "text/markdown;charset=utf-8" }));
  downloadBlob(`${prefix}.mmd`, new Blob([docs.mermaid], { type: "text/plain;charset=utf-8" }));
  const png = await diagramPngBlob(docs.diagramTitle, docs.mermaid);
  downloadBlob(`${prefix}.png`, png);
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function mermaidId(id: string) {
  return `n_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function escapeMermaid(value: string) {
  return value.replace(/"/g, "'");
}

function safeName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "docs";
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function diagramPngBlob(title: string, mermaid: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.fillStyle = "#0b0d10";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#e7ebef";
  context.font = "bold 30px sans-serif";
  context.fillText(title, 48, 64);
  context.font = "18px monospace";
  context.fillStyle = "#9aa6b2";
  mermaid
    .split("\n")
    .slice(0, 28)
    .forEach((line, index) => context.fillText(line, 48, 112 + index * 21));

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render PNG diagram."));
    }, "image/png");
  });
}
