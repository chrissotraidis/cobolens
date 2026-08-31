import { useEffect, useRef, type ComponentProps } from "react";
import { InspectorPane } from "../inspector/InspectorPane";
import { NavigatorRail } from "../navigator/NavigatorRail";
import { WorkspacePane } from "./WorkspacePane";

type WorkspaceShellProps = {
  railCollapsed: boolean;
  inspectorCollapsed: boolean;
  rightWidthPx: number;
  navigator: ComponentProps<typeof NavigatorRail>;
  workspace: ComponentProps<typeof WorkspacePane>;
  inspector: ComponentProps<typeof InspectorPane>;
};

export function WorkspaceShell({
  railCollapsed,
  inspectorCollapsed,
  rightWidthPx,
  navigator,
  workspace,
  inspector,
}: WorkspaceShellProps) {
  const shellRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (navigator.graph) shellRef.current?.scrollTo({ top: 0 });
  }, [navigator.graph]);

  return (
    <section
      ref={shellRef}
      className={`shell${railCollapsed ? " rail-collapsed" : ""}${inspectorCollapsed ? " inspector-collapsed" : ""}`}
      style={{ ["--right-w" as string]: `${rightWidthPx}px` }}
    >
      <NavigatorRail {...navigator} />
      <WorkspacePane {...workspace} />
      {inspectorCollapsed ? null : <InspectorPane {...inspector} />}
    </section>
  );
}
