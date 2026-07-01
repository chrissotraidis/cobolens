# M6 Completion Audit

Date: 2026-06-30

## Scope

This audit checks the local v1/M6 continuation goal against current repo evidence. The official benchmark suite was cloned into `.cache/benchmarks/COBOL-Legacy-Benchmark-Suite` for local validation, but it remains untracked. Linux packaging is validated in WSL; Windows installer readiness is not claimed.

## Requirement Evidence

| Requirement | Current evidence | Status |
| --- | --- | --- |
| User-facing lineage and impact/where-used UI exists without parser-internal coupling | `src/App.tsx` renders `LineageImpactPanel` from `GraphDocument` nodes/edges only. It uses edge types such as `reads`, `writes`, `moves-to`, `queries`, `links`, `uses-dd`, and node types such as `data-item`, `dataset`, `db2-table`, `cics-command`, `jcl-dd`. | Done |
| Developer can open the M6 fixture graph in the app | `npm run m6:fixture-graph` generates `public/m6-bakeoff-graph.json`; Vite dev URL is `http://127.0.0.1:1420/?graph=/m6-bakeoff-graph.json`. | Done |
| UI answers "what depends on this?" and "where does this data flow?" | `docs/m6-ui-qa.md` records in-app browser checks for `LINEAGE`, `CUSTOMER-ID`, `CUSTOMER_TABLE`, `RATEAPI`, `BANK.CUSTOMER.MASTER`, and `CUSTIN`. | Done |
| Strict M6 bake-off passes | `node tools/m6-bakeoff/run.mjs` passed on the current Rust sidecar. `npm run m6:verify` also runs this gate. | Done |
| Frontend build passes | `npm run build` passed. `npm run m6:verify` also runs this gate. | Done |
| Rust sidecar check passes | `cargo check` passed in `sidecar/cobolens-analyze`. `npm run m6:verify` also runs this gate. | Done |
| Benchmark requirement improved without inventing absent benchmark results | `npm run validate:benchmark:local` passed for the Rust sidecar: 77 files scanned, 77 lightweight graph scans completed, 40 graceful tree-sitter syntax warnings, 1,687 nodes, 2,698 edges, and 100% cited-edge coverage. The suite and JSON report remain ignored under `.cache`. | Current analyzer benchmark validation done |
| Parser upgrade revisited after UI usefulness | ProLeap and mapa candidates both emit the same `GraphDocument` contract and pass the strict fixture. On the cloned benchmark comparison, Rust, ProLeap, and mapa all pass the graph contract after graceful-error/timeout hardening; ProLeap has the richer DB2/CICS signal, while mapa currently falls back when CallTree times out. `docs/m6-parser-upgrade-readiness.md` keeps Rust as the v1 production sidecar until packaging and parser-quality tradeoffs are resolved. | Done for v1 decision |
| Packaging implications are explicit | `npm run m6:packaging-readiness` reports sidecar/JDK sizes, startup smoke timings, WSL Linux prerequisites, Windows host prerequisites, and a repeatable `packagedDebSmoke` when a `.deb` bundle exists. Current Linux readiness is true. `npm run tauri build` produced `.deb`, `.rpm`, and `.AppImage` bundles under `src-tauri/target/release/bundle/`. The Linux `.deb` includes the production analyzer at `usr/lib/Cobolens/cobolens-analyze` and the bundled sample at `usr/lib/Cobolens/samples/mini-bank/`. The packaged analyzer parsed the packaged sample with 4 parsed files, 25 nodes, 27 edges, and 0 parse errors. `npm run desktop:packaged-smoke` launches the AppImage under WSLg and verifies that the packaged GUI stays alive with WebKit/GStreamer runtime complete. The Windows host remains unvalidated and lacks Node/npm, Rust, Microsoft C++ Build Tools, and WebView2. | Linux packaging validated |
| V1 readiness evidence can be rerun from one command | `npm run v1:readiness` now runs the required `m6:verify` suite, then records optional local gates when prerequisites exist. On this WSL machine it passed `m6:verify`, the cached COBOL Legacy Benchmark Suite, local Ollama readiness with `llama3.2:1b`, local Ollama grounded Summary smoke, local Ollama grounded Ask smoke with guarded cited fallback, and the packaged Linux AppImage GUI smoke. | Current local readiness sweep passed |

## Current Production Decision

Keep the Rust analyzer as the v1 production sidecar. Do not swap production to ProLeap or mapa in this repo state.

Reasons:

- The Rust sidecar satisfies the local M6 fixture and UI contract with the smallest footprint.
- ProLeap and mapa are useful candidates, but both add JVM/runtime packaging work if adopted for production.
- Official benchmark-suite comparison is contract-green, but adopting a JVM candidate would add packaging and quality tradeoffs.
- Linux/Tauri packaging is validated for the Rust production sidecar, including
  packaged analyzer, packaged sample resources, and AppImage GUI launch smoke.
  Windows/Tauri packaging is not a current target and has not been validated.

## Remaining External Gates

1. Decide whether mapa's benchmark CallTree timeout is acceptable as a fallback-only path or needs deeper upstream tuning before adoption.

2. Validate Windows/Tauri packaging only if Windows installers become a target.

3. If a JVM analyzer is still desired after those gates, decide between:

- Rust production sidecar with semantic slice only.
- ProLeap-only JVM sidecar.
- mapa-only JVM sidecar.
- ProLeap plus mapa hybrid.
