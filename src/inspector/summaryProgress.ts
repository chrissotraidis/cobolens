export function bulkSummaryProgressLabel(done: number, total: number, fallbackCount: number) {
  const progress = `${done}/${total}`;
  return fallbackCount ? `${progress} (${fallbackCount} graph fallback${fallbackCount === 1 ? "" : "s"})` : progress;
}
