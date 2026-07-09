import { invoke } from "@tauri-apps/api/core";
import { canUseTauri } from "../lib/tauri";
import {
  createLocalStorageSemanticVectorStore,
  type SemanticVectorStore,
  type StoredSemanticVectorIndex,
} from "./semantic";

export function createSemanticVectorStore(): SemanticVectorStore | undefined {
  if (canUseTauri()) {
    return {
      read: (key) => invoke<StoredSemanticVectorIndex | null>("read_semantic_index", { key }),
      write: (key, index) => invoke("write_semantic_index", { key, index }),
    };
  }

  try {
    return createLocalStorageSemanticVectorStore(window.localStorage);
  } catch {
    return undefined;
  }
}
