# Cobolens

Cobolens is a free, open-source, local desktop app for understanding COBOL
codebases. It is an understanding tool, not a migration or code-generation
tool: point it at COBOL, copybooks, and JCL, then inspect the dependency map,
source citations, lineage, and impact relationships locally.

The product source of truth is [docs/COBOL-Lens-PRD.md](docs/COBOL-Lens-PRD.md),
with [PRD.md](PRD.md) as the stable root entry point for agents and contributors.
Build milestones follow PRD section 19.

Agent build guidance starts at [AGENTS.md](AGENTS.md), which points to the
canonical guide under `docs/`.

## Current Status

As of 2026-06-30, M0-M6 local v1 work is implemented and committed.

- M0-M5: Tauri/React shell, scanning, graph view, summaries/model wiring,
  grounded chat/export polish, sample workflow, and privacy/mode surfaces are
  in place.
- M6: lineage and impact/where-used UI is live on top of the existing
  `GraphDocument` contract. The UI does not depend on parser internals.
- Production analyzer decision: keep the Rust analyzer as the v1 production
  sidecar. ProLeap and mapa are benchmark-checked candidates, but they are not
  adopted production dependencies yet.
- Linux packaging from WSL is validated. `npm run tauri build` builds the
  production analyzer sidecar, bundles it with the sample codebase, and
  produced `.deb`, `.rpm`, and `.AppImage` artifacts.
- Windows packaging is not a current target and is not validated in this
  checkout.

## What Works

- Open or load a graph JSON for a COBOL/JCL codebase.
- Configure scan format (`auto`, `fixed`, `free`), source extensions, and
  UTF-8 or CP037/EBCDIC source encoding before opening or re-scanning a desktop
  codebase.
- See a lightweight dialect/features guess in Parse Health, based on detected
  fixed/free-format COBOL, copybooks, JCL, `EXEC SQL`, `EXEC CICS`, and compiler
  directives.
- See desktop indexing progress from the analyzer while scans are running.
- Skip common build/dependency folders and oversized source-like files during
  scan discovery and cache fingerprinting, so real repo checkouts stay snappy.
- Navigate an interactive focus graph.
- Click nodes and relationships to inspect cited source locations.
- Inspect lineage and impact relationships for semantic graph signals:
  `reads`, `writes`, `moves-to`, `queries`, `updates`, `links`, `xctls`,
  `uses-dd`, `assigned-to`, and `executes`.
- Trace COBOL `SELECT ... ASSIGN TO` logical files through JCL DD names to
  physical datasets, with cited source lines.
- Flag source units with no recorded incoming graph edges as potentially
  unreferenced, both in the UI and exported Markdown.
- Generate the M6 fixture graph and use the app to answer:
  "what depends on this?" and "where does this data flow?"
- Preflight local/cloud model readiness for AI Ask and summaries, with Stop
  controls and bounded timeouts so model calls do not leave the UI spinning.
- Apply the selected Rosetta language to both grounded Ask and generated
  summaries while preserving graph-only grounding and citation rules.
- Resolve "this program" style model-backed Ask questions against the current
  selected graph node, and require exact inline source citations such as
  `(src/LINEAGE.cbl:21)` instead of footnote-style references.
- Persist non-secret scan/model preferences locally while API keys remain in
  the OS keychain.
- Validate parser candidates against the strict M6 fixture and the cloned
  benchmark suite when available locally.

## Quick Start

Install dependencies:

```sh
npm install
```

Run the app in development:

```sh
npm run tauri dev
```

If a Vite dev server is already running on port `1420`, smoke-test only the
desktop shell against it:

```sh
npm run desktop:smoke
```

Generate and load the M6 fixture graph:

```sh
npm run m6:fixture-graph
npm run dev -- --host 127.0.0.1 --port 1420
```

Then open:

```text
http://127.0.0.1:1420/?graph=/m6-bakeoff-graph.json
```

## Build And Package On Linux

The Linux packaging path is the supported local build path for this machine.
Install the Tauri Linux prerequisites first:

