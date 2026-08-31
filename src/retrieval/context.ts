import type { GraphDocument, GraphEdge, GraphNode, SourceExcerpt } from "../lib/graph";
import { edgeLabel, matchesFuzzy } from "../lib/graph";
import { graphIndex, incidentEdges, type GraphIndex } from "../lib/graphIndex";
import type { SemanticMatch } from "./semantic";

export type Citation = {
  file: string;
  line: number;
  endLine?: number;
  label: string;
  nodeId?: string;
};

export type RetrievedContext = {
  focusNodes: GraphNode[];
  edges: GraphEdge[];
  plannedPaths?: GraphEdge[][];
  citations: Citation[];
  prompt: string;
  semanticMatches?: SemanticMatch[];
  // Set when semantic retrieval was attempted but failed (for example the
  // embedding model is not installed). Retrieval still succeeds without it,
  // but the failure must stay visible instead of silently degrading.
  semanticError?: string;
};

export async function retrieveQuestionContext({
  graph,
  question,
  preferredNode,
  readExcerpt,
  semanticSearch,
  includeSourceExcerpts = true,
}: {
  graph: GraphDocument;
  question: string;
  preferredNode?: GraphNode | null;
  readExcerpt: (node: GraphNode) => Promise<SourceExcerpt>;
  semanticSearch?: (question: string) => Promise<SemanticMatch[]>;
  includeSourceExcerpts?: boolean;
}): Promise<RetrievedContext> {
  const rankedNodes = rankNodes(graph, question);
  let semanticError = "";
  const semanticMatches = semanticSearch
    ? await semanticSearch(question).catch((err) => {
        semanticError = err instanceof Error ? err.message : String(err);
        return [];
      })
    : [];
  const focusNodes = applyPreferredNode(
    interleaveNodes(rankedNodes, semanticMatches.map((match) => match.node)),
    preferredNode,
  ).slice(0, 6);
  const index = graphIndex(graph);
  const focusIds = new Set(focusNodes.map((node) => node.id));
  const plannedPaths = planGraphPaths(index, focusNodes, preferredNode).slice(0, 5);
  const plannedEdges = dedupeEdges(plannedPaths.flat()).slice(0, 24);
  const directEdges = dedupeEdges(focusNodes.flatMap((node) => incidentEdges(index, node.id)));
  const candidateEdges = dedupeEdges([...plannedEdges, ...directEdges]);
  const coverageEdges = coverageEdgesForQuestion(graph, question, candidateEdges);
  const edges = dedupeEdges([
    ...coverageEdges,
    ...rankEdgesForQuestion(graph, question, candidateEdges, plannedEdges),
  ]).slice(0, 24);
  const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const pathNodeIds = new Set(plannedEdges.flatMap((edge) => [edge.from, edge.to]));
  const contextNodes = uniqueNodes([
    ...focusNodes,
    ...[...pathNodeIds].map((nodeId) => index.nodeById.get(nodeId)).filter((node): node is GraphNode => Boolean(node)),
    ...semanticMatches.map((match) => match.node),
    ...[...neighborIds, ...focusIds].map((nodeId) => index.nodeById.get(nodeId)).filter((node): node is GraphNode => Boolean(node)),
  ])
    .filter((node) => node.file && !node.external)
    .slice(0, 8);

  const excerpts = includeSourceExcerpts
    ? await Promise.allSettled(contextNodes.map((node) => readExcerpt(node)))
    : [];
  const sourceExcerpts = excerpts
    .map((result, index) =>
      result.status === "fulfilled" ? formatSourceExcerpt(contextNodes[index], result.value) : "",
    )
    .filter(Boolean);
  const edgeCitations = edges
    .filter((edge) => edge.site)
    .map((edge) => ({
      file: edge.site?.file ?? "",
      line: edge.site?.line ?? 1,
      label: edgeLabel(edge, graph),
      nodeId: edge.from,
    }));
  const semanticCitations = semanticMatches.map((match) => ({
      file: match.file ?? match.node.file ?? "",
      line: match.startLine ?? match.node.lines?.[0] ?? 1,
      endLine: match.endLine ?? match.node.lines?.[1],
      label: `${match.node.name} ${match.kind === "source" ? "source" : "graph"} semantic match`,
      nodeId: match.node.id,
    }));
  const nodeCitations = contextNodes.map((node) => ({
      file: node.file ?? "",
      line: node.lines?.[0] ?? 1,
      endLine: node.lines?.[1],
      label: node.name,
      nodeId: node.id,
    }));
  const citations = dedupeCitations([
    ...edgeCitations.slice(0, 10),
    ...semanticCitations.slice(0, 4),
    ...nodeCitations.slice(0, 4),
  ]).filter((citation) => citation.file).slice(0, 18);

  return {
    focusNodes,
    edges,
    plannedPaths,
    citations,
    prompt: [
      "Question:",
      question,
      "",
      preferredNode ? `Selected symbol: ${preferredNode.name} (${preferredNode.type}) ${nodeLocation(preferredNode)}` : "Selected symbol: none",
      "",
      "Grounding rules for this context:",
      "- Treat matched and selected symbols as codebase artifacts.",
      "- Use relationship direction exactly as listed.",
      "- Cite only the graph relationship sites or source lines shown below.",
      "",
      "Matched symbols:",
      focusNodes.map((node) => `- ${node.name} (${node.type}) ${nodeLocation(node)}`).join("\n") ||
        "- None",
      "",
      "Key evidence for answering:",
      edges.slice(0, 12).map((edge) => `- ${edgeLabel(edge, graph)}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : ""}`).join("\n") || "- None",
      "",
      "Planned graph paths:",
      plannedPaths.length
        ? plannedPaths.map((path) => `- ${path.map((edge) => edgeLabel(edge, graph)).join(" | ")}`).join("\n")
        : "- None",
      "",
      "Graph relationships:",
      edges.map((edge) => `- ${edgeLabel(edge, graph)}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : ""}`).join("\n") ||
        "- None",
      "",
      "Semantic vector matches:",
      semanticMatches.length
        ? semanticMatches.map((match) => `- ${match.node.name} (${match.node.type}) score ${match.score.toFixed(3)}: ${match.text}`).join("\n")
        : semanticError
          ? `- Unavailable (${semanticError})`
          : "- None",
      "",
      "Source excerpts (line-numbered):",
      sourceExcerpts.join("\n\n") || "No source excerpt available.",
    ].join("\n"),
    semanticMatches,
    semanticError: semanticError || undefined,
  };
}

