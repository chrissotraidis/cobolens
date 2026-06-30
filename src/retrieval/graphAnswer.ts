import { edgeLabel, type GraphDocument, type GraphEdge, type GraphNode } from "../lib/graph";
import type { Citation, RetrievedContext } from "./context";

export function graphAnswerFallback(
  graph: GraphDocument,
  question: string,
  context: RetrievedContext,
  modelNote = "",
) {
  const matched = context.focusNodes.slice(0, 3);
  const matchedIds = new Set(matched.map((node) => node.id));
  const directEdges = context.edges.filter((edge) => matchedIds.has(edge.from) || matchedIds.has(edge.to));
  const incoming = directEdges.filter((edge) => matchedIds.has(edge.to));
  const outgoing = directEdges.filter((edge) => matchedIds.has(edge.from));
  const isDependencyQuestion = question.toLocaleLowerCase().includes("depend");
  const relevantEdges = (isDependencyQuestion ? [...incoming, ...outgoing] : directEdges).slice(0, 8);
  const citationEdges = isDependencyQuestion ? [...incoming, ...outgoing] : relevantEdges;

  if (!matched.length) {
    return {
      text: [
        "I could not match that question to a symbol in the graph.",
        ...(modelNote ? ["", `Model note: ${modelNote}`] : []),
      ].join("\n"),
      citations: context.citations,
    };
  }

  const lines = [
    "Graph answer, no model required:",
    `I matched ${matched.map(formatMatchedNode).join(", ")}.`,
  ];

  if (relevantEdges.length) {
    lines.push("", "Relevant relationships:");
    for (const edge of relevantEdges) {
      const site = edge.site ? ` at ${edge.site.file}:${edge.site.line}` : "";
      lines.push(`- ${edgeLabel(edge, graph)}${site}`);
    }
  } else {
    lines.push("", "I did not find direct relationships for the matched symbol.");
  }

  if (isDependencyQuestion) {
    lines.push(
      "",
      `Upstream or used by: ${incoming.length ? incoming.map((edge) => nodeName(graph, edge.from)).join(", ") : "none recorded"}.`,
      `Downstream impact: ${outgoing.length ? outgoing.map((edge) => nodeName(graph, edge.to)).join(", ") : "none recorded"}.`,
    );
  }

  if (modelNote) lines.push("", `Model note: ${modelNote}`);

  return {
    text: lines.join("\n"),
    citations: graphAnswerCitations(graph, matched, citationEdges, context.citations),
  };
}

export function isGraphQuestion(question: string) {
  return /\b(depend\w*|impact\w*|where|happen\w*|flow\w*|used by|uses|read\w*|writ\w*|mov\w*|call\w*|cop\w*|quer\w*|link\w*|xctl\w*|dataset\w*|table\w*|file\w*)\b/i.test(
    question,
  );
}

function nodeName(graph: GraphDocument, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}

function graphAnswerCitations(
  graph: GraphDocument,
  matched: GraphNode[],
  edges: GraphEdge[],
  fallback: Citation[],
) {
  return dedupeCitations([
    ...matched
      .filter((node) => node.file)
      .map((node) => ({
        file: node.file ?? "",
        line: node.lines?.[0] ?? 1,
        label: node.name,
        nodeId: node.id,
      })),
    ...edges
      .filter((edge) => edge.site)
      .map((edge) => ({
        file: edge.site?.file ?? "",
        line: edge.site?.line ?? 1,
        label: edgeLabel(edge, graph),
        nodeId: edge.from,
      })),
    ...fallback,
  ]).filter((citation) => citation.file);
}

function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.file}:${citation.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatMatchedNode(node: GraphNode) {
  const location = node.file ? ` at ${node.file}:${node.lines?.[0] ?? 1}` : "";
  return `${node.name} (${node.type})${location}`;
}
