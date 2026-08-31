import type { GraphDocument, GraphNode } from "./graph";
import { matchesFuzzy, potentiallyUnreferencedSourceUnits } from "./graph";
import { graphIndex, incidentEdges, incomingEdges, outgoingEdges } from "./graphIndex";

const FOCUS_DIRECT_LIMIT_PER_TYPE = 14;

export type SourceTreeGroup = {
  title: string;
  nodes: GraphNode[];
};

export type CodebaseInventoryCounts = {
  programs: number;
  copybooks: number;
  jobs: number;
  steps: number;
  external: number;
};

export function dependencyCounts(node: GraphNode, graph: GraphDocument | null) {
  if (!graph) return { incoming: 0, outgoing: 0, total: 0 };
  const index = graphIndex(graph);
  const incoming = incomingEdges(index, node.id).length;
  const outgoing = outgoingEdges(index, node.id).length;
  return { incoming, outgoing, total: incoming + outgoing };
}

export function codebaseInventoryCounts(graph: GraphDocument | null): CodebaseInventoryCounts {
  const empty = {
    programs: 0,
    copybooks: 0,
    jobs: 0,
    steps: 0,
    external: 0,
  };
  if (!graph) return empty;
  return graph.nodes.reduce((acc, node) => {
    if (node.external) acc.external += 1;
    if (node.external || !node.file) return acc;
    if (node.type === "program") acc.programs += 1;
    if (node.type === "copybook") acc.copybooks += 1;
    if (node.type === "jcl-job") acc.jobs += 1;
    if (node.type === "jcl-step") acc.steps += 1;
    return acc;
  }, empty);
}

export function sourceTreeGroups(graph: GraphDocument | null): SourceTreeGroup[] {
  if (!graph) return [];
  const groupSpecs: Array<[string, string[]]> = [
    ["Programs", ["program"]],
    ["Copybooks", ["copybook"]],
    ["JCL", ["jcl-job", "jcl-step"]],
  ];

  return groupSpecs
    .map(([title, types]) => ({
      title,
      nodes: graph.nodes
        .filter((node) => types.includes(node.type) && node.file && !node.external)
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .filter((group) => group.nodes.length);
}

export function graphExpansionState(graph: GraphDocument | null, focusNodeId: string, hiddenNodeTypes: Set<string>) {
  if (!graph || !focusNodeId) return { hiddenByLimit: 0 };
  const index = graphIndex(graph);
  const countsByType = new Map<string, number>();
  for (const edge of incidentEdges(index, focusNodeId)) {
    const neighborId = edge.from === focusNodeId ? edge.to : edge.from;
    const neighbor = index.nodeById.get(neighborId);
    if (!neighbor || hiddenNodeTypes.has(neighbor.type)) continue;
    countsByType.set(neighbor.type, (countsByType.get(neighbor.type) ?? 0) + 1);
  }

  let hiddenByLimit = 0;
  for (const count of countsByType.values()) {
    hiddenByLimit += Math.max(0, count - FOCUS_DIRECT_LIMIT_PER_TYPE);
  }
  return { hiddenByLimit };
}

export function graphHintSourceUnits(graph: GraphDocument | null, limit = 8) {
  return graph ? potentiallyUnreferencedSourceUnits(graph).slice(0, limit) : [];
}

export function sourceFilesForGraph(graph: GraphDocument | null) {
  if (!graph) return [] as Array<{ file: string; node: GraphNode }>;
  const byFile = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (!node.file || node.external) continue;
    const existing = byFile.get(node.file);
    if (!existing || sourceFilePriority(node) < sourceFilePriority(existing)) {
      byFile.set(node.file, node);
    }
  }
  return [...byFile.entries()]
    .map(([file, node]) => ({ file, node }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function firstFocusableNode(graph: GraphDocument) {
  return (
    graph.nodes.find((node) => node.type === "program" && !node.external)?.id ??
    graph.nodes.find((node) => !node.external)?.id ??
    graph.nodes[0]?.id ??
    ""
  );
}

export function searchResultScore(node: GraphNode, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  const name = node.name.toLocaleLowerCase();
  const id = node.id.toLocaleLowerCase();
  const type = node.type.toLocaleLowerCase();
  const priority = typePriority(node.type) / 100;
  if (!needle) return null;
  if (name === needle) return priority;
  if (id.endsWith(`:${needle}`) || id.endsWith(`/${needle}`)) return 1 + priority;
  if (name.startsWith(needle)) return 2 + priority;
  if (name.includes(needle)) return 3 + priority;
  if (type === needle || type.includes(needle)) return 4 + priority;
  if (matchesFuzzy(name, needle)) return 5 + priority + fuzzyGapScore(name, needle);
  return null;
}

export function graphSearchResults(graph: GraphDocument | null, query: string, limit = 12) {
  if (!graph || !query.trim() || limit <= 0) return [];
  const best: Array<{ node: GraphNode; score: number }> = [];
  for (const node of graph.nodes) {
    const score = searchResultScore(node, query);
    if (score === null) continue;
    const insertionIndex = best.findIndex((result) => result.score > score);
    if (insertionIndex === -1) {
      if (best.length < limit) best.push({ node, score });
      continue;
    }
    best.splice(insertionIndex, 0, { node, score });
    if (best.length > limit) best.pop();
  }
  return best.map((result) => result.node);
}

export function isSummaryUnit(node: GraphNode) {
  return node.type === "program" || node.type === "paragraph" || node.type === "copybook";
}

function sourceFilePriority(node: GraphNode) {
  if (node.type === "program") return 0;
  if (node.type === "copybook") return 1;
  if (node.type === "jcl-job") return 2;
  if (node.type === "jcl-step") return 3;
  return 4;
}

function fuzzyGapScore(text: string, needle: string) {
  let cursor = 0;
  let first = -1;
  let last = -1;
  for (const char of needle) {
    const next = text.indexOf(char, cursor);
    if (next === -1) return Number.MAX_SAFE_INTEGER;
    if (first === -1) first = next;
    last = next;
    cursor = next + 1;
  }
  const span = last - first + 1;
  return (span - needle.length) / 10 + text.length / 1000;
}

function typePriority(type: string) {
  if (type === "program") return 0;
  if (type === "paragraph") return 1;
  if (type === "copybook") return 2;
  if (type === "jcl-job") return 3;
  if (type === "jcl-step") return 4;
  return 5;
}
