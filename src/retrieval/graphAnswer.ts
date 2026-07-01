import { edgeLabel, type GraphDocument, type GraphEdge, type GraphNode } from "../lib/graph";
import type { Citation, RetrievedContext } from "./context";

type GraphQuestionIntent = "dependency" | "call" | "read" | "write" | "flow" | "where" | "general";

const CALL_EDGE_TYPES = new Set(["calls", "call", "executes", "links", "xctls"]);
const FLOW_EDGE_TYPES = new Set(["reads", "writes", "moves-to", "queries", "updates", "links", "xctls", "uses-dd", "assigned-to", "executes"]);
const FLOW_SOURCE_EDGE_TYPES = new Set(["defines", "reads", "uses-dd"]);
const READ_EDGE_TYPES = new Set(["reads"]);
const WRITE_EDGE_TYPES = new Set(["writes", "updates"]);

export function graphAnswerFallback(
  graph: GraphDocument,
  question: string,
  context: RetrievedContext,
  modelNote = "",
) {
  const matched = context.focusNodes.slice(0, 3);
  const relationshipTargets = matched.slice(0, 1);
  const matchedIds = new Set(relationshipTargets.map((node) => node.id));
  const directEdges = context.edges.filter((edge) => matchedIds.has(edge.from) || matchedIds.has(edge.to));
  const incoming = directEdges.filter((edge) => matchedIds.has(edge.to));
  const outgoing = directEdges.filter((edge) => matchedIds.has(edge.from));
  const intent = graphQuestionIntent(question);
  const dependencyScope = dependencyScopeForQuestion(question, matched[0]);
  const relevantEdges = relevantEdgesForIntent(intent, dependencyScope, directEdges, incoming, outgoing).slice(0, 8);
  const includeFallbackCitations = intent === "general";

  if (!matched.length) {
    return {
      text: [
        "I could not match that question to a symbol in the graph.",
        ...(modelNote ? ["", `Model note: ${modelNote}`] : []),
      ].join("\n"),
      citations: [],
    };
  }

  const lines = [
    "Graph answer, no model required:",
    `I matched ${matched.map(formatMatchedNode).join(", ")}.`,
  ];

  if (intent === "general") {
    lines.push("", ...graphBriefLines(graph, matched[0], incoming, outgoing, directEdges));
  }

  if (relevantEdges.length) {
    lines.push("", "Relationships that answer this:");
    for (const edge of relevantEdges) {
      const site = edge.site ? ` at ${edge.site.file}:${edge.site.line}` : "";
      lines.push(`- ${edgeLabel(edge, graph)}${site}`);
    }
  } else if (intent === "call") {
    lines.push("", "I did not find direct call or runtime-transfer relationships for the matched symbol.");
  } else {
    lines.push("", "I did not find direct relationships for the matched symbol.");
  }

  if (intent === "dependency") {
    lines.push("");
    if (dependencyScope !== "outgoing") {
      lines.push(`Upstream or used by: ${incoming.length ? incoming.map((edge) => nodeName(graph, edge.from)).join(", ") : "none recorded"}.`);
    }
    if (dependencyScope !== "incoming") {
      lines.push(`Downstream impact: ${outgoing.length ? outgoing.map((edge) => nodeName(graph, edge.to)).join(", ") : "none recorded"}.`);
    }
  }

  if (intent === "call") {
    const callEdges = outgoing.filter(isCallEdge);
    lines.push("", `Calls or runtime transfers: ${callEdges.length ? callEdges.map((edge) => nodeName(graph, edge.to)).join(", ") : "none recorded"}.`);
  }

  if (intent === "read") {
    const readTargets = outgoing.filter(isReadEdge);
    const readSources = incoming.filter(isReadEdge);
    lines.push(
      "",
      `Reads: ${readTargets.length ? uniqueNodeNames(graph, readTargets.map((edge) => edge.to)).join(", ") : "none recorded"}.`,
      `Read by: ${readSources.length ? uniqueNodeNames(graph, readSources.map((edge) => edge.from)).join(", ") : "none recorded"}.`,
    );
  }

  if (intent === "write") {
    const writeTargets = outgoing.filter(isWriteEdge);
    const writeSources = incoming.filter(isWriteEdge);
    lines.push(
      "",
      `Writes or updates: ${writeTargets.length ? uniqueNodeNames(graph, writeTargets.map((edge) => edge.to)).join(", ") : "none recorded"}.`,
      `Written or updated by: ${writeSources.length ? uniqueNodeNames(graph, writeSources.map((edge) => edge.from)).join(", ") : "none recorded"}.`,
    );
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

  if (intent === "where") {
    const locations = graphAnswerLocations(matched, relevantEdges);
    lines.push("", `Recorded locations: ${locations.length ? locations.join(", ") : "none recorded"}.`);
  }

  if (modelNote) lines.push("", `Model note: ${modelNote}`);

  return {
    text: lines.join("\n"),
    citations: graphAnswerCitations(graph, matched, relevantEdges, includeFallbackCitations ? context.citations : []),
  };
}

export function isGraphQuestion(question: string) {
  return /\b(explain\w*|summar\w*|overview|purpose|depend\w*|impact\w*|where|happen\w*|flow\w*|used by|uses|read\w*|writ\w*|mov\w*|call\w*|cop\w*|quer\w*|link\w*|xctl\w*|dataset\w*|table\w*|file\w*)\b/i.test(
    question,
  );
}

function nodeName(graph: GraphDocument, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}

function graphQuestionIntent(question: string): GraphQuestionIntent {
  if (/\b(depend\w*|impact\w*|used by|uses?)\b/i.test(question)) return "dependency";
  if (/\b(call\w*|link\w*|xctl\w*|execut\w*)\b/i.test(question)) return "call";
  if (/\bread\w*\b/i.test(question)) return "read";
  if (/\b(writ\w*|updat\w*)\b/i.test(question)) return "write";
  if (/\b(flow\w*|mov\w*|quer\w*|dataset\w*|table\w*|file\w*)\b/i.test(question)) return "flow";
  if (/\b(where|happen\w*)\b/i.test(question)) return "where";
  return "general";
}

function relevantEdgesForIntent(
  intent: GraphQuestionIntent,
  dependencyScope: "incoming" | "outgoing" | "both",
  directEdges: GraphEdge[],
  incoming: GraphEdge[],
  outgoing: GraphEdge[],
) {
  if (intent === "dependency") {
    if (dependencyScope === "incoming") return dedupeEdges(incoming);
    if (dependencyScope === "outgoing") return dedupeEdges(outgoing);
    return dedupeEdges([...incoming, ...outgoing]);
  }
  if (intent === "call") return dedupeEdges([...outgoing.filter(isCallEdge), ...incoming.filter(isCallEdge)]);
  if (intent === "read") return dedupeEdges([...outgoing.filter(isReadEdge), ...incoming.filter(isReadEdge)]);
  if (intent === "write") return dedupeEdges([...outgoing.filter(isWriteEdge), ...incoming.filter(isWriteEdge)]);
  if (intent === "flow") return dedupeEdges([...directEdges.filter(isFlowEdge), ...directEdges]);
  return directEdges;
}

function graphBriefLines(
  graph: GraphDocument,
  node: GraphNode,
  incoming: GraphEdge[],
  outgoing: GraphEdge[],
  directEdges: GraphEdge[],
) {
  const source = node.file ? ` Source: ${formatNodeLocation(node)}.` : node.external ? " Source: external to this codebase." : "";
  const lineageEdges = directEdges.filter(isFlowEdge);
  const callers = uniqueNodeNames(graph, incoming.map((edge) => edge.from));
  const dependencies = uniqueNodeNames(graph, outgoing.map((edge) => edge.to));
  const signals = [...new Set(lineageEdges.map((edge) => edge.type.toLocaleLowerCase()))].slice(0, 6);
  const lines = [
    "Graph-derived brief:",
    `- ${node.name} is a ${friendlyNodeType(node.type)}.${source}`,
    `- The graph records ${incoming.length} incoming and ${outgoing.length} outgoing relationship${incoming.length + outgoing.length === 1 ? "" : "s"}.`,
  ];

  if (callers.length) {
    lines.push(`- Used by or reached from: ${callers.join(", ")}.`);
  }
  if (dependencies.length) {
    lines.push(`- Depends on or reaches: ${dependencies.join(", ")}.`);
  }
  if (signals.length) {
    lines.push(`- Lineage signals present: ${signals.join(", ")}.`);
  }

  return lines;
}

function uniqueNodeNames(graph: GraphDocument, nodeIds: string[]) {
  return [...new Set(nodeIds.map((nodeId) => nodeName(graph, nodeId)))].slice(0, 8);
}

function friendlyNodeType(type: string) {
  return type.replace(/-/g, " ");
}

function dependencyScopeForQuestion(question: string, matched?: GraphNode): "incoming" | "outgoing" | "both" {
  if (/\b(who|what)\s+(uses?|calls?|runs?|depends on)\b/i.test(question) || /\bused by\b/i.test(question)) {
    return matched?.type === "program" ? "incoming" : "both";
  }
  if (/\bwhat\s+does\b.+\b(depend on|use|call|run)\b/i.test(question) || /\bdownstream|impact\w*\b/i.test(question)) {
    return "outgoing";
  }
  return "both";
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

function isReadEdge(edge: GraphEdge) {
  return READ_EDGE_TYPES.has(edge.type.toLocaleLowerCase());
}

function isWriteEdge(edge: GraphEdge) {
  return WRITE_EDGE_TYPES.has(edge.type.toLocaleLowerCase());
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
        endLine: node.lines?.[1],
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

function graphAnswerLocations(matched: GraphNode[], edges: GraphEdge[]) {
  const locations = [
    ...matched
      .filter((node) => node.file)
      .map(formatNodeLocation),
    ...edges
      .filter((edge) => edge.site)
      .map((edge) => `${edge.site?.file ?? ""}:${edge.site?.line ?? 1}`),
  ];
  return [...new Set(locations.filter(Boolean))].slice(0, 8);
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

function formatMatchedNode(node: GraphNode) {
  const location = node.file ? ` at ${formatNodeLocation(node)}` : "";
  return `${node.name} (${node.type})${location}`;
}

function formatNodeLocation(node: GraphNode) {
  const start = node.lines?.[0] ?? 1;
  const end = node.lines?.[1];
  return end && end !== start ? `${node.file}:${start}-${end}` : `${node.file}:${start}`;
}
