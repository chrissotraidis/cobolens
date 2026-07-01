# Cobolens Agent Guide

This guide orients coding agents and contributors. Read this file first, then read [COBOL-Lens-PRD.md](COBOL-Lens-PRD.md).

## What You Are Building

Cobolens is a free, open-source, local-first desktop app for understanding COBOL, copybooks, and JCL.

It lets a developer:

- open a local COBOL/JCL codebase or bundled sample;
- inspect a focus-and-expand dependency map;
- jump from graph nodes, relationships, and Ask citations into source;
- ask graph-grounded questions with citations;
- optionally configure local Ollama or a cloud provider for AI summaries and broader Ask answers;
- export Markdown, Mermaid, and PNG documentation.

Cobolens is an understanding tool. It is not a migration suite, code generator, translator, verifier, hosted service, or live mainframe connector.

## Principle 0

Lightweight, not over-engineered.

Prefer the smallest boring implementation that preserves the local end-to-end experience. Do not add a backend server, external database, plugin system, routing layer, job queue, broad abstraction, or new dependency unless a concrete requirement forces it.

The whole app should remain understandable as:

```text
Tauri shell + React UI + analyzer sidecar + local graph/cache files
```

## Current Product Shape

The UI is a three-pane workspace:

- Top bar: brand, Search codebase, current focus, local/cloud indicator, Export, Settings.
- Left navigator: ingest, codebase browser, filters/legend, inventory, parse health, graph hints.
- Center: focus-and-expand dependency graph.
- Right: Source panel plus inspector tabs: Overview, Ask, Dependencies, Source.

Settings are intentionally simple: one drawer in the top bar. AI provider setup and scan settings live there.

Graph answers work without AI. AI actions are opt-in and should open Settings or show setup guidance until the selected provider is ready.

## Source Of Truth

- [COBOL-Lens-PRD.md](COBOL-Lens-PRD.md) is the current product specification.
- [v1-readiness-audit.md](v1-readiness-audit.md) maps PRD requirements to evidence.
- [m6-ui-qa.md](m6-ui-qa.md) records browser QA for the current UI.
- Historical research files `00-*` through `05-*` are context, not implementation instructions.

If docs conflict, prefer this order:

1. Current user request
2. Current code/tests
3. Current PRD
4. Readiness/QA docs
5. Historical research

## Architecture Guardrails

- Parser output is a swappable `GraphDocument` JSON contract. UI code must not depend on parser internals.
- The graph is the ground truth for map, dependencies, source citations, graph Ask, and export.
- AI explains retrieved graph/source context. It must not invent nodes, edges, files, or structure.
- Citations must point to exact source file/line evidence where possible.
- Local mode must stay honest: inference and embeddings are restricted to localhost Ollama paths.
- Cloud keys belong in the OS keychain, never plaintext config or logs.
- Missing AI must not block graph navigation, source inspection, graph Ask, or export.

## Default Work Loop

1. Read the relevant code and docs before editing.
2. Make the smallest coherent change.
3. Update tests or smoke contracts when behavior changes.
4. Run focused verification first, then the broader suite when the change touches product behavior.
5. Update docs that would otherwise become stale.
6. Commit with a clear message and push when asked.

## Verification Commands

Use the smallest useful check while iterating:

```sh
npm run build
node tools/m6-verify/ui-contract-smoke.mjs
```

Use the main release-candidate suite before pushing broad product changes:

```sh
npm run m6:verify
```

Use the broader readiness sweep when packaging, local Ollama, benchmark, or desktop runtime evidence matters:

```sh
npm run v1:readiness
```

Useful focused checks:

```sh
npm run m6:fixture-graph
npm run desktop:smoke
npm run desktop:packaged-smoke
npm run ollama:check
npm run ollama:summary-smoke
npm run ollama:ask-smoke
npm run validate:benchmark:local
npm run m6:compare-candidates
```

## Stop And Ask When

- A change would add a new app architecture layer.
- A change would add a new dependency without a clear v1 requirement.
- A change would weaken local privacy guarantees.
- A change would turn Cobolens into generation, translation, verification, team sync, or mainframe connectivity work.
- A required verification gate cannot pass and the failure is not clearly unrelated.

## Definition Of Done

A v1-quality change should preserve the core loop:

1. Open sample or folder.
2. See a usable dependency graph.
3. Select a symbol.
4. Read source and Overview evidence.
5. Ask a graph question and get a cited answer without AI.
6. Configure AI only if desired.
7. Export useful documentation.
