import { edgeLabel } from "../lib/graph";
import type { GraphDocument, GraphEdge, GraphNode } from "../lib/graph";
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
      const summary = summaries[node.id]?.summary?.text ?? graphDerivedSummary(graph, node);
      const file = node.file ? `${node.file}:${node.lines?.[0] ?? 1}` : "external";
      const relationships = relationshipFacts(graph, node);
      return [
        `### ${node.name}`,
        "",
        `- Type: ${node.type}`,
        `- Source: ${file}`,
        summaries[node.id]?.summary ? "- Summary: AI-generated from graph and source context" : "- Summary: graph-derived, no model required",
        "",
        summary,
        "",
        "#### Relationships",
        "",
        relationships.length ? relationships.map((fact) => `- ${fact}`).join("\n") : "- No direct relationships recorded.",
        "",
      ].join("\n");
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
  const lineageRows = graph.nodes
    .filter((node) => LINEAGE_EXPORT_TYPES.has(node.type))
    .slice(0, 120)
    .map((node) => {
      const source = node.file ? `${node.file}:${node.lines?.[0] ?? 1}` : "external";
      const relationships = relationshipFacts(graph, node);
      return [
        `### ${node.name}`,
        "",
        `- Type: ${node.type}`,
        `- Source: ${source}`,
        "",
        graphDerivedSummary(graph, node),
        "",
        "#### Cited Relationships",
        "",
        relationships.length ? relationships.map((fact) => `- ${fact}`).join("\n") : "- No direct relationships recorded.",
        "",
      ].join("\n");
    })
    .join("\n");

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
      "## Lineage and Impact",
      "",
      lineageRows || "No lineage-backed nodes were indexed.",
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
  await downloadBuiltDocumentationExport(graph, focusNodeId, docs);
}

export async function downloadBuiltDocumentationExport(
  graph: GraphDocument,
  focusNodeId: string,
  docs: DocumentationExport,
) {
  const prefix = documentationExportPrefix(docs);
  downloadBlob(`${prefix}.md`, new Blob([docs.markdown], { type: "text/markdown;charset=utf-8" }));
  downloadBlob(`${prefix}.mmd`, new Blob([docs.mermaid], { type: "text/plain;charset=utf-8" }));
  const png = await diagramPngBlob(graph, focusNodeId, docs.diagramTitle);
  downloadBlob(`${prefix}.png`, png);
}

export function documentationExportPrefix(docs: DocumentationExport) {
  return `cobolens-${safeName(docs.diagramTitle)}`;
}