```sh
sudo apt-get update
sudo apt-get install -y \
  pkg-config \
  libdbus-1-dev \
  libwebkit2gtk-4.1-dev \
  libjavascriptcoregtk-4.1-dev \
  libsoup-3.0-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

Check readiness:

```sh
npm run m6:packaging-readiness
```

Build release bundles:

```sh
npm run tauri build
```

The release build runs `npm run tauri:before-build`, which compiles the
frontend and the production Rust analyzer sidecar before Tauri packages the
app. The Linux bundles include both:

- `usr/lib/Cobolens/cobolens-analyze`
- `usr/lib/Cobolens/samples/mini-bank/`

Successful Linux builds produce:

- `src-tauri/target/release/bundle/deb/Cobolens_0.1.0_amd64.deb`
- `src-tauri/target/release/bundle/rpm/Cobolens-0.1.0-1.x86_64.rpm`
- `src-tauri/target/release/bundle/appimage/Cobolens_0.1.0_amd64.AppImage`

## Verification

Run the current M6 verification suite:

```sh
npm run m6:verify
```

Check the optional local Ollama path:

```sh
npm run ollama:check
npm run ollama:summary-smoke
npm run ollama:ask-smoke
```

This verifies that `ollama` is installed in the same Linux environment, the
local HTTP API is reachable, and the default `llama3.2` model is installed.
If it fails, install Ollama and run:

```sh
ollama pull llama3.2
```

Smoke-test the desktop shell against an already-running Vite server:

```sh
npm run desktop:smoke
```

Smoke-test a built Linux AppImage in a visible Linux desktop or WSLg session:

```sh
npm run desktop:packaged-smoke
```

This launches the newest AppImage under
`src-tauri/target/release/bundle/appimage/`, verifies the AppDir contains the
analyzer sidecar and bundled `mini-bank` sample, runs that packaged analyzer
against the packaged sample, and confirms that the packaged GUI process stays
alive. It is intentionally separate from `npm run m6:verify` because it needs
desktop WebKit/GStreamer runtime support.
If `gst-inspect-1.0` is missing but the `appsink` runtime plugin is present,
the smoke launches the app and lets WebKit/GStreamer prove the runtime directly.
If it reports that `appsink` itself is missing, install the GStreamer runtime
plugins, for example `gstreamer1.0-plugins-base`; `gstreamer1.0-tools` adds the
optional diagnostic command.

`npm run m6:verify` also runs Tauri command-level tests that exercise the
desktop analysis path against the bundled sample, source snippet reads, and
path traversal rejection. These tests also cover graph-cache reuse and cache
invalidation when source manifests change, plus desktop export writing for the
Markdown, Mermaid, and PNG artifacts.
It also includes a UI contract smoke for the Ask/Inspector shell so graph-answer
layout, readable tabs, and relationship citation labels do not regress silently.

`npm run m6:packaging-readiness` includes a `packagedDebSmoke` gate when a
Linux `.deb` bundle exists. It extracts the package, verifies
`usr/lib/Cobolens/cobolens-analyze` and `usr/lib/Cobolens/samples/mini-bank/`,
then runs the packaged analyzer against the packaged sample. The current local
bundle produces 4 parsed files, 25 nodes, 27 edges, and 0 parse errors.

Run the strict fixture bake-off directly:

```sh
node tools/m6-bakeoff/run.mjs
```

Run benchmark validation once a benchmark checkout exists locally:

```sh
npm run validate:benchmark -- --root /path/to/COBOL-Legacy-Benchmark-Suite
npm run validate:benchmark -- --root /path/to/COBOL-Legacy-Benchmark-Suite --report .cache/benchmark-reports/legacy-benchmark-report.json --graph .cache/benchmark-reports/current-graph.json
npm run m6:compare-candidates -- --root /path/to/COBOL-Legacy-Benchmark-Suite --timeout-ms 70000
```

If the benchmark lives at `.cache/benchmarks/COBOL-Legacy-Benchmark-Suite`,
run the shortcut:

```sh
npm run validate:benchmark:local
```

The benchmark report records lightweight scan coverage, clean parse coverage,
listed syntax warnings or parse failures, node/edge type counts, citation
coverage, source-backed node coverage, external-node counts by type, and the
semantic signals needed for v1 graph understanding. The optional graph snapshot
captures the exact `GraphDocument` behind the report. The local benchmark
checkout and reports live under `.cache/` and are intentionally ignored.

## Parser Notes

Cobolens keeps parser output behind one JSON contract, `GraphDocument`.
The UI consumes nodes and edges from that contract only.

Current production path:

- Rust sidecar: production v1 analyzer.

Candidate paths:

- ProLeap JVM sidecar: emits the same graph contract and provides richer DB2/CICS
  signal in benchmark comparison.
- mapa JVM sidecar: emits the same graph contract and is useful for portfolio/JCL
  analysis, but currently falls back when upstream `CallTree.jar` times out on
  the benchmark suite.

More detail:

- [M6 completion audit](docs/m6-completion-audit.md)
- [M6 parser upgrade readiness](docs/m6-parser-upgrade-readiness.md)
- [M6 UI QA](docs/m6-ui-qa.md)

## Project Shape

- `src/` - React/TypeScript app.
- `src-tauri/` - Tauri v2 shell.
- `sidecar/cobolens-analyze/` - Rust production analyzer sidecar.
- `sidecar/cobolens-analyze-jvm/` - ProLeap candidate sidecar.
- `sidecar/cobolens-analyze-mapa/` - mapa candidate sidecar.
- `fixtures/m6-bakeoff/` - strict M6 lineage/impact fixture.
- `tools/` - validation, benchmark, parser comparison, and packaging checks.
