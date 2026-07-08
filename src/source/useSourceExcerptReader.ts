import { useCallback } from "react";
import type { GraphNode } from "../lib/graph";
import { readSourceExcerpt } from "../lib/sourceReader";

export function useSourceExcerptReader({
  root,
  sourceBase,
  browserSourceFiles,
  encoding,
}: {
  root: string;
  sourceBase: string;
  browserSourceFiles: Record<string, string>;
  encoding: string;
}) {
  const sourceExcerptForNode = useCallback(
    async (node: GraphNode) => {
      if (!node.file) {
        throw new Error("Open a codebase from the desktop app before using model features.");
      }
      if (!root && !sourceBase && !Object.keys(browserSourceFiles).length) {
        throw new Error("Use Sample or import a project before using model features.");
      }
      const startLine = node.lines?.[0] ?? 1;
      const endLine = node.lines?.[1] ?? startLine;
      return readSourceExcerpt(root, sourceBase, browserSourceFiles, node.file, startLine, endLine, 220, encoding);
    },
    [browserSourceFiles, encoding, root, sourceBase],
  );

  return { sourceExcerptForNode };
}
