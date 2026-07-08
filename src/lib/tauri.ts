declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: unknown;
    };
  }
}

export function canUseTauri() {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__?.invoke === "function";
}
