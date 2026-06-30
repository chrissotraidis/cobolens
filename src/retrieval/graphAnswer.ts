import { edgeLabel, type GraphDocument, type GraphEdge, type GraphNode } from "../lib/graph";
import type { Citation, RetrievedContext } from "./context";

type GraphQuestionIntent = "dependency" | "call" | "flow" | "where" | "general";

const CALL_EDGE_TYPES = new Set(["calls", "call", "executes", "links", "xctls"]);
const FLOW_EDGE_TYPES = new Set(["reads", "writes", "moves-to", "queries", "updates", "links", "xctls", "uses-dd", "executes"]);
const FLOW_SOURCE_EDGE_TYPES = new Set(["defines", "reads", "uses-dd"]);

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
  const intent = graphQuestionIntent(question);
  const relevantEdges = relevantEdgesForIntent(intent, directEdges, incoming, outgoing).slice(0, 8);
  const citationEdges = intent === "dependency" ? [...incoming, ...outgoing] : relevantEdges;

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

  if (intent === "dependency") {
    lines.push(
      "",
      `Upstream or used by: ${incoming.length ? incoming.map((edge) => nodeName(graph, edge.from)).join(", ") : "none recorded"}.`,
      `Downstream impact: ${outgoing.length ? outgoing.map((edge) => nodeName(graph, edge.to)).join(", ") : "none recorded"}.`,
    );
  }

  if (intent === "call") {
    const callEdges = outgoing.filter(isCallEdge);
    lines.push("", `Calls or runtime transfers: ${callEdges.length ? callEdges.map((edge) => nodeName(graph, edge.to)).join(", ") : "none recorded"}.`);
  }

  if (intent === "flow") {
    const flowEdges = directEdges.filter(isFlowEdge);
    const flowSources = incoming.filter(isFlowSourceEdge);
    const flowDestinations = outgoing.filter(isFlowEdge);
    lines.push(
      "",
      `Flow sources or definitions: ${flowSources.length ? flowSources.map((edge) => nodeName(graph, edge.from)).join(", ") : "none recorded"}.`,
      `Flow destinations: ${flowDestinations.length ? flowDestinations.map((edge) => nodeName(graph, edge.to)).join(", ") : "none recorded"}.`,
      `Flow and lineage: ${flowEdges.length ? flowEdges.map((edge) => edgeLabel(edge, graph)).join("; ") : "none recorded"}.`,
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

function graphQuestionIntent(question: string): GraphQuestionIntent {
  if (/\b(depend\w*|impact\w*|used by)\b/i.test(question)) return "dependency";
  if (/\b(call\w*|link\w*|xctl\w*|execut\w*)\b/i.test(question)) return "call";
  if (/\b(flow\w*|read\w*|writ\w*|mov\w*|quer\w*|dataset\w*|table\w*|file\w*)\b/i.test(question)) return "flow";
  if (/\b(where|happen\w*)\b/i.test(question)) return "where";
  return "general";
}

function relevantEdgesForIntent(
  intent: GraphQuestionIntent,
  directEdges: GraphEdge[],
  incoming: GraphEdge[],
  outgoing: GraphEdge[],
) {
  if (intent === "dependency") return dedupeEdges([...incoming, ...outgoing]);
  if (intent === "call") return dedupeEdges([...outgoing.filter(isCallEdge), ...incoming.filter(isCallEdge), ...outgoing, ...incoming]);
  if (intent === "flow") return dedupeEdges([...directEdges.filter(isFlowEdge), ...directEdges]);
  return directEdges;
}

function isCallEdge(edge: GraphEdge) {
  return CALL_EDGE_TYPES.has(edge.type.toLocaleLowerCase());
}

function isFlowEdge(edge: GraphEdge) {
  return FLOW_EDGE_TYPES.has(edge.type.toLocaleLowerCase());
}

function isFlowSourceEdge(edge: GraphEdge) {
  return FLOW_SOURCE_EDGE_TYPES.has(edge.type.toLocaleLowerCase());
}

function dedupeEdges(edges: GraphEdge[]) {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}:${edge.to}:${edge.type}:${edge.site?.file ?? ""}:${edge.site?.line ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
