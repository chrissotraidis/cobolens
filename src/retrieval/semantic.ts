import type { GraphDocument, GraphNode, SourceExcerpt } from "../lib/graph";

export type VectorEmbedding = {
  vectors: number[][];
};

export type SemanticChunk = {
  node: GraphNode;
  text: string;
  kind: "graph" | "source";
  file: string;
  startLine: number;
  endLine: number;
};

export type SemanticMatch = {
  node: GraphNode;
  score: number;
  text: string;
  kind: "graph" | "source";
  file: string;
  startLine: number;
  endLine: number;
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

export async function buildSemanticChunkVectorIndex({
  graph,
  embedTexts,
  indexKey,
  vectorStore,
  chunks: suppliedChunks,
  maxCandidateChunks = 80,
}: {
  graph: GraphDocument;
  embedTexts: (texts: string[]) => Promise<VectorEmbedding>;
  indexKey: string;
  vectorStore: SemanticVectorStore;
  chunks?: SemanticChunk[];
  maxCandidateChunks?: number;
}) {
  const chunks = (suppliedChunks ?? buildSemanticChunks(graph, [], maxCandidateChunks)).slice(0, maxCandidateChunks);
  if (!chunks.length) return { indexKey, chunkCount: 0, cached: false };

  const cachedChunkVectors = await readCachedChunkVectors(vectorStore, indexKey, chunks.length);
  if (cachedChunkVectors) return { indexKey, chunkCount: chunks.length, cached: true };

  const embedded = await embedTexts(chunks.map((chunk) => chunk.text));
  if (embedded.vectors.length !== chunks.length) {
    throw new Error(`Semantic index expected ${chunks.length} vectors but received ${embedded.vectors.length}.`);
  }
  await writeCachedChunkVectors(vectorStore, indexKey, embedded.vectors);
  return { indexKey, chunkCount: chunks.length, cached: false };
}

export async function hasSemanticChunkVectorIndex({
  graph,
  indexKey,
  vectorStore,
  chunks: suppliedChunks,
  maxCandidateChunks = 80,
}: {
  graph: GraphDocument;
  indexKey: string;
  vectorStore: SemanticVectorStore;
  chunks?: SemanticChunk[];
  maxCandidateChunks?: number;
}) {
  const chunkCount = (suppliedChunks ?? buildSemanticChunks(graph, [], maxCandidateChunks)).slice(0, maxCandidateChunks).length;
  if (!chunkCount) return false;
  return Boolean(await readCachedChunkVectors(vectorStore, indexKey, chunkCount));
}

export async function semanticSearchGraph({
  graph,
  question,
  embedTexts,
  indexKey,
  vectorStore,
  chunks: suppliedChunks,
  maxCandidateChunks = 80,
  topK = 4,
  requireCachedIndex = false,
}: {
  graph: GraphDocument;
  question: string;
  embedTexts: (texts: string[]) => Promise<VectorEmbedding>;
  indexKey?: string;
  vectorStore?: SemanticVectorStore;
  chunks?: SemanticChunk[];
  maxCandidateChunks?: number;
  topK?: number;
  requireCachedIndex?: boolean;
}): Promise<SemanticMatch[]> {
  const chunks = (suppliedChunks ?? buildSemanticChunks(graph, [], maxCandidateChunks)).slice(0, maxCandidateChunks);
  if (!question.trim() || !chunks.length) return [];

  const cachedChunkVectors = indexKey && vectorStore ? await readCachedChunkVectors(vectorStore, indexKey, chunks.length) : null;
  if (requireCachedIndex && !cachedChunkVectors) return [];
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
      kind: chunk.kind,
      file: chunk.file,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      score: cosineSimilarity(queryVector, chunkVectors[index]),
    }))
    .filter((match) => Number.isFinite(match.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export function semanticGraphIndexKey(
  graph: GraphDocument,
  modelKey: string,
  maxCandidateChunks = 80,
  suppliedChunks?: SemanticChunk[],
) {
  const chunks = (suppliedChunks ?? buildSemanticChunks(graph, [], maxCandidateChunks)).slice(0, maxCandidateChunks);
  const fingerprint = stableHash(
    JSON.stringify({
      schemaVersion: graph.schemaVersion,
      scannedAt: graph.meta.scannedAt,
      dialectGuess: graph.meta.dialectGuess,
      fileCount: graph.meta.fileCount,
      parsedFileCount: graph.meta.parsedFileCount,
      parseErrors: graph.meta.parseErrors,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      chunks: chunks.map((chunk) => ({
        kind: chunk.kind,
        file: chunk.file,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        text: chunk.text,
      })),
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

export function buildSemanticChunks(
  graph: GraphDocument,
  sourceChunks: SemanticChunk[] = [],
  maxChunks = Number.MAX_SAFE_INTEGER,
): SemanticChunk[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const graphNodes = graph.nodes
    .filter((node) => node.file && !node.external)
    .sort((left, right) => semanticNodePriority(left) - semanticNodePriority(right) || left.name.localeCompare(right.name))
    .slice(0, maxChunks);
  const graphNodeIds = new Set(graphNodes.map((node) => node.id));
  const edgesByNodeId = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    for (const nodeId of [edge.from, edge.to]) {
      if (!graphNodeIds.has(nodeId)) continue;
      const edges = edgesByNodeId.get(nodeId) ?? [];
      if (edges.length < 12) edges.push(edge);
      edgesByNodeId.set(nodeId, edges);
    }
  }
  const graphChunks = graphNodes
    .map((node) => {
      const relationships = (edgesByNodeId.get(node.id) ?? [])
        .map((edge) => {
          const other = nodeById.get(edge.from === node.id ? edge.to : edge.from);
          const from = nodeById.get(edge.from)?.name ?? edge.from;
          const to = nodeById.get(edge.to)?.name ?? edge.to;
          return `${from} ${edge.type} ${to}${other ? ` (${other.type})` : ""}${edge.site ? ` at ${edge.site.file}:${edge.site.line}` : ""}`;
        });
      const location = node.lines?.[1] && node.lines[1] !== node.lines[0]
        ? `${node.file}:${node.lines[0]}-${node.lines[1]}`
        : `${node.file}:${node.lines?.[0] ?? 1}`;
      return {
        node,
        kind: "graph" as const,
        file: node.file ?? "",
        startLine: node.lines?.[0] ?? 1,
        endLine: node.lines?.[1] ?? node.lines?.[0] ?? 1,
        text: [
          `${node.name} is a ${node.type} at ${location}.`,
          relationships.length ? `Relationships: ${relationships.join("; ")}.` : "Relationships: none recorded.",
        ].join(" "),
      };
    });
  return interleaveChunks(sourceChunks, graphChunks).slice(0, maxChunks);
}

export async function buildSemanticSourceChunks({
  graph,
  readExcerpt,
  maxLinesPerChunk = 80,
  maxChunks = Number.MAX_SAFE_INTEGER,
}: {
  graph: GraphDocument;
  readExcerpt: (node: GraphNode) => Promise<SourceExcerpt>;
  maxLinesPerChunk?: number;
  maxChunks?: number;
}): Promise<SemanticChunk[]> {
  const plans = sourceChunkPlans(graph, maxLinesPerChunk).slice(0, maxChunks);
  const excerpts = await Promise.allSettled(
    plans.map((plan) => readExcerpt({ ...plan.node, lines: [plan.startLine, plan.endLine] })),
  );
  return excerpts.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const plan = plans[index];
    const excerpt = result.value;
    return [{
      node: plan.node,
      kind: "source" as const,
      file: excerpt.file,
      startLine: excerpt.startLine,
      endLine: excerpt.endLine,
      text: [
        `Source for ${plan.node.name} at ${formatRange(excerpt.file, excerpt.startLine, excerpt.endLine)}:`,
        excerpt.text,
      ].join("\n"),
    }];
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

function sourceChunkPlans(graph: GraphDocument, maxLinesPerChunk: number) {
  const nodesByFile = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    if (!node.file || node.external || !node.lines) continue;
    const nodes = nodesByFile.get(node.file) ?? [];
    nodes.push(node);
    nodesByFile.set(node.file, nodes);
  }

  return [...nodesByFile.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([file, nodes]) => {
      const primary = [...nodes].sort((left, right) =>
        sourceUnitPriority(left) - sourceUnitPriority(right) ||
        (right.lines?.[1] ?? 1) - (right.lines?.[0] ?? 1) - ((left.lines?.[1] ?? 1) - (left.lines?.[0] ?? 1)),
      )[0];
      if (!primary?.lines) return [];
      const [fileStart, fileEnd] = primary.lines;
      const paragraphStarts = nodes
        .filter((node) => node.type === "paragraph" && node.lines)
        .map((node) => node.lines?.[0] ?? fileStart)
        .filter((line) => line > fileStart && line <= fileEnd);
      const boundaries = [...new Set([fileStart, ...paragraphStarts, fileEnd + 1])].sort((left, right) => left - right);
      const ranges = boundaries.slice(0, -1).flatMap((startLine, index) =>
        splitRange(startLine, boundaries[index + 1] - 1, maxLinesPerChunk),
      );
      return ranges.map(({ startLine, endLine }) => ({ node: primary, file, startLine, endLine }));
    });
}

function splitRange(startLine: number, endLine: number, maxLines: number) {
  const ranges: Array<{ startLine: number; endLine: number }> = [];
  const safeMax = Math.max(1, maxLines);
  for (let start = startLine; start <= endLine; start += safeMax) {
    ranges.push({ startLine: start, endLine: Math.min(endLine, start + safeMax - 1) });
  }
  return ranges;
}

function sourceUnitPriority(node: GraphNode) {
  if (node.type === "program" || node.type === "copybook" || node.type === "jcl-job") return 0;
  if (node.type === "paragraph" || node.type === "jcl-step") return 1;
  return 2;
}

function interleaveChunks(sourceChunks: SemanticChunk[], graphChunks: SemanticChunk[]) {
  const chunks: SemanticChunk[] = [];
  const length = Math.max(sourceChunks.length, graphChunks.length);
  for (let index = 0; index < length; index += 1) {
    if (sourceChunks[index]) chunks.push(sourceChunks[index]);
    if (graphChunks[index]) chunks.push(graphChunks[index]);
  }
  return chunks;
}

function formatRange(file: string, startLine: number, endLine: number) {
  return endLine === startLine ? `${file}:${startLine}` : `${file}:${startLine}-${endLine}`;
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
