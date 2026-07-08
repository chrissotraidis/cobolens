import { useState, type Dispatch, type SetStateAction } from "react";
import type { GraphDocument, GraphEdge } from "../lib/graph";
import type { SourceFocus } from "../workspace/WorkspacePane";

export type ProjectStatus = "idle" | "running" | "ready" | "error";

export type ProjectState = {
  status: ProjectStatus;
  setStatus: Dispatch<SetStateAction<ProjectStatus>>;
  root: string;
  setRoot: Dispatch<SetStateAction<string>>;
  graph: GraphDocument | null;
  setGraph: Dispatch<SetStateAction<GraphDocument | null>>;
  sourceBase: string;
  setSourceBase: Dispatch<SetStateAction<string>>;
  browserSourceFiles: Record<string, string>;
  setBrowserSourceFiles: Dispatch<SetStateAction<Record<string, string>>>;
  focusNodeId: string;
  setFocusNodeId: Dispatch<SetStateAction<string>>;
  selectedNodeId: string;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  selectedEdge: GraphEdge | null;
  setSelectedEdge: Dispatch<SetStateAction<GraphEdge | null>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  sourceFocus: SourceFocus | null;
  setSourceFocus: Dispatch<SetStateAction<SourceFocus | null>>;
};

export function useProjectState(): ProjectState {
  const [status, setStatus] = useState<ProjectStatus>("idle");
  const [root, setRoot] = useState<string>("");
  const [graph, setGraph] = useState<GraphDocument | null>(null);
  const [sourceBase, setSourceBase] = useState("");
  const [browserSourceFiles, setBrowserSourceFiles] = useState<Record<string, string>>({});
  const [focusNodeId, setFocusNodeId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [error, setError] = useState<string>("");
  const [sourceFocus, setSourceFocus] = useState<SourceFocus | null>(null);

  return {
    status,
    setStatus,
    root,
    setRoot,
    graph,
    setGraph,
    sourceBase,
    setSourceBase,
    browserSourceFiles,
    setBrowserSourceFiles,
    focusNodeId,
    setFocusNodeId,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdge,
    setSelectedEdge,
    error,
    setError,
    sourceFocus,
    setSourceFocus,
  };
}
