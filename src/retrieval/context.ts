import type { GraphDocument, GraphEdge, GraphNode, SourceExcerpt } from "../lib/graph";
import { edgeLabel, matchesFuzzy } from "../lib/graph";
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
  citations: Citation[];
  prompt: string;
  semanticMatches?: SemanticMatch[];
};

export async function retrieveQuestionContext({
  graph,
  question,
  preferredNode,
  readExcerpt,
  semanticSearch,
}: {
  graph: GraphDocument;
  question: string;
  preferredNode?: GraphNode | null;
  readExcerpt: (node: GraphNode) => Promise<SourceExcerpt>;
  semanticSearch?: (question: string) => Promise<SemanticMatch[]>;
}): Promise<RetrievedContext> {
  const rankedNodes = rankNodes(graph, question);
  const semanticMatches = semanticSearch ? await semanticSearch(question).catch(() => []) : [];
  const focusNodes = applyPreferredNode(
    uniqueNodes([...rankedNodes, ...semanticMatches.map((match) => match.node)]),
    preferredNode,
    question,
  ).slice(0, 4);
  const focusIds = new Set(focusNodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => focusIds.has(edge.from) || focusIds.has(edge.to))
    .slice(0, 32);
  const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const contextNodes = uniqueNodes([
    ...focusNodes,
    ...semanticMatches.map((match) => match.node),
    ...graph.nodes.filter((node) => neighborIds.has(node.id) || focusIds.has(node.id)),
  ])
    .filter((node) => node.file && !node.external)
    .slice(0, 8);

  const excerpts = await Promise.allSettled(contextNodes.map((node) => readExcerpt(node)));
  const sourceExcerpts = excerpts
    .map((result, index) =>
      result.status === "fulfilled" ? formatSourceExcerpt(contextNodes[index], result.value) : "",
    )
    .filter(Boolean);
  const citations = dedupeCitations([
    ...contextNodes.map((node) => ({
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
  ]).filter((citation) => citation.file);

  return {
    focusNodes,
    edges,
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
      "Graph relationships:",
      edges.map((edge) => `- ${edgeLabel(edge, graph)}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : ""}`).join("\n") ||
        "- None",
      "",
      "Semantic vector matches:",
      semanticMatches.length
        ? semanticMatches.map((match) => `- ${match.node.name} (${match.node.type}) score ${match.score.toFixed(3)}: ${match.text}`).join("\n")
        : "- None",
      "",
      "Source excerpts (line-numbered):",
      sourceExcerpts.join("\n\n") || "No source excerpt available.",
    ].join("\n"),
    semanticMatches,
  };
}

function applyPreferredNode(rankedNodes: GraphNode[], preferredNode: GraphNode | null | undefined, question: string) {
  if (!preferredNode) return rankedNodes;
  if (isSelectedNodeReference(question)) return [preferredNode];
  if (!shouldPreferSelectedNode(question, rankedNodes)) return rankedNodes;
  return [preferredNode, ...rankedNodes.filter((node) => node.id !== preferredNode.id)];
}

function shouldPreferSelectedNode(question: string, rankedNodes: GraphNode[]) {
  if (!rankedNodes.length) return true;
  return isSelectedNodeReference(question);
}

function isSelectedNodeReference(question: string) {
  return /\b(this|that|it|its|selected|current)\b/i.test(question);
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
