import { edgeLabel, type GraphDocument, type GraphNode } from "../lib/graph";
import type { RetrievedContext } from "./context";

export function graphAnswerFallback(
  graph: GraphDocument,
  question: string,
  context: RetrievedContext,
  modelNote = "",
) {
  const matched = context.focusNodes.slice(0, 3);
  const matchedIds = new Set(matched.map((node) => node.id));
  const relevantEdges = context.edges
    .filter((edge) => matchedIds.has(edge.from) || matchedIds.has(edge.to))
    .slice(0, 8);

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

  if (question.toLocaleLowerCase().includes("depend")) {
    const incoming = relevantEdges.filter((edge) => matchedIds.has(edge.to));
    const outgoing = relevantEdges.filter((edge) => matchedIds.has(edge.from));
    lines.push(
      "",
      `Upstream or used by: ${incoming.length ? incoming.map((edge) => graph.nodes.find((node) => node.id === edge.from)?.name ?? edge.from).join(", ") : "none recorded"}.`,
      `Downstream impact: ${outgoing.length ? outgoing.map((edge) => graph.nodes.find((node) => node.id === edge.to)?.name ?? edge.to).join(", ") : "none recorded"}.`,
    );
  }

  if (modelNote) lines.push("", `Model note: ${modelNote}`);

  return {
    text: lines.join("\n"),
    citations: context.citations,
  };
}

export function isGraphQuestion(question: string) {
  return /\b(depend\w*|impact\w*|where|happen\w*|flow\w*|used by|uses|read\w*|writ\w*|mov\w*|call\w*|cop\w*|quer\w*|link\w*|xctl\w*|dataset\w*|table\w*|file\w*)\b/i.test(
    question,
  );
}

function formatMatchedNode(node: GraphNode) {
  const location = node.file ? ` at ${node.file}:${node.lines?.[0] ?? 1}` : "";
  return `${node.name} (${node.type})${location}`;
}
