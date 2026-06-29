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

  return graph.nodes
    .map((node) => ({ node, score: scoreNode(node, question, tokens) }))
    .filter((entry) => entry.score < 100)
    .sort((left, right) => left.score - right.score)
    .map((entry) => entry.node);
}

function scoreNode(node: GraphNode, question: string, tokens: string[]) {
  const name = node.name.toLocaleLowerCase();
  const id = node.id.toLocaleLowerCase();
  const haystack = `${name} ${id} ${node.type}`;
  if (tokens.some((token) => token === name || id.endsWith(`:${token}`) || id.endsWith(`/${token}`))) {
    return typePriority(node.type);
  }
  if (tokens.some((token) => name.includes(token))) {
    return 10 + typePriority(node.type);
  }
  if (matchesFuzzy(haystack, question)) {
    return 50 + typePriority(node.type);
  }
  return 100;
}

function typePriority(type: string) {
  if (type === "program") return 0;
  if (type === "paragraph") return 1;
  if (type === "copybook") return 2;
  return 4;
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
