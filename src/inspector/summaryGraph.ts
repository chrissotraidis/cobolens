import type { GraphDocument, GraphEdge, GraphNode } from "../lib/graph";
import { edgeLabel } from "../lib/graph";
import type { UnitSummary } from "../model/summaries";
import type { Citation } from "../retrieval/context";

const LINEAGE_EDGE_TYPES = new Set(["reads", "writes", "moves-to", "queries", "updates", "links", "xctls", "uses-dd", "assigned-to", "executes"]);

export function summaryEvidenceCitations(node: GraphNode, graph: GraphDocument) {
  const citations: Citation[] = [];
  if (node.file) {
    citations.push({
      file: node.file,
      line: node.lines?.[0] ?? 1,
      endLine: node.lines?.[1],
      label: `${node.name} source`,
      nodeId: node.id,
    });
  }

  for (const edge of graph.edges) {
    if (edge.from !== node.id && edge.to !== node.id) continue;
    if (!edge.site) continue;
    citations.push({
      file: edge.site.file,
      line: edge.site.line,
      label: edgeLabel(edge, graph),
      nodeId: edge.from,
    });
    if (citations.length >= 7) break;
  }

  return dedupeCitations(citations).slice(0, 6);
}

export function nodeGraphOverview(node: GraphNode, graph: GraphDocument) {
  const incoming = graph.edges.filter((edge) => edge.to === node.id);
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const lineage = [...incoming, ...outgoing].filter(isLineageEdge);
  const bridgeInsight = cobolFileBridgeInsight(node, graph, incoming, outgoing);
  const location = node.file ? `${node.file}:${node.lines?.[0] ?? 1}` : "external";
  const parts = [
    `${node.name} is a ${node.type}${node.external ? " outside this codebase" : ""}.`,
    `Source: ${location}.`,
    `${incoming.length} incoming and ${outgoing.length} outgoing relationships are recorded.`,
  ];
  if (bridgeInsight) {
    parts.push(bridgeInsight);
  }
  if (lineage.length) {
    parts.push(`${lineage.length} lineage relationship${lineage.length === 1 ? " is" : "s are"} available for reads, writes, moves, queries, links, or runtime wiring.`);
  }
  return parts.join(" ");
}

export function selectedNodeGraphAnswer(node: GraphNode, graph: GraphDocument): { text: string; citations: Citation[] } {
  const incoming = graph.edges.filter((edge) => edge.to === node.id);
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const lineage = [...incoming, ...outgoing].filter(isLineageEdge);
  const relatedNames = (edges: GraphEdge[], side: "from" | "to") =>
    compactNodeNames(
      edges
        .map((edge) => graph.nodes.find((candidate) => candidate.id === edge[side])?.name)
        .filter((name): name is string => Boolean(name)),
    );
  const relationshipCitations = [...outgoing, ...incoming]
    .filter((edge) => edge.site)
    .slice(0, 8)
    .map((edge) => ({
      file: edge.site?.file ?? "",
      line: edge.site?.line ?? 1,
      label: edgeLabel(edge, graph),
      nodeId: edge.from,
    }));
  const relationshipLines = relationshipCitations.map((citation) => `- ${citation.label} at ${citation.file}:${citation.line}`);
  const location = nodeLocationLabel(node);
  const brief = [
    `${node.name} is a ${node.type}${node.external ? " outside this codebase" : ""}. Source: ${location}.`,
    `The graph records ${incoming.length} incoming and ${outgoing.length} outgoing relationships.`,
  ];
  const incomingNames = relatedNames(incoming, "from");
  const outgoingNames = relatedNames(outgoing, "to");
  if (incomingNames) brief.push(`Used by or reached from: ${incomingNames}.`);
  if (outgoingNames) brief.push(`Depends on or reaches: ${outgoingNames}.`);
  if (lineage.length) {
    brief.push(`Lineage signals present: ${compactWords(lineage.map((edge) => edge.type))}.`);
  }

  return {
    text: [
      `I answered from the graph: I matched the selected ${node.name} at ${location}.`,
      "",
      `${node.name} at a glance:`,
      ...brief.map((line) => `- ${line}`),
      ...(relationshipLines.length ? ["", "Evidence highlights:", ...relationshipLines.slice(0, 4)] : []),
    ].join("\n"),
    citations: dedupeCitations([
      ...(node.file
        ? [{
            file: node.file,
            line: node.lines?.[0] ?? 1,
            endLine: node.lines?.[1],
            label: `${node.name} source`,
            nodeId: node.id,
          }]
        : []),
      ...relationshipCitations,
    ]),
  };
}