function applyPreferredNode(rankedNodes: GraphNode[], preferredNode: GraphNode | null | undefined) {
  if (!preferredNode) return rankedNodes;
  return [preferredNode, ...rankedNodes.filter((node) => node.id !== preferredNode.id)];
}

function interleaveNodes(primary: GraphNode[], secondary: GraphNode[]) {
  const mixed: GraphNode[] = [];
  const count = Math.max(primary.length, secondary.length);
  for (let index = 0; index < count; index += 1) {
    if (primary[index]) mixed.push(primary[index]);
    if (secondary[index]) mixed.push(secondary[index]);
  }
  return uniqueNodes(mixed);
}

function planGraphPaths(index: GraphIndex, focusNodes: GraphNode[], preferredNode?: GraphNode | null) {
  if (focusNodes.length < 2) return [];
  const anchor = preferredNode && focusNodes.some((node) => node.id === preferredNode.id)
    ? preferredNode
    : focusNodes[0];
  const targets = focusNodes.filter((node) => node.id !== anchor.id).slice(0, 5);
  return targets
    .map((target) => shortestUndirectedPath(index, anchor.id, target.id, 6))
    .filter((path): path is GraphEdge[] => Boolean(path?.length));
}

function shortestUndirectedPath(index: GraphIndex, startId: string, targetId: string, maxEdges: number) {
  if (startId === targetId) return [];
  const queue: Array<{ nodeId: string; path: GraphEdge[] }> = [{ nodeId: startId, path: [] }];
  const visited = new Set([startId]);
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.path.length >= maxEdges) continue;
    for (const edge of incidentEdges(index, current.nodeId)) {
      const next = edge.from === current.nodeId ? edge.to : edge.from;
      if (visited.has(next)) continue;
      const path = [...current.path, edge];
      if (next === targetId) return path;
      visited.add(next);
      queue.push({ nodeId: next, path });
    }
  }
  return null;
}

