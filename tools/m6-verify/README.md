# M6 Current-State Verification

This runner verifies the completed M6 surface:

- strict M6 bake-off fixture,
- benchmark validation helper against the M6 fixture,
- bundled `mini-bank` sample graph smoke,
- frontend production build,
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
- Rust sidecar `cargo test`,
- Tauri shell `cargo test`, including command-level coverage for bundled sample
  analysis, source snippets, graph-cache reuse/invalidation, and path traversal
  rejection.

It also runs JVM parser work as advisory checks:

- mapa analyzer candidate against the strict M6 fixture,
- Rust/ProLeap/mapa candidate comparison on the strict M6 fixture,
- parser-upgrade readiness.

Advisory failures do not fail this current-state verification; the production sidecar remains Rust until the parser decision gate is complete.

```sh
npm run m6:verify
```

The true parser swap remains gated by benchmark-scale comparison and packaging readiness.

Local Ollama readiness is intentionally separate from this suite because not
every development machine has Ollama installed. Run it explicitly with:

```sh
npm run ollama:check
npm run ollama:summary-smoke
npm run ollama:ask-smoke
```

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
