import type { GraphDocument, GraphEdge, GraphNode, SourceExcerpt } from "../lib/graph";
import { edgeLabel, matchesFuzzy } from "../lib/graph";

export type Citation = {
  file: string;
  line: number;
  label: string;
  nodeId?: string;
};

export type RetrievedContext = {
  focusNodes: GraphNode[];
  edges: GraphEdge[];
  citations: Citation[];
  prompt: string;
};

export async function retrieveQuestionContext({
  graph,
  question,
  readExcerpt,
}: {
  graph: GraphDocument;
  question: string;
  readExcerpt: (node: GraphNode) => Promise<SourceExcerpt>;
}): Promise<RetrievedContext> {
  const focusNodes = rankNodes(graph, question).slice(0, 4);
  const focusIds = new Set(focusNodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => focusIds.has(edge.from) || focusIds.has(edge.to))
    .slice(0, 32);
  const neighborIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const contextNodes = graph.nodes
    .filter((node) => neighborIds.has(node.id) || focusIds.has(node.id))
    .filter((node) => node.file && !node.external)
    .slice(0, 8);

  const excerpts = await Promise.allSettled(contextNodes.map((node) => readExcerpt(node)));
  const citations = dedupeCitations([
    ...contextNodes.map((node) => ({
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
  ]).filter((citation) => citation.file);

  return {
    focusNodes,
    edges,
    citations,
    prompt: [
      "Question:",
      question,
      "",
      "Matched symbols:",
      focusNodes.map((node) => `- ${node.name} (${node.type}) ${node.file ?? "external"}:${node.lines?.[0] ?? 1}`).join("\n") ||
        "- None",
      "",
      "Graph relationships:",
      edges.map((edge) => `- ${edgeLabel(edge, graph)}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : ""}`).join("\n") ||
        "- None",
      "",
      "Source excerpts:",
      excerpts
        .map((result) => (result.status === "fulfilled" ? result.value.text : ""))
        .filter(Boolean)
        .join("\n\n") || "No source excerpt available.",
    ].join("\n"),
  };
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

function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.file}:${citation.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
