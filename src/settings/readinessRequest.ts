import type { ModelSettings } from "../model/config";

export type ReadinessRequestToken = {
  id: number;
  key: string;
};

export function modelReadinessKey(settings: ModelSettings, hasProviderKey: boolean) {
  return JSON.stringify([
    settings.provider,
    settings.model,
    settings.embeddingModel,
    settings.baseUrl,
    hasProviderKey,
  ]);
}

export function createReadinessRequestTracker(initialKey: string) {
  let currentKey = initialKey;
  let currentId = 0;

  return {
    syncKey(nextKey: string) {
      if (nextKey === currentKey) return;
      currentKey = nextKey;
      currentId += 1;
    },
    begin(): ReadinessRequestToken {
      currentId += 1;
      return { id: currentId, key: currentKey };
    },
    isCurrent(token: ReadinessRequestToken) {
      return token.id === currentId && token.key === currentKey;
    },
  };
}