function uniqueNodes(nodes: GraphNode[]) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function rankNodes(graph: GraphDocument, question: string) {
  const tokens = question
    .toLocaleLowerCase()
    .split(/[^a-z0-9_-]+/i)
    .filter((token) => token.length > 1);
  const symbolTokens = meaningfulSymbolTokens(question);

  return graph.nodes
    .map((node) => ({ node, score: scoreNode(node, question, tokens, symbolTokens) }))
    .filter((entry) => entry.score < 100)
    .sort((left, right) => left.score - right.score)
    .map((entry) => entry.node);
}

function scoreNode(node: GraphNode, question: string, tokens: string[], symbolTokens: string[]) {
  const name = node.name.toLocaleLowerCase();
  const id = node.id.toLocaleLowerCase();
  const haystack = `${name} ${id} ${node.type}`;
  const nameTokens = tokenizeSymbolText(node.name);
  if (question.toLocaleLowerCase().includes(name) && (nameTokens.length > 1 || symbolTokens.length <= 1)) {
    return typePriority(node.type, question);
  }
  if (
    symbolTokens.length <= 1 &&
    tokens.some((token) => token === name || id.endsWith(`:${token}`) || id.endsWith(`/${token}`))
  ) {
    return typePriority(node.type, question);
  }

  if (symbolTokens.length) {
    const nodeTokens = new Set(tokenizeSymbolText(node.name));
    const hits = symbolTokens.filter((token) => nodeTokens.has(token) || name.includes(token));
    if (hits.length) {
      const misses = symbolTokens.length - new Set(hits).size;
      return 10 + misses * 12 - hits.length * 3 + typePriority(node.type, question) + nodeNameHint(node, question);
    }
  }

  if (tokens.some((token) => name.includes(token))) {
    return 40 + typePriority(node.type, question) + nodeNameHint(node, question);
  }

  if (matchesFuzzy(haystack, question)) {
    return 50 + typePriority(node.type, question);
  }
  return 100;
}

const SYMBOL_STOP_WORDS = new Set([
  "what",
  "where",
  "which",
  "who",
  "does",
  "with",
  "from",
  "into",
  "onto",
  "that",
  "this",
  "the",
  "and",
  "uses",
  "used",
  "use",
  "depends",
  "depend",
  "impact",
  "flow",
  "flows",
  "happen",
  "happens",
  "call",
  "calls",
  "read",
  "reads",
  "write",
  "writes",
  "move",
  "moves",
  "query",
  "queries",
  "file",
  "dataset",
  "table",
  "program",
  "copybook",
  "field",
  "data",
  "item",
]);

function meaningfulSymbolTokens(text: string) {
  return tokenizeSymbolText(text).filter((token) => !SYMBOL_STOP_WORDS.has(token));
}

function tokenizeSymbolText(text: string) {
  return text
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1);
}

function typePriority(type: string, question = "") {
  const asksForDataStore = /\b(file|dataset|dd|dsn)\b/i.test(question);
  const asksForTable = /\b(table|sql|db2)\b/i.test(question);
  const asksForProgram = /\b(program|job|step|call|run|exec)\b/i.test(question);
  if (asksForDataStore) {
    if (type === "dataset") return 0;
    if (type === "jcl-dd") return 1;
    return 8 + baseTypePriority(type);
  }
  if (asksForTable && type === "db2-table") return 0;
  if (asksForProgram && type === "program") return 0;

  return baseTypePriority(type);
}

