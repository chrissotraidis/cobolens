# M6 Current-State Verification

This runner verifies the completed M6 surface:

- strict M6 bake-off fixture,
- benchmark validation helper against the M6 fixture,
- bundled `mini-bank` sample graph smoke,
- frontend production build,
- rendered browser smoke for first-run empty-state guidance, browser
  import/sample, skip-link landmark focus, Settings setup/focus, navigator
  hierarchy, side-panel collapse geometry, graph node-list toggle state, Legend
  filter hide/reset behavior, Inventory counts, Parse Health status, Graph Hints
  status, Overview Ask follow-up, Ask-tab geometry, Overview View source,
  Source/Map, Source file switching, Source reader code layout, relationship
  detail/endpoints, relationship endpoint refocus, tablet/narrow responsive
  layout, symbol-search keyboard flow, graph expand/hide behavior, graph Ask,
  Ask composer availability, compact/expanded evidence, and evidence-to-source
  focus/readability while keeping Chat visible,
- citation focus smoke for evidence-to-source/graph target resolution,
- graph selector smoke for inventory counts, source grouping, Graph Hints, and search ranking,
- summary planning smoke for summary candidates and bulk token estimates,
- summary graph smoke for graph-backed overviews, fallback summaries, and cited evidence,
- Ask focus smoke for overview questions versus evidence-focused graph sync,
- model runtime smoke for first-token timeout, Stop handling, friendly errors, and semantic cache keys,
- inspector progress smoke for AI waiting/streaming copy and bulk fallback labels,
- chat history smoke for recent-answer ordering, dedupe, and caps,
- layout state smoke for persisted layout fallbacks and inspector width bounds,
- source line smoke for range labels, citation markers, and accessible line states,
- source reader smoke for complete size-capped files, bounded AI excerpts,
  source bundle caching, and encoded path lookup,
- app settings smoke for saved model/scan normalization and browser persistence,
- browser launch smoke for bounded startup retry and actionable process/port
  failure diagnostics,
- verification contract smoke for the documented fresh-checkout prerequisites,
  missing-Cargo remedy, and clean GitHub Actions path,
- graph-grounded documentation export smoke,
- graph-only Ask smoke for "What depends on CUSTOMER-ID?",
- semantic retrieval smoke for vector-ranked Ask context and cached graph chunk vectors,
- UI contract smoke for the Ask/Inspector shell,
- accessibility smoke for skip links, landmark targets, and named keyboard controls,
- packaging contract smoke for the platform-specific Tauri sidecar resource
  layout and GitHub Actions package workflow,
- model privacy smoke for local/cloud mode invariants,
- embedding privacy smoke for localhost-only local embeddings,
- model answer guard smoke for exact inline citation enforcement,
- summary guard smoke for exact inline citation enforcement,
- Rust `cargo fmt --check` and `cargo clippy -- -D warnings` for both crates,
- Rust sidecar `cargo test`,
- Tauri shell `cargo test`, including command-level coverage for bundled sample
  analysis, full-file source reads, graph-cache reuse/invalidation, and path traversal
  rejection.

It also runs JVM parser work as advisory checks:

- mapa analyzer candidate against the strict M6 fixture,
- Rust/ProLeap/mapa candidate comparison on the strict M6 fixture,
- parser-upgrade readiness.

Advisory failures do not fail this current-state verification; the production sidecar remains Rust until the parser decision gate is complete.

```sh
npm run m6:verify
```

Prerequisites are Node.js/npm, Rust/Cargo, and the Rust `rustfmt` and `clippy`
components. Install the components with `rustup component add rustfmt clippy`.
If Cargo is missing, the runner
stops at the Rust analyzer build with `Missing required command: cargo` and the
setup remedy `Install the Rust toolchain from https://rustup.rs/`. The
JavaScript-only smokes that run before that point still provide partial signal,
but the suite is not green until the Rust analyzer and Tauri checks run.

The rendered browser smoke allows two bounded 30-second browser startup attempts.
Set `COBOLENS_BROWSER_START_TIMEOUT_MS` or
`COBOLENS_BROWSER_START_ATTEMPTS` only when diagnosing a known environment.
Failure output names the browser executable, attempt count, exit status, last
debugging-port error, and captured stderr.

The true parser swap remains gated by benchmark-scale comparison and packaging readiness.

Local Ollama readiness is intentionally separate from this suite because not
every development machine has Ollama installed. Run it explicitly with:

```sh
npm run ollama:check
npm run ollama:summary-smoke
npm run ollama:ask-smoke
```

The Ask smoke uses ten representative questions and proves streamed drafts,
claim-level citation filtering, one bounded citation retry, repeat-request
grounding, and prompt cancellation. The required suite still covers the
request-scoping logic that prevents stale readiness responses from overwriting
newer settings.

Desktop shell startup is also environment-specific because it needs a running
dev server and a GUI display. With Vite already listening on `127.0.0.1:1420`,
run:

```sh
npm run desktop:smoke
```

For a broader local v1 evidence sweep that keeps these environment-specific
checks visible, run:

```sh
npm run v1:readiness
```
