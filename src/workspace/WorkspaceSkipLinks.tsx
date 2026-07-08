export function WorkspaceSkipLinks() {
  function focusTarget(targetId: string) {
    document.getElementById(targetId)?.focus();
  }

  return (
    <nav className="skip-links" aria-label="Skip links">
      <a href="#navigator-panel" onClick={() => focusTarget("navigator-panel")}>
        Skip to navigator
      </a>
      <a href="#dependency-graph" onClick={() => focusTarget("dependency-graph")}>
        Skip to workspace
      </a>
      <a href="#inspector-panel" onClick={() => focusTarget("inspector-panel")}>
        Skip to inspector
      </a>
    </nav>
  );
}
