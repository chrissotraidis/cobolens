export function readLayoutFlag(key: string, fallback: boolean) {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

export function readLayoutNumber(key: string, fallback: number, min: number, max: number) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  } catch {
    return fallback;
  }
}

// Keep the inspector width within bounds that leave the center workspace usable,
// so a persisted or dragged width can never cover the map.
export function clampRightWidth(width: number, railCollapsed: boolean) {
  if (typeof window === "undefined") return width;
  const railWidth = railCollapsed ? 8 : 260;
  const maxWidth = Math.max(360, window.innerWidth - railWidth - 520);
  return Math.min(maxWidth, Math.max(320, width));
}
