import { edgeLabel, type GraphDocument, type GraphEdge, type GraphNode } from "../lib/graph";
import type { Citation, RetrievedContext } from "./context";

type GraphQuestionIntent = "orientation" | "dependency" | "call" | "read" | "write" | "flow" | "where" | "general";

const CALL_EDGE_TYPES = new Set(["calls", "call", "executes", "links", "xctls"]);
const FLOW_EDGE_TYPES = new Set(["reads", "writes", "moves-to", "queries", "updates", "links", "xctls", "uses-dd", "assigned-to", "executes"]);
const FLOW_SOURCE_EDGE_TYPES = new Set(["defines", "reads", "uses-dd"]);
const READ_EDGE_TYPES = new Set(["reads"]);
const WRITE_EDGE_TYPES = new Set(["writes", "updates"]);
const MAX_CONNECTION_PATH_EDGES = 5;

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
  const connectionPath =
    matched.length > 1 && ["flow", "dependency", "general"].includes(intent)
      ? shortestConnectionPath(graph, matched[0].id, matched[1].id)
      : [];
  const includeFallbackCitations = intent === "general";

  if (intent === "orientation") {
    return graphOrientationAnswer(graph, modelNote);
  }

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
    modelNote ? "Graph-grounded fallback:" : "Graph answer, no model required:",
    `I matched ${matched.map(formatMatchedNode).join(", ")}.`,
  ];

  if (intent === "general") {
    lines.push("", ...graphBriefLines(graph, matched[0], incoming, outgoing, directEdges));
  }

  if (connectionPath.length) {
    lines.push("", `Connection path from ${matched[0].name} to ${matched[1].name}:`);
    for (const edge of connectionPath) {
      const site = edge.site ? ` at ${edge.site.file}:${edge.site.line}` : "";
      lines.push(`- ${edgeLabel(edge, graph)}${site}`);
    }
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
    citations: graphAnswerCitations(graph, matched, [...connectionPath, ...relevantEdges], includeFallbackCitations ? context.citations : []),
  };
}

export function isGraphQuestion(question: string) {
  if (isOrientationQuestion(question)) return true;
  if (isSelectedSymbolOverviewQuestion(question)) return true;
  if (isExplicitGraphExplanationQuestion(question)) return true;
  if (isInterpretiveModelQuestion(question)) return false;
  return /\b(overview|depend\w*|impact\w*|where|happen\w*|feed\w*|flow\w*|used by|uses|read\w*|writ\w*|mov\w*|call\w*|cop\w*|quer\w*|link\w*|xctl\w*|dataset\w*|table\w*|file\w*)\b/i.test(
    question,
  );
}

function nodeName(graph: GraphDocument, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}

function graphQuestionIntent(question: string): GraphQuestionIntent {
  if (isOrientationQuestion(question)) return "orientation";
  if (/\b(depend\w*|impact\w*|used by|uses?)\b/i.test(question)) return "dependency";
  if (/\b(call\w*|link\w*|xctl\w*|execut\w*)\b/i.test(question)) return "call";
  if (/\bread\w*\b/i.test(question)) return "read";
  if (/\b(writ\w*|updat\w*)\b/i.test(question)) return "write";
  if (/\b(feed\w*|flow\w*|mov\w*|quer\w*|dataset\w*|table\w*|file\w*)\b/i.test(question)) return "flow";
  if (/\b(where|happen\w*)\b/i.test(question)) return "where";
  return "general";
}

function isSelectedSymbolOverviewQuestion(question: string) {
  return /\b(what\s+does\s+(?:this|that|selected|current)\s+(?:program|copybook|job|step|symbol|node|unit|paragraph|section|dataset|file|table)\s+do|what\s+is\s+(?:this|that|selected|current)\s+(?:program|copybook|job|step|symbol|node|unit|paragraph|section|dataset|file|table)|tell\s+me\s+about\s+(?:this|that|selected|current)\s+(?:program|copybook|job|step|symbol|node|unit|paragraph|section|dataset|file|table))\b/i.test(
    question,
  );
}

function isExplicitGraphExplanationQuestion(question: string) {
  return /\b(?:from|using|with)\s+(?:the\s+)?graph\b|\bgraph[- ](?:derived|grounded|only)\b/i.test(question);
}

function isInterpretiveModelQuestion(question: string) {
  return /\b(explain\w*|summari[sz]\w*|purpose|business\s+(?:logic|rule|rules|meaning)|plain\s+english|new\s+developer|walk\s+me\s+through|what\s+does\s+\w+\s+do)\b/i.test(
    question,
  );
}

