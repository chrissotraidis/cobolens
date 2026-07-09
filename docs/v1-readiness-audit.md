# V1 Readiness Audit

Date: 2026-07-09 (updated). Original audit: 2026-07-01.

## 2026-07-09 update: release-confidence gate

The required local `m6:verify` suite passes, but release confidence is not yet
fully proven because the two latest GitHub `health` runs on `main` were red. The
latest failure occurred while waiting ten seconds for Chrome's remote debugging
port rather than in an application assertion.

The current worktree replaces that fixed startup with two bounded 30-second
attempts, unique attempt profiles, early exit detection, and actionable browser
diagnostics. A focused smoke simulates an early process failure and verifies the
retry and final error. Health and package workflows now pin Node.js 22, install
`rustfmt` and `clippy`, and the required suite runs formatting and warning-denying
lint checks for both Rust crates.

This update does not claim a green remote gate yet. Release-confidence proof
requires three consecutive successful `main` health runs after these changes are
published.

## 2026-07-09 update: Local AI reliability gate

Local AI readiness now ignores stale responses from superseded provider/model
settings, and the readiness sweep selects an installed non-embedding Ollama
model unless `COBOLENS_READINESS_MODEL` explicitly names one. This prevents a
finished scan or settings refresh from reverting a working model to the
incorrect **Set up AI** state.

Grounded Ask now gives Ollama an explicit evidence/citation whitelist, runs with
thinking disabled and a stable seed, filters claims independently, preserves
safe cited model text, and supplements only missing material from graph
evidence. Common harmless wrappers such as `file:path:line`, `[[path:line]]`,
and numeric footnote markers are normalized before validation; citations outside
the retrieved context remain rejected. A single bounded citation-format retry
is allowed before the explicit cited graph fallback.

The live `qwen3.5:2b-nvfp4` evidence run completed ten representative questions:
nine retained model content, one used the explicit cited graph fallback, every
question streamed, the repeated question returned another grounded answer, and
cancellation settled in 5 ms. The grounded Summary smoke also passed. These are
local reference-model results, not a claim that every Ollama model has equivalent
quality.

## 2026-07-06 update: fresh-clone integrity

A build-guide review pass fixed two clean-clone blockers and one Tauri test bug:

- `src-tauri/binaries/` is now a tracked resource path (via `.gitkeep`), so
  `npm run tauri dev`, `cargo test`, and `npm run m6:verify` no longer fail with
  `resource path 'binaries' doesn't exist` on a fresh checkout.
- `public/m6-bakeoff-graph.json` is committed as a demo asset, so the browser
  `Open Sample` action works without first running `npm run m6:fixture-graph`.
- The `write_export_files` Tauri test now compares canonicalized paths (macOS
  `/var` -> `/private/var`), so `cargo test` passes on macOS as well as Linux.

`npm run m6:verify` now completes end-to-end from a clean clone (23 checks
PASS). Evidence claims below that cite `m6:verify` are therefore reproducible
from a fresh checkout, which was not true in the original audit.

