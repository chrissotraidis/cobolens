import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useState } from "react";
import { clampRightWidth, readLayoutFlag, readLayoutNumber } from "../lib/layoutState";

export function useWorkspaceLayout() {
  const [railCollapsed, setRailCollapsed] = useState(() => readLayoutFlag("cobolens.railCollapsed", false));
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => readLayoutFlag("cobolens.inspectorCollapsed", false));
  const [rightWidth, setRightWidth] = useState(() => readLayoutNumber("cobolens.rightWidth", 460, 320, 860));

  useEffect(() => {
    try {
      window.localStorage.setItem("cobolens.railCollapsed", JSON.stringify(railCollapsed));
      window.localStorage.setItem("cobolens.inspectorCollapsed", JSON.stringify(inspectorCollapsed));
      window.localStorage.setItem("cobolens.rightWidth", String(Math.round(rightWidth)));
    } catch {
      // Layout prefs are best-effort; never block the app.
    }
  }, [railCollapsed, inspectorCollapsed, rightWidth]);

  const toggleRailCollapsed = useCallback(() => {
    setRailCollapsed((collapsed) => !collapsed);
  }, []);

  const toggleInspectorCollapsed = useCallback(() => {
    setInspectorCollapsed((collapsed) => !collapsed);
  }, []);

  const openInspector = useCallback(() => setInspectorCollapsed(false), []);
  const closeInspector = useCallback(() => setInspectorCollapsed(true), []);

  function startInspectorResize(event: ReactPointerEvent) {
    event.preventDefault();
    if (inspectorCollapsed) setInspectorCollapsed(false);
    const startX = event.clientX;
    const startWidth = rightWidth;
    const onMove = (moveEvent: PointerEvent) => {
      setRightWidth(clampRightWidth(startWidth + (startX - moveEvent.clientX), railCollapsed));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resetInspectorWidth() {
    setRightWidth(460);
  }

  return {
    railCollapsed,
    toggleRailCollapsed,
    inspectorCollapsed,
    toggleInspectorCollapsed,
    openInspector,
    closeInspector,
    rightWidth,
    rightWidthPx: Math.round(clampRightWidth(rightWidth, railCollapsed)),
    startInspectorResize,
    resetInspectorWidth,
  };
}