export async function documentationPngBytes(graph: GraphDocument, focusNodeId: string, title: string) {
  const blob = await diagramPngBlob(graph, focusNodeId, title);
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

const LINEAGE_EXPORT_TYPES = new Set(["data-item", "dataset", "db2-table", "cics-command", "jcl-dd"]);

function mermaidId(id: string) {
  return `n_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function escapeMermaid(value: string) {
  return value.replace(/"/g, "'");
}

function safeName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "docs";
}

function graphDerivedSummary(graph: GraphDocument, node: GraphNode) {
  const incoming = graph.edges.filter((edge) => edge.to === node.id);
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const source = node.file ? `${node.file}:${node.lines?.[0] ?? 1}` : "external";
  const parts = [
    `${node.name} is a ${node.type}${node.external ? " outside this codebase" : ""}.`,
    `Source: ${source}.`,
    `${incoming.length} incoming and ${outgoing.length} outgoing relationships are recorded in the parsed graph.`,
  ];
  const citedEdges = [...outgoing, ...incoming].filter((edge) => edge.site).slice(0, 5);
  if (citedEdges.length) {
    parts.push(`Key cited relationships: ${citedEdges.map((edge) => citedRelationship(graph, edge)).join("; ")}.`);
  }
  return parts.join(" ");
}

function relationshipFacts(graph: GraphDocument, node: GraphNode) {
  return graph.edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .slice(0, 16)
    .map((edge) => citedRelationship(graph, edge));
}

function citedRelationship(graph: GraphDocument, edge: GraphEdge) {
  return `${edgeLabel(edge, graph)}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : " (no source site recorded)"}`;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function diagramPngBlob(graph: GraphDocument, focusNodeId: string, title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.fillStyle = "#f7f9fb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111827";
  context.font = "bold 34px sans-serif";
  context.fillText(title, 56, 68);

  const visible = visibleDiagramGraph(graph, focusNodeId);
  const positions = layoutNodes(visible.nodes, canvas.width, canvas.height);

  context.lineWidth = 2;
  context.strokeStyle = "#9aa7b4";
  context.fillStyle = "#334155";
  context.font = "16px sans-serif";
  for (const edge of visible.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    drawArrow(context, from.x, from.y, to.x, to.y);
    const labelX = (from.x + to.x) / 2;
    const labelY = (from.y + to.y) / 2;
    drawLabel(context, edge.type, labelX, labelY);
  }

  for (const node of visible.nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const isFocus = node.id === focusNodeId;
    const width = 190;
    const height = 66;
    context.fillStyle = isFocus ? "#0f766e" : "#ffffff";
    context.strokeStyle = isFocus ? "#0f766e" : "#cbd5e1";
    context.lineWidth = isFocus ? 4 : 2;
    roundedRect(context, position.x - width / 2, position.y - height / 2, width, height, 8);
    context.fill();
    context.stroke();

    context.fillStyle = isFocus ? "#ffffff" : "#111827";
    context.font = "bold 17px sans-serif";
    context.fillText(fitText(context, node.name, width - 26), position.x - width / 2 + 13, position.y - 6);
    context.fillStyle = isFocus ? "#d1fae5" : "#64748b";
    context.font = "14px sans-serif";
    context.fillText(node.type, position.x - width / 2 + 13, position.y + 19);
  }

  context.fillStyle = "#475569";
  context.font = "15px sans-serif";
  context.fillText(
    `${visible.nodes.length} nodes, ${visible.edges.length} relationships exported from Cobolens`,
    56,
    canvas.height - 40,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render PNG diagram."));
    }, "image/png");
  });
}

function visibleDiagramGraph(graph: GraphDocument, focusNodeId?: string) {
  const edges = focusNodeId
    ? graph.edges.filter((edge) => edge.from === focusNodeId || edge.to === focusNodeId).slice(0, 40)
    : graph.edges.slice(0, 40);
  const nodeIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  if (focusNodeId) nodeIds.add(focusNodeId);
  const nodes = graph.nodes.filter((candidate) => nodeIds.has(candidate.id)).slice(0, 24);
  const keptNodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: edges.filter((edge) => keptNodeIds.has(edge.from) && keptNodeIds.has(edge.to)),
  };
}

function layoutNodes(nodes: GraphDocument["nodes"], width: number, height: number) {
  const positions = new Map<string, { x: number; y: number }>();
  if (!nodes.length) return positions;
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.6)));
  const rows = Math.max(1, Math.ceil(nodes.length / columns));
  const left = 150;
  const right = width - 150;
  const top = 155;
  const bottom = height - 145;
  const xGap = columns === 1 ? 0 : (right - left) / (columns - 1);
  const yGap = rows === 1 ? 0 : (bottom - top) / (rows - 1);

  nodes.forEach((node, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(node.id, {
      x: columns === 1 ? width / 2 : left + column * xGap,
      y: rows === 1 ? (top + bottom) / 2 : top + row * yGap,
    });
  });

  return positions;
}

function drawArrow(context: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const startX = fromX + Math.cos(angle) * 105;
  const startY = fromY + Math.sin(angle) * 45;
  const endX = toX - Math.cos(angle) * 105;
  const endY = toY - Math.sin(angle) * 45;
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - Math.cos(angle - Math.PI / 7) * 14, endY - Math.sin(angle - Math.PI / 7) * 14);
  context.lineTo(endX - Math.cos(angle + Math.PI / 7) * 14, endY - Math.sin(angle + Math.PI / 7) * 14);
  context.closePath();
  context.fillStyle = "#9aa7b4";
  context.fill();
}

function drawLabel(context: CanvasRenderingContext2D, value: string, x: number, y: number) {
  const text = fitText(context, value, 120);
  const metrics = context.measureText(text);
  context.fillStyle = "rgba(247, 249, 251, 0.86)";
  roundedRect(context, x - metrics.width / 2 - 8, y - 15, metrics.width + 16, 23, 6);
  context.fill();
  context.fillStyle = "#334155";
  context.fillText(text, x - metrics.width / 2, y + 3);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function fitText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) return value;
  let text = value;
  while (text.length > 1 && context.measureText(`${text}...`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}...`;
}
