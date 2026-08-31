import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphDocument, GraphNode, SourceExcerpt } from "../lib/graph";
import { embedTexts } from "../model/embeddings";
import type { ModelSettings } from "../model/config";
import { isCloudProvider } from "../model/config";
import { semanticEmbeddingModelKey } from "../model/modelRuntime";
import {
  buildSemanticChunkVectorIndex,
  buildSemanticChunks,
  buildSemanticSourceChunks,
  hasSemanticChunkVectorIndex,
  semanticGraphIndexKey,
  semanticSearchGraph,
  type SemanticMatch,
  type SemanticChunk,
} from "./semantic";
import { createSemanticVectorStore } from "./semanticStore";

const SEMANTIC_INDEX_TIMEOUT_MS = 30_000;
const SEMANTIC_QUERY_TIMEOUT_MS = 30_000;
const MAX_SEMANTIC_CHUNKS = 160;

export type SemanticIndexStatus = "idle" | "warming" | "ready" | "error" | "disabled";

export type SemanticIndexState = {
  status: SemanticIndexStatus;
  message: string;
  chunkCount?: number;
};

export function useSemanticIndex({
  graph,
  modelSettings,
  readExcerptForNode,
}: {
  graph: GraphDocument | null;
  modelSettings: ModelSettings;
  readExcerptForNode: (node: GraphNode) => Promise<SourceExcerpt>;
}) {
  const vectorStore = useMemo(() => createSemanticVectorStore(), []);
  const indexKey = useMemo(
    () => (graph ? semanticGraphIndexKey(graph, semanticEmbeddingModelKey(modelSettings), MAX_SEMANTIC_CHUNKS) : ""),
    [graph, modelSettings.baseUrl, modelSettings.embeddingModel, modelSettings.model, modelSettings.provider],
  );
  const preparedIndexRef = useRef<{ key: string; chunks: SemanticChunk[] } | null>(null);
  const [state, setState] = useState<SemanticIndexState>({ status: "idle", message: "Load a graph to enable semantic retrieval." });

  const prepareIndex = useCallback(async () => {
    if (!graph || !vectorStore || !indexKey) throw new Error("Semantic cache is unavailable in this session.");
    const sourceChunks = await buildSemanticSourceChunks({
      graph,
      readExcerpt: readExcerptForNode,
      maxChunks: Math.ceil(MAX_SEMANTIC_CHUNKS / 2),
    });
    const chunks = buildSemanticChunks(graph, sourceChunks, MAX_SEMANTIC_CHUNKS);
    const result = await buildSemanticChunkVectorIndex({
      graph,
      chunks,
      indexKey,
      vectorStore,
      maxCandidateChunks: MAX_SEMANTIC_CHUNKS,
      embedTexts: (texts) =>
        embedTexts({
          settings: modelSettings,
          texts,
          timeoutMs: SEMANTIC_INDEX_TIMEOUT_MS,
        }),
    });
    preparedIndexRef.current = { key: indexKey, chunks };
    const indexedChunks = chunks.slice(0, MAX_SEMANTIC_CHUNKS);
    return {
      ...result,
      sourceChunkCount: indexedChunks.filter((chunk) => chunk.kind === "source").length,
      graphChunkCount: indexedChunks.filter((chunk) => chunk.kind === "graph").length,
    };
  }, [graph, indexKey, modelSettings, readExcerptForNode, vectorStore]);

  const readyState = useCallback((result: Awaited<ReturnType<typeof prepareIndex>>) => ({
    status: "ready" as const,
    message: result.cached
      ? `Semantic retrieval is ready from the local cache (${result.sourceChunkCount} source, ${result.graphChunkCount} graph chunks).`
      : `Semantic retrieval is ready (${result.sourceChunkCount} source, ${result.graphChunkCount} graph chunks indexed locally).`,
    chunkCount: result.chunkCount,
  }), [prepareIndex]);

  const warmSemanticIndex = useCallback(async () => {
    if (!graph) {
      setState({ status: "idle", message: "Load a graph to enable semantic retrieval." });
      return;
    }
    if (isCloudProvider(modelSettings.provider)) {
      setState({ status: "disabled", message: "Semantic retrieval uses local Ollama embeddings only." });
      return;
    }
    if (!vectorStore || !indexKey) {
      setState({ status: "error", message: "Semantic cache is unavailable in this browser session." });
      return;
    }

    setState({ status: "warming", message: "Preparing local semantic retrieval." });
    try {
      const result = await prepareIndex();
      setState({ status: "warming", message: "Testing a local semantic query embedding." });
      await embedTexts({
        settings: modelSettings,
        texts: ["Cobolens semantic retrieval readiness probe"],
        timeoutMs: SEMANTIC_QUERY_TIMEOUT_MS,
      });
      setState({
        ...readyState(result),
        message: `Semantic retrieval is verified (${result.sourceChunkCount} source, ${result.graphChunkCount} graph chunks; query embedding tested locally).`,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [graph, indexKey, modelSettings, prepareIndex, readyState, vectorStore]);

  useEffect(() => {
    if (!graph) {
      preparedIndexRef.current = null;
      setState({ status: "idle", message: "Load a graph to enable semantic retrieval." });
      return;
    }
    if (isCloudProvider(modelSettings.provider)) {
      preparedIndexRef.current = null;
      setState({ status: "disabled", message: "Semantic retrieval uses local Ollama embeddings only." });
      return;
    }
    if (!vectorStore || !indexKey) {
      setState({ status: "error", message: "Semantic cache is unavailable in this browser session." });
      return;
    }

    preparedIndexRef.current = null;
    setState({
      status: "idle",
      message: "Semantic search is optional. Prepare it here when you want broader source retrieval.",
    });
  }, [graph, indexKey, modelSettings.provider, vectorStore]);

  const searchSemanticIndex = useCallback(
    async (question: string): Promise<SemanticMatch[]> => {
      const prepared = preparedIndexRef.current;
      if (!graph || !vectorStore || !indexKey || state.status !== "ready" || prepared?.key !== indexKey) return [];
      const hasIndex = await hasSemanticChunkVectorIndex({
        graph,
        chunks: prepared.chunks,
        indexKey,
        vectorStore,
        maxCandidateChunks: MAX_SEMANTIC_CHUNKS,
      });
      if (!hasIndex) return [];
      return semanticSearchGraph({
        graph,
        question,
        indexKey,
        vectorStore,
        chunks: prepared.chunks,
        maxCandidateChunks: MAX_SEMANTIC_CHUNKS,
        requireCachedIndex: true,
        embedTexts: (texts) =>
          embedTexts({
            settings: modelSettings,
            texts,
            timeoutMs: SEMANTIC_QUERY_TIMEOUT_MS,
          }),
      });
    },
    [graph, indexKey, modelSettings, state.status, vectorStore],
  );

  return {
    state,
    warmSemanticIndex,
    searchSemanticIndex,
  };
}
