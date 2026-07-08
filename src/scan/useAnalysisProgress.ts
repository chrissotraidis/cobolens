import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

export type AnalysisProgress = {
  phase: string;
  done: number;
  total: number;
  root?: string;
};

export function useAnalysisProgress(desktopAvailable: boolean) {
  const [scanProgress, setScanProgress] = useState<AnalysisProgress | null>(null);
  const resetScanProgress = useCallback(() => setScanProgress(null), []);

  useEffect(() => {
    if (!desktopAvailable) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<AnalysisProgress>("analysis-progress", (event) => {
      if (!cancelled) setScanProgress(event.payload);
    }).then((nextUnlisten) => {
      if (cancelled) nextUnlisten();
      else unlisten = nextUnlisten;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [desktopAvailable]);

  return { scanProgress, resetScanProgress };
}
