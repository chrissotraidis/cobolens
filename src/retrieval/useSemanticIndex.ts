import { useCallback, useEffect, useMemo, useState } from "react";
import type { GraphDocument } from "../lib/graph";
import { embedTexts } from "../model/embeddings";
import type { ModelSettings } from "../model/config";
import { isCloudProvider } from "../model/config";
import { semanticEmbeddingModelKey } from "../model/modelRuntime";
import {
  buildSemanticChunkVectorIndex,
  createLocalStorageSemanticVectorStore,
  hasSemanticChunkVectorIndex,
  semanticGraphIndexKey,
  semanticSearchGraph,
  type SemanticMatch,
  type SemanticVectorStore,
} from "./semantic";

const SEMANTIC_INDEX_TIMEOUT_MS = 30_000;
const SEMANTIC_QUERY_TIMEOUT_MS = 8_000;

export type SemanticIndexStatus = "idle" | "warming" | "ready" | "error" | "disabled";

export type SemanticIndexState = {
  status: SemanticIndexStatus;
  message: string;
  chunkCount?: number;
};

export function useSemanticIndex({
  graph,
  modelSettings,
}: {
  graph: GraphDocument | null;
  modelSettings: ModelSettings;
}) {
  const vectorStore = useMemo(() => createBrowserSemanticVectorStore(), []);
  const indexKey = useMemo(
    () => (graph ? semanticGraphIndexKey(graph, semanticEmbeddingModelKey(modelSettings)) : ""),
    [graph, modelSettings.baseUrl, modelSettings.embeddingModel, modelSettings.model, modelSettings.provider],
  );
  const [state, setState] = useState<SemanticIndexState>({ status: "idle", message: "Load a graph to prepare semantic retrieval." });

  const warmSemanticIndex = useCallback(async () => {
    if (!graph) {
      setState({ status: "idle", message: "Load a graph to prepare semantic retrieval." });
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
      const result = await buildSemanticChunkVectorIndex({
        graph,
        indexKey,
        vectorStore,
        embedTexts: (texts) =>
          embedTexts({
            settings: modelSettings,
            texts,
            timeoutMs: SEMANTIC_INDEX_TIMEOUT_MS,
          }),
      });
      setState({
        status: "ready",
        message: result.cached
          ? `Semantic retrieval is ready from the local cache (${result.chunkCount} graph chunks).`
          : `Semantic retrieval is ready (${result.chunkCount} graph chunks indexed locally).`,
        chunkCount: result.chunkCount,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [graph, indexKey, modelSettings, vectorStore]);

  useEffect(() => {
    let cancelled = false;
    if (!graph) {
      setState({ status: "idle", message: "Load a graph to prepare semantic retrieval." });
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
    const timeout = window.setTimeout(() => {
      buildSemanticChunkVectorIndex({
        graph,
        indexKey,
        vectorStore,
        embedTexts: (texts) =>
          embedTexts({
            settings: modelSettings,
            texts,
            timeoutMs: SEMANTIC_INDEX_TIMEOUT_MS,
          }),
      })
        .then((result) => {
          if (cancelled) return;
          setState({
            status: "ready",
            message: result.cached
              ? `Semantic retrieval is ready from the local cache (${result.chunkCount} graph chunks).`
              : `Semantic retrieval is ready (${result.chunkCount} graph chunks indexed locally).`,
            chunkCount: result.chunkCount,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [graph, indexKey, modelSettings, vectorStore]);

  const searchSemanticIndex = useCallback(
    async (question: string): Promise<SemanticMatch[]> => {
      if (!graph || !vectorStore || !indexKey || state.status !== "ready") return [];
      const hasIndex = await hasSemanticChunkVectorIndex({ graph, indexKey, vectorStore });
      if (!hasIndex) return [];
      return semanticSearchGraph({
        graph,
        question,
        indexKey,
        vectorStore,
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

function createBrowserSemanticVectorStore(): SemanticVectorStore | undefined {
  try {
    return createLocalStorageSemanticVectorStore(window.localStorage);
  } catch {
    return undefined;
  }
}
