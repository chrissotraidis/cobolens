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

export type StoredSemanticVectorIndex = {
  version: 1;
  createdAt: string;
  key: string;
  vectors: number[][];
};

export type SemanticVectorStore = {
  read: (key: string) => Promise<StoredSemanticVectorIndex | null>;
  write: (key: string, index: StoredSemanticVectorIndex) => Promise<void>;
};

export async function semanticSearchGraph({
  graph,
  question,
  embedTexts,
  indexKey,
  vectorStore,
  maxCandidateChunks = 80,
  topK = 4,
}: {
  graph: GraphDocument;
  question: string;
  embedTexts: (texts: string[]) => Promise<VectorEmbedding>;
  indexKey?: string;
  vectorStore?: SemanticVectorStore;
  maxCandidateChunks?: number;
  topK?: number;
}): Promise<SemanticMatch[]> {
  const chunks = buildSemanticChunks(graph).slice(0, maxCandidateChunks);
  if (!question.trim() || !chunks.length) return [];

  const cachedChunkVectors = indexKey && vectorStore ? await readCachedChunkVectors(vectorStore, indexKey, chunks.length) : null;
  const embedded = cachedChunkVectors ? await embedTexts([question]) : await embedTexts([question, ...chunks.map((chunk) => chunk.text)]);
  const queryVector = embedded.vectors[0];
  const chunkVectors = cachedChunkVectors ?? embedded.vectors.slice(1);
  if (!queryVector || chunkVectors.length !== chunks.length) return [];
  if (!cachedChunkVectors && indexKey && vectorStore) {
    await writeCachedChunkVectors(vectorStore, indexKey, chunkVectors);
  }

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

export function semanticGraphIndexKey(graph: GraphDocument, modelKey: string, maxCandidateChunks = 80) {
  const chunks = buildSemanticChunks(graph).slice(0, maxCandidateChunks);
  const fingerprint = stableHash(
    JSON.stringify({
      schemaVersion: graph.schemaVersion,
      dialectGuess: graph.meta.dialectGuess,
      fileCount: graph.meta.fileCount,
      parsedFileCount: graph.meta.parsedFileCount,
      parseErrors: graph.meta.parseErrors,
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        name: node.name,
        file: node.file,
        lines: node.lines,
        external: node.external,
      })),
      edges: graph.edges,
      chunks: chunks.map((chunk) => chunk.text),
    }),
  );
  return `cobolens.semantic.v1.${stableHash(modelKey)}.${fingerprint}`;
}

export function createLocalStorageSemanticVectorStore(storage: Pick<Storage, "getItem" | "setItem">): SemanticVectorStore {
  return {
    async read(key) {
      const raw = storage.getItem(key);
      if (!raw) return null;
      return normalizeStoredSemanticVectorIndex(JSON.parse(raw), key);
    },
    async write(key, index) {
      storage.setItem(key, JSON.stringify(index));
    },
  };
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

async function readCachedChunkVectors(
  vectorStore: SemanticVectorStore,
  key: string,
  expectedVectorCount: number,
) {
  try {
    const cached = await vectorStore.read(key);
    if (!cached || cached.vectors.length !== expectedVectorCount || !cached.vectors.every(isEmbeddingVector)) return null;
    return cached.vectors;
  } catch {
    return null;
  }
}

async function writeCachedChunkVectors(
  vectorStore: SemanticVectorStore,
  key: string,
  vectors: number[][],
) {
  try {
    await vectorStore.write(key, {
      version: 1,
      createdAt: new Date().toISOString(),
      key,
      vectors,
    });
  } catch {
    // A full or unavailable browser cache should never block Ask.
  }
}

function normalizeStoredSemanticVectorIndex(value: unknown, key: string): StoredSemanticVectorIndex | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<StoredSemanticVectorIndex>;
  if (raw.version !== 1 || raw.key !== key || !Array.isArray(raw.vectors)) return null;
  const vectors = raw.vectors.filter(isEmbeddingVector);
  if (vectors.length !== raw.vectors.length) return null;
  return {
    version: 1,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    key,
    vectors,
  };
}

function isEmbeddingVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
