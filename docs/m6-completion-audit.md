# M6 Completion Audit

Date: 2026-06-30

## Scope

This audit checks the local v1/M6 continuation goal against current repo evidence. The official benchmark suite was cloned into `.cache/benchmarks/COBOL-Legacy-Benchmark-Suite` for local validation, but it remains untracked. This audit does not claim Windows installer readiness.

## Requirement Evidence

| Requirement | Current evidence | Status |
| --- | --- | --- |
| User-facing lineage and impact/where-used UI exists without parser-internal coupling | `src/App.tsx` renders `LineageImpactPanel` from `GraphDocument` nodes/edges only. It uses edge types such as `reads`, `writes`, `moves-to`, `queries`, `links`, `uses-dd`, and node types such as `data-item`, `dataset`, `db2-table`, `cics-command`, `jcl-dd`. | Done |
| Developer can open the M6 fixture graph in the app | `npm run m6:fixture-graph` generates `public/m6-bakeoff-graph.json`; Vite dev URL is `http://127.0.0.1:1420/?graph=/m6-bakeoff-graph.json`. | Done |
| UI answers "what depends on this?" and "where does this data flow?" | `docs/m6-ui-qa.md` records in-app browser checks for `LINEAGE`, `CUSTOMER-ID`, `CUSTOMER_TABLE`, `RATEAPI`, `BANK.CUSTOMER.MASTER`, and `CUSTIN`. | Done |
| Strict M6 bake-off passes | `node tools/m6-bakeoff/run.mjs` passed on the current Rust sidecar. `npm run m6:verify` also runs this gate. | Done |
| Frontend build passes | `npm run build` passed. `npm run m6:verify` also runs this gate. | Done |
| Rust sidecar check passes | `cargo check` passed in `sidecar/cobolens-analyze`. `npm run m6:verify` also runs this gate. | Done |
| Benchmark requirement improved without inventing absent benchmark results | `npm run validate:benchmark -- --root .cache/benchmarks/COBOL-Legacy-Benchmark-Suite` passed for the Rust sidecar: 77 files, 37 parsed, 40 graceful parse errors, 739 nodes, 821 edges. The suite remains ignored under `.cache`. | Current analyzer benchmark validation done |
| Parser upgrade revisited after UI usefulness | ProLeap and mapa candidates both emit the same `GraphDocument` contract and pass the strict fixture. On the official benchmark comparison, Rust passed, ProLeap exited during copybook preprocessing, and mapa timed out after 60 seconds. `docs/m6-parser-upgrade-readiness.md` keeps Rust as the v1 production sidecar until benchmark and packaging gates are green. | Done for v1 decision; JVM candidates not benchmark-green |
| Packaging implications are explicit | `npm run m6:packaging-readiness` reports sidecar/JDK sizes and startup smoke timings. Current WSL readiness is false because `pkg-config` and Linux Tauri WebKit/dbus development packages are missing; Windows/Tauri packaging remains unverified. | Evidence captured; external packaging still pending |

## Current Production Decision

Keep the Rust analyzer as the v1 production sidecar. Do not swap production to ProLeap or mapa in this repo state.

Reasons:

- The Rust sidecar satisfies the local M6 fixture and UI contract with the smallest footprint.
- ProLeap and mapa are useful candidates, but both add JVM/runtime packaging work.
- Official benchmark-suite comparison is not green for the JVM candidates yet.
- Windows/Tauri packaging startup behavior has not been validated on a Windows build host.

## Remaining External Gates

1. Fix or explicitly reject the benchmark-blocking JVM candidate issues:

- ProLeap exits during copybook preprocessing on the cloned benchmark suite.
- mapa times out under `npm run m6:compare-candidates -- --root .cache/benchmarks/COBOL-Legacy-Benchmark-Suite --timeout-ms 60000`.

2. Validate Windows/Tauri packaging and startup behavior for the production sidecar choice.

3. If a JVM analyzer is still desired after those gates, decide between:

- Rust production sidecar with semantic slice only.
- ProLeap-only JVM sidecar.
- mapa-only JVM sidecar.
- ProLeap plus mapa hybrid.