Local AI wiring was also hardened: a dedicated embedding model (default
`nomic-embed-text`) is now separate from the generation model; local Ollama uses
the chat API (so thinking-capable models' reasoning stays out of cited answers);
readiness/`ollama:check` probe generation and embeddings separately; and
semantic-retrieval failure surfaces a visible note instead of degrading
silently. See [tech-debt.md](tech-debt.md) for the remaining local-AI work
(desktop Ollama install-vs-running detection and retrieval/source follow-ups).

## Original audit

Date: 2026-07-01

## Scope

This audit maps the PRD v1 functional requirements to current repo evidence.
It is a release-readiness aid, not a release tag. The source of truth remains
`docs/COBOL-Lens-PRD.md`; if this audit conflicts with the PRD, the PRD wins.

Current verdict: Cobolens is a Linux-validated v1 release candidate for the
local understanding workflow. The core loop is evidenced: scan or load COBOL,
copybooks, and JCL; inspect a focus-and-expand dependency map; read cited graph
facts in Overview; ask graph-grounded questions with clickable citations; view
source; configure optional local Ollama or cloud providers through Settings;
and export documentation.

Not claimed yet:

- Signed cross-platform installers are not validated. Linux AppImage packaging
  is validated locally, and GitHub Actions now runs unsigned Linux/Windows
  Tauri bundle builds with OS-specific unsigned bundle artifacts for QA.
  Signed Windows release installers are not yet claimed.
- A persistent local vector cache now stores graph-derived semantic chunk
  embeddings in the app's local browser storage, keyed by graph fingerprint and
  embedding model settings. It does not store source excerpts or use an
  external database. Cloud embeddings remain unimplemented and are rejected
  until an explicit provider implementation exists.
- Accessibility evidence now includes source-level checks, browser-interaction
  checks, skip links, focusable landmark targets, and an automated
  accessibility smoke. It is still not a full screen-reader certification pass.

## Evidence Commands

- `npm run m6:verify`
- `npm run v1:readiness`
- `npm run validate:benchmark:local` when the benchmark checkout exists under
  `.cache/benchmarks/COBOL-Legacy-Benchmark-Suite`
- `npm run desktop:packaged-smoke` after a Linux AppImage build
- In-app browser checks recorded in `docs/m6-ui-qa.md`
- `tools/m6-verify/accessibility-smoke.mjs` for keyboard/landmark coverage

## Functional Requirement Coverage

| Requirement | Evidence | Status |
| --- | --- | --- |
| FR-1 codebase discovery | Tauri folder open, scan settings, sidecar discovery tests, bundled sample smoke. | Evidenced |
| FR-2 fixed/free COBOL | Scan format setting, analyzer dialect metadata, M6/benchmark parsing. | Evidenced |
| FR-3 indexing cache/progress | Analyzer progress events, graph cache tests, cache invalidation tests. | Evidenced |
| FR-4 graceful parse failures | Parse warnings/errors are listed; sidecar exits successfully when usable graph data exists. | Evidenced |
| FR-5 dialect reporting | Parse Health reports dialect/features such as fixed/free, JCL, SQL, CICS, directives. | Evidenced |
| FR-6 graph nodes/edges | M6 fixture and benchmark validation cover program, paragraph, copybook, data-item, dataset, JCL, DB2, CICS nodes and cited edges. | Evidenced |
| FR-7 cross-program/JCL wiring | M6 fixture covers JCL step-to-program, DD-to-dataset, and COBOL file assignment bridge. | Evidenced |
| FR-8 copybook usage | `COPIES` edges and copybook/data-item definitions are shown in graph, Dependencies, Ask, and export. | Evidenced |
| FR-9 SQL/CICS signals | M6 fixture and parser signals cover DB2 table and CICS command nodes. | Evidenced |
| FR-10 data lineage | M6 lineage UI, graph Ask, and export smoke cover reads, writes, moves-to, queries, uses-dd, and assigned-to paths. | Evidenced on current semantic graph |
| FR-11 impact/where-used | Dependencies panel, relationship details, graph Ask, and UI contract smoke cover where-used relationships. | Evidenced |
| FR-12 unreferenced detection | Graph Hints and export list potentially unreferenced source units with cautious wording. | Partial/Should |
| FR-13 focus-and-expand graph | Sigma focus slice, visible-node controls, skip-link graph landmark, and expand behavior are covered by UI/accessibility contract smokes. | Evidenced |
| FR-14 clustering/LOD | Focus limits and `+N type` cluster expansion are covered by UI QA and contract smoke. | Evidenced |
| FR-15 click-to-code/edge detail | Node, edge, relationship citation, and Ask citation jumps are covered by UI QA and contract smoke. | Evidenced |
| FR-16 legend/minimap/colors | Persistent semantic filters/colors and graph orientation/minimap surfaces are covered by UI QA. | Evidenced |
| FR-17 static export diagrams | Export docs smoke covers Markdown, Mermaid, and PNG artifacts. | Evidenced |
| FR-18 search/breadcrumb/home | Fuzzy search, breadcrumb history, Home reset, and keyboard skip entry points are covered by UI QA and source contract checks. | Evidenced/Should |
| FR-19 generated summaries | AI summary prompt/guard smokes, local summary smoke, and export provenance cover cited summaries and graph fallbacks. | Evidenced |
| FR-20 Rosetta mode | Model prompts for AI summary and Ask pass the selected Rosetta language. | Evidenced |
| FR-21 documentation export | Export docs smoke covers navigable Markdown, diagrams, source ranges, lineage, parse warnings, and summary provenance. | Evidenced |
| FR-22 grounded Ask retrieval | Graph-guided context assembly, optional semantic vector matches, persistent local chunk-vector cache, graph Ask smoke, semantic retrieval smoke, and model prompt/guard smokes cover grounded Ask without whole-file dumping. | Evidenced |
| FR-23 clickable citations | Citation buttons jump to source/graph while preserving Ask answer visibility; model guard requires exact inline citations. | Evidenced |
| FR-24 bidirectional graph/chat links | Overview seeds Ask, Ask citations focus graph/code, and relationship citations preserve conversational context. | Evidenced/Should |
| FR-25 no invented structure | Graph answer smoke, model prompts, answer guard, and cited graph fallback enforce graph-grounded answers. | Evidenced |
| FR-26 provider selection | Top-bar Settings supports Ollama, Anthropic, OpenAI, and OpenRouter. | Evidenced |
| FR-27 keychain secrets | Tauri tests reject secret-like app settings; cloud keys are read through OS keychain commands. | Evidenced |
| FR-28 privacy indicator/local mode | Top-bar mode indicator, local Ollama URL guard, and model privacy smoke cover local/cloud mode invariants. | Evidenced |
| FR-29 token/cost estimate | Settings shows local/cloud call count and bulk summary input estimate. | Evidenced/Should |
| FR-30 embedding privacy | `src/model/embeddings.ts` gates local embeddings to localhost Ollama `/api/embed`, rejects remote/local-HTTPS/cloud routes, and is covered by embedding privacy smoke. A dedicated embedding model (default `nomic-embed-text`) is used, never the generation model as a silent fallback. Model-routed Ask persists graph-derived semantic chunk vectors in local browser storage and reuses them on later searches; when embeddings are unavailable, Ask shows a visible "semantic search unavailable" note. | Evidenced |
| FR-31 bundled sample | `mini-bank` sample is bundled and validated in sample smoke and packaged smoke. | Evidenced |
| FR-32 guided first-run | Ingest and empty graph states now show the sample/folder path, make AI optional, and point users to Overview/Ask after the map is loaded. | Evidenced/Should |

## Current Release Risks

- Local Ollama quality and speed depend heavily on the installed model and CPU.
  The app now provides readiness checks, installed-model chips, Stop controls,
  staged progress guidance, and cited graph fallback when model prose is not
  citation-clean.
- The production analyzer remains the lightweight Rust sidecar. ProLeap and
  mapa are validated candidates, but not production dependencies.
- Signed Windows release packaging remains unvalidated in this checkout.
- The "UI contract" and "accessibility" smokes are static source/CSS assertions,
  not driven-browser tests: they check that specific markup and style rules
  exist, not that the running app behaves. Treat rows evidenced only by those
  smokes as contract-level, not runtime-level, coverage. A driven-browser smoke
  for the core loop is tracked in [tech-debt.md](tech-debt.md).
- The desktop GUI has not been launched on macOS in this checkout; desktop
  verification is via `cargo test` and packaged-Linux smokes only.
