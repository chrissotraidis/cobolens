import type { GraphDocument, GraphNode } from "../lib/graph";
import { edgeLabel } from "../lib/graph";

export type VectorEmbedding = {
  vectors: number[][];
};

export type SemanticChunk = {
  node: GraphNode;
  text: string;
};

export type SemanticMatch = {
  node: GraphNode;
  score: number;
  text: string;
};

export async function semanticSearchGraph({
  graph,
  question,
  embedTexts,
  maxCandidateChunks = 80,
  topK = 4,
}: {
  graph: GraphDocument;
  question: string;
  embedTexts: (texts: string[]) => Promise<VectorEmbedding>;
  maxCandidateChunks?: number;
  topK?: number;
}): Promise<SemanticMatch[]> {
  const chunks = buildSemanticChunks(graph).slice(0, maxCandidateChunks);
  if (!question.trim() || !chunks.length) return [];

  const embedded = await embedTexts([question, ...chunks.map((chunk) => chunk.text)]);
  const [queryVector, ...chunkVectors] = embedded.vectors;
  if (!queryVector || chunkVectors.length !== chunks.length) return [];

  return chunks
    .map((chunk, index) => ({
      node: chunk.node,
      text: chunk.text,
      score: cosineSimilarity(queryVector, chunkVectors[index]),
    }))
    .filter((match) => Number.isFinite(match.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export function buildSemanticChunks(graph: GraphDocument): SemanticChunk[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes
    .filter((node) => node.file && !node.external)
    .sort((left, right) => semanticNodePriority(left) - semanticNodePriority(right) || left.name.localeCompare(right.name))
    .map((node) => {
      const relationships = graph.edges
        .filter((edge) => edge.from === node.id || edge.to === node.id)
        .slice(0, 12)
        .map((edge) => {
          const other = nodeById.get(edge.from === node.id ? edge.to : edge.from);
          return `${edgeLabel(edge, graph)}${other ? ` (${other.type})` : ""}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : ""}`;
        });
      const location = node.lines?.[1] && node.lines[1] !== node.lines[0]
        ? `${node.file}:${node.lines[0]}-${node.lines[1]}`
        : `${node.file}:${node.lines?.[0] ?? 1}`;
      return {
        node,
        text: [
          `${node.name} is a ${node.type} at ${location}.`,
          relationships.length ? `Relationships: ${relationships.join("; ")}.` : "Relationships: none recorded.",
        ].join(" "),
      };
    });
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return Number.NEGATIVE_INFINITY;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function semanticNodePriority(node: GraphNode) {
  if (node.type === "program") return 0;
  if (node.type === "copybook") return 1;
  if (node.type === "paragraph") return 2;
  if (node.type === "dataset") return 3;
  if (node.type === "jcl-job" || node.type === "jcl-step") return 4;
  return 5;
}
