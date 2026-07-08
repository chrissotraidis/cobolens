import { type KeyboardEvent, useCallback, useMemo, useState } from "react";
import type { GraphDocument } from "../lib/graph";
import { graphSearchResults } from "../lib/graphSelectors";

export function useSymbolSearch({
  graph,
  onOpenSource,
}: {
  graph: GraphDocument | null;
  onOpenSource: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const searchResults = useMemo(() => graphSearchResults(graph, query), [graph, query]);

  const clearSearch = useCallback(() => {
    setQuery("");
  }, []);

  const focusOnSearchResult = useCallback(
    (nodeId: string) => {
      onOpenSource(nodeId);
      setQuery("");
    },
    [onOpenSource],
  );

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && searchResults[0]) {
      event.preventDefault();
      focusOnSearchResult(searchResults[0].id);
      return;
    }
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  }

  return {
    query,
    setQuery,
    searchResults,
    clearSearch,
    focusOnSearchResult,
    handleSearchKeyDown,
  };
}
