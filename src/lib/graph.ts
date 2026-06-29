export type GraphNode = {
  id: string;
  type: string;
  name: string;
  file?: string;
  lines?: [number, number];
  external?: boolean;
  steps?: string[];
};

export type GraphEdge = {
  from: string;
  to: string;
  type: string;
  site?: {
    file: string;
    line: number;
  };
};

export type ParseError = {
  file: string;
  reason: string;
};

export type GraphDocument = {
  schemaVersion: number;
  meta: {
    scannedAt: string;
    dialectGuess: string;
    fileCount: number;
    parsedFileCount: number;
    parseErrors: ParseError[];
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type SourceSnippet = {
  file: string;
  startLine: number;
  highlightLine: number;
  lines: Array<{
    number: number;
    text: string;
  }>;
};

export const NODE_COLORS: Record<string, string> = {
  program: "#66c2a5",
  paragraph: "#5aa7d6",
  copybook: "#fc8d62",
  "jcl-job": "#e5c75f",
  "jcl-step": "#b8a2ff",
  file: "#8da0cb",
  "data-item": "#f2a7c7",
  cluster: "#6b7480",
};

export function nodeColor(type: string) {
  return NODE_COLORS[type] ?? "#9aa6b2";
}

export function nodeLabel(node: GraphNode) {
  return node.external ? `${node.name} (external)` : node.name;
}

export function edgeLabel(edge: GraphEdge, graph: GraphDocument) {
  const from = graph.nodes.find((node) => node.id === edge.from)?.name ?? edge.from;
  const to = graph.nodes.find((node) => node.id === edge.to)?.name ?? edge.to;
  return `${from} ${edge.type} ${to}`;
}

export function matchesFuzzy(value: string, query: string) {
  const text = value.toLocaleLowerCase();
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;

  let cursor = 0;
  for (const char of needle) {
    cursor = text.indexOf(char, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}
