# Cobolens Capability Vs Spec Audit

Date: 2026-07-08  
Local app: `http://127.0.0.1:1420/`  
Spec source: `docs/COBOL-Lens-PRD.md`  
Audit scope: browser preview plus repo verification gates. Desktop-only local folder, keychain, and packaged GUI behaviors are covered by automated Tauri tests and existing docs, not by manual browser screenshots.

## Verdict

Cobolens is in strong local v1 release-candidate shape for the core understanding loop: load sample or scan source, browse COBOL/copybook/JCL units, inspect a focus graph, jump from graph facts and Ask citations to source lines, ask deterministic graph questions without AI, configure optional model providers, and export Markdown/Mermaid/PNG docs.

The main caveats are not broad product gaps; they are release-evidence and polish gaps:

- Optional local AI is not fully ready on this machine because the configured generation model and embedding model are missing.
- Real production-corpus parser coverage remains unclaimed.
- Signed public installers and packaged GUI evidence are still incomplete here.
- Graph Ask can under-answer multi-intent questions such as a combined read/write ask, even though the separate read and write questions work.
- The browser preview cannot prove desktop-only behaviors such as folder picker, OS keychain storage, and packaged shell UX.

## Captured Steps

1. First run / empty project: healthy.
   Evidence: `screenshots/01-first-run.png`
   The first screen explains Import Project vs Sample, says AI is optional, disables export/source until a graph is loaded, and keeps the workbench shape.

2. Sample loaded / graph overview: healthy.
   Evidence: `screenshots/02-sample-loaded-map.png`
   The M6 fixture loads with codebase browser, focus map, Overview, parse health, inventory, graph hints, citations, and enabled export.

3. Source reader: healthy.
   Evidence: `screenshots/03-source-reader.png`
   Source opens in the center workspace, preserves COBOL line layout, shows file context and line range, and includes a file selector.

4. Citation to exact source line: healthy.
   Evidence: `screenshots/04-citation-line-40.png`
   Clicking `LINEAGE executes LINK RATEAPI` lands on `src/LINEAGE.cbl:40`, marks the focused citation line, and keeps the relationship detail visible.

5. Chat empty state / graph mode: healthy.
   Evidence: `screenshots/05-chat-empty.png`
   Chat is available without AI, labels graph suggestions separately from Ollama prompts, and keeps the current focus visible.

6. Graph Ask combined read/write question: partial.
   Evidence: `screenshots/06-graph-ask-answer.png`
   The app answered from the graph with clickable citations, but only answered the read half of “What files does LINEAGE read and what does it write?”

7. Graph Ask write-specific question: healthy.
   Evidence: `screenshots/07-graph-ask-write-answer.png`
   The write-specific question correctly reports `LINEAGE writes REPORT-RECORD` at `src/LINEAGE.cbl:26`.

8. Settings / AI readiness: mostly healthy, with local machine setup gap.
   Evidence: `screenshots/08-settings.png`
   Settings keeps scan/model controls out of the navigator, shows provider options, local usage, bulk estimate, Rosetta language, and model readiness. It correctly reports missing configured local models, though the mixed “Ollama answered” plus missing model state is slightly confusing.

9. Export: healthy in browser preview.
   Evidence: `screenshots/09-export-toast.png`
   Export reports downloaded `cobolens-lineage.md`, `cobolens-lineage.mmd`, and `cobolens-lineage.png`.

10. Search: healthy.
    Evidence: `screenshots/10-search-results.png`
    Search finds copybooks, data items, datasets, and DB2 table nodes for `customer`.

11. Graph filters: healthy.
    Evidence: `screenshots/11-filter-db2-hidden.png`
    Hiding DB2 tables updates the filter summary and graph counts from `12 visible / 0 hidden` to `11 visible / 1 hidden`.

## Requirement Coverage Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Open bundled sample | Verified live | Sample loads from the browser preview. |
| Open local folder | Evidenced by Tauri tests, not live browser | Browser preview cannot prove desktop folder picker. |
| Discover COBOL/copybooks/JCL | Verified by sample and M6 suite | M6 fixture reports 4 parsed files and full semantic signals. |
| Fixed/free format and encoding | Evidenced by tests | CP037 and scan settings covered by sidecar/Tauri tests. |
| Parse health / warnings | Verified live and by tests | Parse health shows dialect metadata and no warnings for sample. |
| Graph contract / semantic nodes | Verified by suite | M6 fixture has programs, copybooks, datasets, JCL, DB2, CICS, data items. |
| Focus-and-expand graph | Verified live and by rendered smoke | Live graph is focus-first; rendered smoke covers expansion/LOD. |
| Search / breadcrumbs / home | Partially live, suite covered | Search live verified; broader keyboard/home flow covered by rendered smoke. |
| Click graph/evidence/citations to source | Verified live | Exact citation line focus works. |
| Overview / Dependencies / Source | Verified live | Overview and relationship detail visible; dependencies tested by M6 suite. |
| Graph Ask without AI | Verified live | Works with citations; multi-intent combined ask is a rough edge. |
| Optional AI summaries / Ask | Evidence strong, local setup incomplete | Guards/fallbacks pass; local configured model and embedding model missing here. |
| Provider support | Evidenced by settings and tests | Settings shows Ollama, Anthropic, OpenAI, OpenRouter; keychain is desktop-tested. |
| Local/cloud honesty and privacy | Verified by settings and tests | Local mode indicator, localhost checks, cloud embedding rejection covered. |
| Export Markdown/Mermaid/PNG | Verified live and by suite | Browser preview reports three downloads; export smoke validates content. |
| Accessibility basics | Evidence good, not full certification | Skip links, focus landmarks, named controls covered by accessibility smoke. |
| Packaging | Partial | Contract and unsigned bundle workflow evidence pass; signed installers and local AppImage smoke are not complete here. |

## Verification Results

- `npm run build`: passed.
- `npm run m6:verify`: passed required suite.
- `npm run v1:readiness`: required gates passed, overall `ready: false` because optional evidence is not clean/complete.

Readiness optional gaps:

- Local benchmark suite skipped: missing `.cache/benchmarks/COBOL-Legacy-Benchmark-Suite`.
- Local Ollama readiness failed: Ollama is installed/reachable and has `qwen3.5:2b-nvfp4`, but configured `llama3.2:1b` and `nomic-embed-text` are missing.
- Packaged Linux GUI smoke skipped: missing AppImage bundle; requires `npm run tauri build`.

Advisory parser-candidate gaps:

- ProLeap/mapa comparison is advisory only and not release-blocking for the Rust production analyzer.
- Java, javac, Maven, and Java 21 are missing here, so parser upgrade readiness is false in this environment.

## Highest-Value Next Fixes

1. Improve graph Ask classification for combined intents.
   Example: “What files does LINEAGE read and what does it write?” should include both `reads CUSTOMER-FILE` and `writes REPORT-RECORD`, not only the read relationship.

2. Make the local AI readiness state less contradictory.
   Settings should avoid implying “Ollama answered” as a green first step when the selected generation model is missing. “Ollama server reachable” would be clearer.

3. Complete optional release evidence.
   Add the benchmark checkout, install the intended Ollama generation and embedding models, and run a packaged GUI smoke.

4. Validate a real production COBOL/JCL corpus.
   Current fixture evidence is strong, but the PRD still explicitly avoids claiming production-corpus parser coverage.

5. Keep desktop-only claims separated from browser-preview claims.
   Folder picker, keychain, and packaged shell are covered by tests, but they should keep receiving periodic manual desktop passes before release.
