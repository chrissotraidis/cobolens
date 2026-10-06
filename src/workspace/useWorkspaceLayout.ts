import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useState } from "react";
import { clampRightWidth, isOverlayLayout, OVERLAY_LAYOUT_QUERY, readLayoutFlag, readLayoutNumber } from "../lib/layoutState";

export function useWorkspaceLayout() {
  // At tablet and phone widths both side panes are drawers over the canvas.
  // Start those layouts with the canvas visible; desktop keeps saved panes.
  const [railCollapsed, setRailCollapsed] = useState(() =>
    isOverlayLayout() ? true : readLayoutFlag("cobolens.railCollapsed", false),
  );
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() =>
    isOverlayLayout() ? true : readLayoutFlag("cobolens.inspectorCollapsed", false),
  );
  const [rightWidth, setRightWidth] = useState(() => readLayoutNumber("cobolens.rightWidth", 460, 320, 860));
  const [overlayLayout, setOverlayLayout] = useState(isOverlayLayout);

  useEffect(() => {
    // Desktop preferences are the ones worth remembering; drawer state at
    // overlay widths is transient and must not reopen a covering drawer later.
    if (overlayLayout) return;
    try {
      window.localStorage.setItem("cobolens.railCollapsed", JSON.stringify(railCollapsed));
      window.localStorage.setItem("cobolens.inspectorCollapsed", JSON.stringify(inspectorCollapsed));
      window.localStorage.setItem("cobolens.rightWidth", String(Math.round(rightWidth)));
    } catch {
      // Layout prefs are best-effort; never block the app.
    }
  }, [overlayLayout, railCollapsed, inspectorCollapsed, rightWidth]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(OVERLAY_LAYOUT_QUERY);
    const onChange = () => {
      setOverlayLayout(query.matches);
      // Returning to desktop restores the panes the user last chose there.
      if (!query.matches) {
        setRailCollapsed(readLayoutFlag("cobolens.railCollapsed", false));
        setInspectorCollapsed(readLayoutFlag("cobolens.inspectorCollapsed", false));
      }
    };
    query.addEventListener("change", onChange);
    // The window can change size between the first render and this effect.
    if (query.matches !== overlayLayout) onChange();
    return () => query.removeEventListener("change", onChange);
    // Subscribe once; onChange reads the live media query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Two drawers would bury the canvas. When both are open in the overlay
  // layout (for example after narrowing the window), keep the conversation.
  useEffect(() => {
    if (overlayLayout && !railCollapsed && !inspectorCollapsed) setRailCollapsed(true);
  }, [overlayLayout, railCollapsed, inspectorCollapsed]);

  const toggleRailCollapsed = useCallback(() => {
    if (railCollapsed && overlayLayout) setInspectorCollapsed(true);
    setRailCollapsed(!railCollapsed);
  }, [overlayLayout, railCollapsed]);

  const toggleInspectorCollapsed = useCallback(() => {
    setInspectorCollapsed((collapsed) => !collapsed);
  }, []);

  const openInspector = useCallback(() => setInspectorCollapsed(false), []);
  const closeInspector = useCallback(() => setInspectorCollapsed(true), []);

  // At overlay widths the navigator is a drawer: it closes once the user has
  // picked something, and opens when search results need somewhere to show.
  const dismissNavigatorDrawer = useCallback(() => {
    if (overlayLayout) setRailCollapsed(true);
  }, [overlayLayout]);
  const revealNavigatorDrawer = useCallback(() => {
    if (!overlayLayout) return;
    setInspectorCollapsed(true);
    setRailCollapsed(false);
  }, [overlayLayout]);

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
    overlayLayout,
    dismissNavigatorDrawer,
    revealNavigatorDrawer,
    rightWidth,
    rightWidthPx: Math.round(clampRightWidth(rightWidth, railCollapsed)),
    startInspectorResize,
    resetInspectorWidth,
  };
}