function baseTypePriority(type: string) {
  if (type === "program") return 0;
  if (type === "paragraph") return 1;
  if (type === "copybook") return 2;
  if (type === "dataset") return 3;
  if (type === "jcl-dd") return 4;
  return 4;
}

function nodeNameHint(node: GraphNode, question: string) {
  const name = node.name.toLocaleLowerCase();
  if (/\bfile\b/i.test(question) && name.includes("file")) return -2;
  if (/\bdd\b/i.test(question) && node.type === "jcl-dd") return -2;
  return 0;
}

function nodeLocation(node: GraphNode) {
  if (!node.file) return "external";
  const start = node.lines?.[0] ?? 1;
  const end = node.lines?.[1];
  return end && end !== start ? `${node.file}:${start}-${end}` : `${node.file}:${start}`;
}

function formatSourceExcerpt(node: GraphNode, excerpt: SourceExcerpt) {
  const range =
    excerpt.endLine && excerpt.endLine !== excerpt.startLine
      ? `${excerpt.file}:${excerpt.startLine}-${excerpt.endLine}`
      : `${excerpt.file}:${excerpt.startLine}`;
  return [
    `Source excerpt for ${node.name} (${node.type}) at ${range}${excerpt.truncated ? " (truncated)" : ""}:`,
    excerpt.text,
  ].join("\n");
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

function dedupeEdges(edges: GraphEdge[]) {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}:${edge.to}:${edge.type}:${edge.site?.file ?? ""}:${edge.site?.line ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rankEdgesForQuestion(
  graph: GraphDocument,
  question: string,
  edges: GraphEdge[],
  plannedEdges: GraphEdge[],
) {
  const nodeById = graphIndex(graph).nodeById;
  const planned = new Set(plannedEdges);
  return edges
    .map((edge, index) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      const artifactText = `${from?.name ?? edge.from} ${to?.name ?? edge.to} ${from?.type ?? ""} ${to?.type ?? ""}`;
      const type = edge.type.toLocaleLowerCase();
      let score = planned.has(edge) ? -12 : 0;
      if (/\brate\b/i.test(question) && /rate/i.test(artifactText)) score -= 30;
      if (/\breport\b/i.test(question) && /report/i.test(artifactText)) score -= 24;
      if (/\b(customer|input|dataset|file)\b/i.test(question) && /(customer|dataset|jcl-dd)/i.test(artifactText)) score -= 20;
      if (["reads", "writes", "moves-to", "assigned-to", "uses-dd", "queries", "updates"].includes(type)) score -= 8;
      return { edge, index, score };
    })
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ edge }) => edge);
}

function coverageEdgesForQuestion(graph: GraphDocument, question: string, edges: GraphEdge[]) {
  const nodeById = graphIndex(graph).nodeById;
  const artifactText = (edge: GraphEdge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    return `${from?.name ?? edge.from} ${to?.name ?? edge.to} ${from?.type ?? ""} ${to?.type ?? ""}`;
  };
  const find = (type: string, pattern?: RegExp) => edges.find((edge) =>
    edge.type.toLocaleLowerCase() === type && (!pattern || pattern.test(artifactText(edge))),
  );
  const coverage: Array<GraphEdge | undefined> = [];

  if (/\b(customer|input|dataset|file|data)\b/i.test(question)) {
    coverage.push(find("uses-dd", /(customer|dataset)/i));
    coverage.push(find("assigned-to", /(customer|cust)/i));
    coverage.push(find("reads", /(customer|file)/i));
  }
  if (/\brate\b/i.test(question)) {
    coverage.push(find("queries"));
    coverage.push(find("moves-to", /rate/i));
  }
  if (/\breport\b/i.test(question)) {
    coverage.push(find("writes", /report/i));
    coverage.push(find("moves-to", /report/i));
  }

  return coverage.filter((edge): edge is GraphEdge => Boolean(edge));
}
