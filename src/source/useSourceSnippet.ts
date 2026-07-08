import { useEffect, useMemo, useState } from "react";
import type { GraphNode, SourceSnippet } from "../lib/graph";
import { readSourceSnippet } from "../lib/sourceReader";
import type { SourceFocus } from "../workspace/WorkspacePane";

type SourceSnippetState = {
  targetKey: string;
  sourceFilesRef: Record<string, string>;
  snippet: SourceSnippet | null;
  loading: boolean;
};

export function useSourceSnippet({
  root,
  sourceBase,
  browserSourceFiles,
  selectedNode,
  sourceFocus,
  encoding,
}: {
  root: string;
  sourceBase: string;
  browserSourceFiles: Record<string, string>;
  selectedNode: GraphNode | null;
  sourceFocus: SourceFocus | null;
  encoding: string;
}) {
  const target = useMemo(
    () => sourceFocus ?? (selectedNode?.file ? { file: selectedNode.file, line: selectedNode.lines?.[0] ?? 1, nodeId: selectedNode.id } : null),
    [selectedNode, sourceFocus],
  );
  const sourceAvailable = Boolean(root || sourceBase || Object.keys(browserSourceFiles).length);
  const targetKey = useMemo(
    () =>
      sourceAvailable && target
        ? [root, sourceBase, target.file, target.line, target.nodeId ?? "", encoding].join("\0")
        : "",
    [encoding, root, sourceAvailable, sourceBase, target],
  );
  const [state, setState] = useState<SourceSnippetState>({
    targetKey: "",
    sourceFilesRef: browserSourceFiles,
    snippet: null,
    loading: false,
  });

  useEffect(() => {
    if (!sourceAvailable || !target) {
      setState({ targetKey: "", sourceFilesRef: browserSourceFiles, snippet: null, loading: false });
      return;
    }

    let cancelled = false;
    setState({ targetKey, sourceFilesRef: browserSourceFiles, snippet: null, loading: true });
    readSourceSnippet(root, sourceBase, browserSourceFiles, target.file, target.line, encoding)
      .then((result) => {
        if (!cancelled) {
          setState({ targetKey, sourceFilesRef: browserSourceFiles, snippet: result, loading: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ targetKey, sourceFilesRef: browserSourceFiles, snippet: null, loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [browserSourceFiles, encoding, root, sourceAvailable, sourceBase, target, targetKey]);

  const current = state.targetKey === targetKey && state.sourceFilesRef === browserSourceFiles;
  return {
    snippet: current ? state.snippet : null,
    snippetLoading: current ? state.loading : false,
  };
}
