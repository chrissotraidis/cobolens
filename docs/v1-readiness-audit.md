# V1 Readiness Audit

Date: 2026-07-01

## Scope

This audit maps the PRD v1 functional requirements to current repo evidence.
It is a release-readiness aid, not a release tag. The source of truth remains
`docs/COBOL-Lens-PRD.md`; if this audit conflicts with the PRD, the PRD wins.

Current verdict: Cobolens is a Linux-validated v1 release candidate for the
local understanding workflow. The core loop is evidenced: scan or load COBOL,
copybooks, and JCL; inspect a focus-and-expand dependency map; read cited graph
facts and summaries; ask graph-grounded questions with clickable citations; use
local Ollama or configured cloud providers with visible privacy state.

Not claimed yet:

- Signed cross-platform installers are not validated. Linux AppImage packaging
  is validated locally; Windows packaging is explicitly not claimed.
- Persistent vector index storage is not implemented yet. Model-routed Ask can
  now augment graph-guided context with live vector-ranked graph chunks when a
  local embedding model is available; failures degrade to graph-only context.
  The embedding adapter only sends requests to localhost Ollama in local mode,
  and cloud embeddings are rejected until an explicit provider implementation
  exists.
- Accessibility evidence is source-level and browser-interaction based; it is
  not a full screen-reader certification pass.

## Evidence Commands

- `npm run m6:verify`
- `npm run v1:readiness`
- `npm run validate:benchmark:local` when the benchmark checkout exists under
  `.cache/benchmarks/COBOL-Legacy-Benchmark-Suite`
- `npm run desktop:packaged-smoke` after a Linux AppImage build
- In-app browser checks recorded in `docs/m6-ui-qa.md`

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
| FR-8 copybook usage | `COPIES` edges and copybook/data-item definitions are shown in graph, impact, Ask, and export. | Evidenced |
| FR-9 SQL/CICS signals | M6 fixture and parser signals cover DB2 table and CICS command nodes. | Evidenced |
| FR-10 data lineage | M6 lineage UI, graph Ask, and export smoke cover reads, writes, moves-to, queries, uses-dd, and assigned-to paths. | Evidenced on current semantic graph |
| FR-11 impact/where-used | Impact panel, relationship details, graph Ask, and UI contract smoke cover where-used relationships. | Evidenced |
| FR-12 unreferenced detection | Graph Hints and export list potentially unreferenced source units with cautious wording. | Partial/Should |
| FR-13 focus-and-expand graph | Sigma focus slice, visible-node controls, and expand behavior are covered by UI contract smoke. | Evidenced |
| FR-14 clustering/LOD | Focus limits and `+N type` cluster expansion are covered by UI QA and contract smoke. | Evidenced |
| FR-15 click-to-code/edge detail | Node, edge, relationship citation, and Ask citation jumps are covered by UI QA and contract smoke. | Evidenced |
| FR-16 legend/minimap/colors | Persistent semantic filters/colors and graph orientation/minimap surfaces are covered by UI QA. | Evidenced |
| FR-17 static export diagrams | Export docs smoke covers Markdown, Mermaid, and PNG artifacts. | Evidenced |
| FR-18 search/breadcrumb/home | Fuzzy search, breadcrumb history, and Home reset are covered by UI QA and source contract checks. | Evidenced/Should |
| FR-19 generated summaries | Summary prompt/guard smokes, local summary smoke, and export provenance cover cited summaries and graph fallbacks. | Evidenced |
| FR-20 Rosetta mode | Model prompts and Summary/Ask pass the selected Rosetta language. | Evidenced |
| FR-21 documentation export | Export docs smoke covers navigable Markdown, diagrams, source ranges, lineage, parse warnings, and summary provenance. | Evidenced |
| FR-22 grounded Ask retrieval | Graph-guided context assembly, optional semantic vector matches, graph Ask smoke, semantic retrieval smoke, and model prompt/guard smokes cover grounded Ask without whole-file dumping. | Evidenced |
| FR-23 clickable citations | Citation buttons jump to source/graph while preserving Ask answer visibility; model guard requires exact inline citations. | Evidenced |
| FR-24 bidirectional graph/chat links | Overview seeds Ask, Ask citations focus graph/code, and relationship citations preserve conversational context. | Evidenced/Should |
| FR-25 no invented structure | Graph answer smoke, model prompts, answer guard, and cited graph fallback enforce graph-grounded answers. | Evidenced |
| FR-26 provider selection | Model settings support Ollama, Anthropic, OpenAI, and OpenRouter. | Evidenced |
| FR-27 keychain secrets | Tauri tests reject secret-like app settings; cloud keys are read through OS keychain commands. | Evidenced |
| FR-28 privacy indicator/local mode | Top-bar mode indicator, local Ollama URL guard, and model privacy smoke cover local/cloud mode invariants. | Evidenced |
| FR-29 token/cost estimate | AI usage panel shows local/cloud call count and bulk summary input estimate. | Evidenced/Should |
| FR-30 embedding privacy | `src/model/embeddings.ts` gates local embeddings to localhost Ollama `/api/embed`, rejects remote/local-HTTPS/cloud routes, and is covered by embedding privacy smoke. Model-routed Ask can use live semantic matches; persistent vector index storage remains deferred. | Evidenced/partial storage |
| FR-31 bundled sample | `mini-bank` sample is bundled and validated in sample smoke and packaged smoke. | Evidenced |
| FR-32 guided first-run | Ingest and empty graph states now show the sample/folder path, make AI optional, and point users to Summary/Ask after the map is loaded. | Evidenced/Should |

## Current Release Risks

- Local Ollama quality and speed depend heavily on the installed model and CPU.
  The app now provides readiness checks, installed-model chips, Stop controls,
  staged progress guidance, and cited graph fallback when model prose is not
  citation-clean.
- The production analyzer remains the lightweight Rust sidecar. ProLeap and
  mapa are validated candidates, but not production dependencies.
- Windows packaging remains unvalidated in this checkout.
