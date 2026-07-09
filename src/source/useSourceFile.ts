import { useEffect, useMemo, useState } from "react";
import type { GraphNode, SourceFileContent } from "../lib/graph";
import { readSourceFile } from "../lib/sourceReader";
import type { SourceFocus } from "../workspace/WorkspacePane";

type SourceFileState = {
  fileKey: string;
  sourceFilesRef: Record<string, string>;
  source: SourceFileContent | null;
  loading: boolean;
  error: string;
};

export function useSourceFile({
  root,
  sourceBase,
  browserSourceFiles,
  selectedNode,
  sourceFocus,
  encoding,
  revision,
}: {
  root: string;
  sourceBase: string;
  browserSourceFiles: Record<string, string>;
  selectedNode: GraphNode | null;
  sourceFocus: SourceFocus | null;
  encoding: string;
  revision: string;
}) {
  const target = useMemo(
    () => sourceFocus ?? (selectedNode?.file ? { file: selectedNode.file, line: selectedNode.lines?.[0] ?? 1, nodeId: selectedNode.id } : null),
    [selectedNode, sourceFocus],
  );
  const sourceAvailable = Boolean(root || sourceBase || Object.keys(browserSourceFiles).length);
  const fileKey = useMemo(
    () => sourceAvailable && target ? [root, sourceBase, target.file, encoding, revision].join("\0") : "",
    [encoding, revision, root, sourceAvailable, sourceBase, target],
  );
  const [state, setState] = useState<SourceFileState>({
    fileKey: "",
    sourceFilesRef: browserSourceFiles,
    source: null,
    loading: false,
    error: "",
  });

  useEffect(() => {
    if (!sourceAvailable || !target) {
      setState({ fileKey: "", sourceFilesRef: browserSourceFiles, source: null, loading: false, error: "" });
      return;
    }

    let cancelled = false;
    setState({ fileKey, sourceFilesRef: browserSourceFiles, source: null, loading: true, error: "" });
    readSourceFile(root, sourceBase, browserSourceFiles, target.file, target.line, encoding)
      .then((result) => {
        if (!cancelled) {
          setState({ fileKey, sourceFilesRef: browserSourceFiles, source: result, loading: false, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            fileKey,
            sourceFilesRef: browserSourceFiles,
            source: null,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [browserSourceFiles, encoding, fileKey, root, sourceAvailable, sourceBase]);

  const current = state.fileKey === fileKey && state.sourceFilesRef === browserSourceFiles;
  const source = current && state.source && target
    ? {
        ...state.source,
        highlightLine: Math.min(state.source.lineCount, Math.max(1, target.line)),
      }
    : null;
  return {
    source,
    sourceLoading: current ? state.loading : false,
    sourceError: current ? state.error : "",
  };
}
