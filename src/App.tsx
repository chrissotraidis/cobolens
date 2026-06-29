import "./App.css";

function App() {
  return (
    <main className="workspace" aria-label="Cobolens workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Cobolens</span>
        </div>

        <label className="global-search">
          <span>Search</span>
          <input type="search" aria-label="Search symbols" />
        </label>

        <nav className="breadcrumbs" aria-label="Breadcrumb history">
          <button type="button">Home</button>
          <span>/</span>
          <span>Workspace</span>
        </nav>

        <div className="mode-indicator" aria-label="Privacy mode">
          Local
        </div>
      </header>

      <section className="shell">
        <aside className="left-pane" aria-label="Navigator">
          <section className="pane-block">
            <h2>Navigator</h2>
            <div className="empty-line" />
            <div className="empty-line short" />
          </section>

          <section className="pane-block">
            <h2>Filters</h2>
            <div className="filter-row">
              <span className="swatch program" />
              <span>Programs</span>
            </div>
            <div className="filter-row">
              <span className="swatch copybook" />
              <span>Copybooks</span>
            </div>
            <div className="filter-row">
              <span className="swatch dataset" />
              <span>Datasets</span>
            </div>
          </section>

          <section className="pane-block legend">
            <h2>Legend</h2>
            <div className="legend-grid">
              <span className="dot program" />
              <span className="dot copybook" />
              <span className="dot dataset" />
              <span className="dot job" />
            </div>
          </section>
        </aside>

        <section className="graph-pane" aria-label="Dependency graph">
          <div className="graph-toolbar">
            <span>Dependency Map</span>
            <button type="button">Focus</button>
          </div>
          <div className="graph-canvas">
            <div className="focus-node">Select a codebase</div>
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
          </div>
        </section>

        <aside className="right-pane" aria-label="Code and summaries">
          <section className="code-panel">
            <div className="panel-title">Code</div>
            <pre>
              <code>No source selected.</code>
            </pre>
          </section>

          <section className="chat-panel">
            <div className="panel-title">Summary</div>
            <div className="summary-empty">No symbol selected.</div>
            <div className="chat-input" aria-label="Ask a question">
              <input type="text" aria-label="Ask about the codebase" />
              <button type="button">Ask</button>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

export default App;