function isOrientationQuestion(question: string) {
  return /\b(where\s+should\s+i\s+start|what\s+should\s+i\s+inspect\s+first|inspect\s+first|start(?:ing)?\s+point|entry\s+point|entry\s+points|first\s+thing\s+to\s+inspect|codebase\s+overview|overview\s+of\s+(?:this\s+)?codebase|summari[sz]e\s+(?:this\s+)?codebase|what\s+is\s+(?:in\s+)?this\s+codebase|how\s+is\s+(?:this\s+)?codebase\s+structured)\b/i.test(
    question,
  );
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

function graphOrientationAnswer(graph: GraphDocument, modelNote = "") {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const programs = sourceNodesByType(graph, "program");
  const copybooks = sourceNodesByType(graph, "copybook");
  const jobs = sourceNodesByType(graph, "jcl-job");
  const entryEdges = dedupeEdges(
    graph.edges.filter((edge) => edge.type.toLocaleLowerCase() === "runs" && nodeById.get(edge.to)?.type === "program"),
  ).slice(0, 3);
  const highConnectionNodes = graph.nodes
    .filter((node) => node.file && !node.external && ["program", "copybook", "jcl-job", "jcl-step"].includes(node.type))
    .map((node) => ({ node, degree: graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).length }))
    .filter(({ degree }) => degree > 0)
    .sort((left, right) => right.degree - left.degree || left.node.name.localeCompare(right.node.name))
    .slice(0, 4);
  const sharedCopybooks = copybooks
    .map((node) => ({
      node,
      incomingCopies: graph.edges.filter((edge) => edge.to === node.id && edge.type.toLocaleLowerCase() === "copies"),
    }))
    .filter(({ incomingCopies }) => incomingCopies.length)
    .sort((left, right) => right.incomingCopies.length - left.incomingCopies.length || left.node.name.localeCompare(right.node.name))
    .slice(0, 3);
  const dataStoreEdges = dedupeEdges(
    graph.edges.filter((edge) => {
      const type = edge.type.toLocaleLowerCase();
      const targetType = nodeById.get(edge.to)?.type;
      return ["reads", "writes", "uses-dd", "assigned-to"].includes(type) && ["dataset", "jcl-dd"].includes(targetType ?? "");
    }),
  ).slice(0, 4);

  const lines = [
    modelNote ? "Graph-grounded fallback:" : "Graph answer, no model required:",
    `I found ${programs.length} source program${programs.length === 1 ? "" : "s"}, ${copybooks.length} copybook${copybooks.length === 1 ? "" : "s"}, and ${jobs.length} JCL job${jobs.length === 1 ? "" : "s"}.`,
    "",
    "Best starting points from the dependency graph:",
  ];

  if (entryEdges.length) {
    lines.push("Start with the JCL entry wiring:");
    for (const edge of entryEdges) {
      const site = edge.site ? ` at ${edge.site.file}:${edge.site.line}` : "";
      lines.push(`- ${edgeLabel(edge, graph)}${site}`);
    }
  } else if (programs.length) {
    lines.push("Start with the source programs that have the most recorded relationships:");
  }

  if (highConnectionNodes.length) {
    lines.push("", "Then inspect the highest-connection source units:");
    for (const { node, degree } of highConnectionNodes) {
      lines.push(`- ${node.name} (${friendlyNodeType(node.type)}) has ${degree} recorded relationship${degree === 1 ? "" : "s"} at ${formatNodeLocation(node)}.`);
    }
  }

  if (sharedCopybooks.length) {
    lines.push("", "Shared copybooks are good schema/layout anchors:");
    for (const { node, incomingCopies } of sharedCopybooks) {
      lines.push(`- ${node.name} is copied by ${uniqueNodeNames(graph, incomingCopies.map((edge) => edge.from)).join(", ")}.`);
    }
  }

  if (dataStoreEdges.length) {
    lines.push("", "Data-store wiring worth checking next:");
    for (const edge of dataStoreEdges) {
      const site = edge.site ? ` at ${edge.site.file}:${edge.site.line}` : "";
      lines.push(`- ${edgeLabel(edge, graph)}${site}`);
    }
  }

  if (modelNote) lines.push("", `Model note: ${modelNote}`);

  return {
    text: lines.join("\n"),
    citations: graphAnswerCitations(
      graph,
      highConnectionNodes.map(({ node }) => node),
      [...entryEdges, ...dataStoreEdges, ...sharedCopybooks.flatMap(({ incomingCopies }) => incomingCopies)],
      [],
    ),
  };
}

function sourceNodesByType(graph: GraphDocument, type: string) {
  return graph.nodes.filter((node) => node.type === type && node.file && !node.external);
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

function shortestConnectionPath(graph: GraphDocument, startId: string, endId: string) {
  if (startId === endId) return [];
  const adjacency = new Map<string, Array<{ nodeId: string; edge: GraphEdge }>>();
  for (const edge of graph.edges) {
    const fromEdges = adjacency.get(edge.from) ?? [];
    fromEdges.push({ nodeId: edge.to, edge });
    adjacency.set(edge.from, fromEdges);

    const toEdges = adjacency.get(edge.to) ?? [];
    toEdges.push({ nodeId: edge.from, edge });
    adjacency.set(edge.to, toEdges);
  }

  const queue: Array<{ nodeId: string; path: GraphEdge[] }> = [{ nodeId: startId, path: [] }];
  const seen = new Set([startId]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.path.length >= MAX_CONNECTION_PATH_EDGES) continue;
    for (const next of adjacency.get(current.nodeId) ?? []) {
      if (seen.has(next.nodeId)) continue;
      const nextPath = [...current.path, next.edge];
      if (next.nodeId === endId) return dedupeEdges(nextPath);
      seen.add(next.nodeId);
      queue.push({ nodeId: next.nodeId, path: nextPath });
    }
  }

  return [];
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