export function graphBackedSummaryFallback(
  graph: GraphDocument,
  node: GraphNode,
  summary: UnitSummary,
  reason: string,
): UnitSummary {
  return {
    ...summary,
    text: [nodeGraphOverview(node, graph), "", `Model note: ${reason}`].join("\n"),
    guarded: true,
    guardReason: reason,
  };
}

function cobolFileBridgeInsight(
  node: GraphNode,
  graph: GraphDocument,
  incoming: GraphEdge[],
  outgoing: GraphEdge[],
) {
  const nodes = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const assignedOut = outgoing.find((edge) => edge.type.toLocaleLowerCase() === "assigned-to");
  if (assignedOut) {
    const dd = nodes.get(assignedOut.to);
    const datasetEdge = graph.edges.find((edge) => edge.from === assignedOut.to && edge.type.toLocaleLowerCase() === "uses-dd");
    const dataset = datasetEdge ? nodes.get(datasetEdge.to) : null;
    return dataset && dd
      ? `COBOL SELECT maps this logical file to DD ${dd.name}, which resolves to dataset ${dataset.name}.`
      : dd
        ? `COBOL SELECT maps this logical file to DD ${dd.name}.`
        : "";
  }

  const usesOut = outgoing.find((edge) => edge.type.toLocaleLowerCase() === "uses-dd");
  if (node.type === "jcl-dd" && usesOut) {
    const dataset = nodes.get(usesOut.to);
    const logicalFiles = incoming
      .filter((edge) => edge.type.toLocaleLowerCase() === "assigned-to")
      .map((edge) => nodes.get(edge.from)?.name)
      .filter((name): name is string => Boolean(name));
    if (dataset && logicalFiles.length) {
      return `This DD bridges COBOL ${logicalFiles.join(", ")} to physical dataset ${dataset.name}.`;
    }
    if (dataset) return `This DD resolves to physical dataset ${dataset.name}.`;
  }

  if (node.type === "dataset") {
    const ddEdge = incoming.find((edge) => edge.type.toLocaleLowerCase() === "uses-dd");
    const dd = ddEdge ? nodes.get(ddEdge.from) : null;
    const logicalFiles = dd
      ? graph.edges
          .filter((edge) => edge.to === dd.id && edge.type.toLocaleLowerCase() === "assigned-to")
          .map((edge) => nodes.get(edge.from)?.name)
          .filter((name): name is string => Boolean(name))
      : [];
    if (dd && logicalFiles.length) {
      return `JCL DD ${dd.name} connects COBOL ${logicalFiles.join(", ")} to this dataset.`;
    }
  }

  return "";
}

function isLineageEdge(edge: GraphEdge) {
  return LINEAGE_EDGE_TYPES.has(edge.type.toLocaleLowerCase());
}

function nodeLocationLabel(node: GraphNode) {
  if (!node.file) return "external";
  const start = node.lines?.[0] ?? 1;
  const end = node.lines?.[1];
  return end && end !== start ? `${node.file}:${start}-${end}` : `${node.file}:${start}`;
}

function compactNodeNames(names: string[]) {
  const unique = [...new Set(names)];
  if (!unique.length) return "";
  const visible = unique.slice(0, 8);
  const hiddenCount = unique.length - visible.length;
  return hiddenCount ? `${visible.join(", ")} +${hiddenCount} more` : visible.join(", ");
}

function compactWords(words: string[]) {
  return [...new Set(words)].join(", ");
}

function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.file}:${citation.line}:${citation.endLine ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
