# M6 UI QA

Date: 2026-06-30

## Fixture Graph

Generate the dev-server graph artifact with:

```sh
npm run m6:fixture-graph
```

Then open:

```text
http://127.0.0.1:1420/?graph=/m6-bakeoff-graph.json
```

`public/m6-bakeoff-graph.json` is generated output and is intentionally ignored.

## Browser Evidence

In the in-app browser, the M6 fixture graph loaded with inventory counts:

- 4 files
- 1 source program
- 2 copybooks
- 1 JCL job
- 1 JCL step
- 3 external references

First-run check:

- With no graph loaded, the center canvas offers `Open Sample` and `Open Folder`
  actions. In browser preview, `Open Sample` is the primary action and opens the
  bundled fixture graph while `Open Folder` remains disabled for the desktop
  shell.

The right-side Impact panel for `LINEAGE` showed:

- `LINK RATEAPI` via `executes src/LINEAGE.cbl:40`
- `CUSTOMER` and `REPORT` via `COPIES`
- `CUSTOMER-FILE` via `reads src/LINEAGE.cbl:21`
- `CUSTOMER_TABLE` via `queries src/LINEAGE.cbl:37`
- `STEP010` via `RUNS jcl/DAILYLN.jcl:2`

Search-driven checks:

- `CUSTOMER-ID` showed `CUSTOMER` as `DEFINES` and `REPORT-ID` as `moves-to src/LINEAGE.cbl:31`.
- `CUSTOMER_TABLE` showed `LINEAGE` as `queries src/LINEAGE.cbl:37`.
- `RATEAPI` showed `LINK RATEAPI` as `links src/LINEAGE.cbl:40`.
- `BANK.CUSTOMER.MASTER` showed `CUSTIN` as `uses-dd jcl/DAILYLN.jcl:3`.
- `CUSTIN` showed `BANK.CUSTOMER.MASTER` under Depends On, `STEP010` under
  Used By, and `CUSTOMER-FILE assigned-to CUSTIN src/LINEAGE.cbl:6` as the
  COBOL-to-JCL bridge.
- `CUSTOMER-FILE` summarized the path as COBOL `SELECT` -> DD `CUSTIN` ->
  dataset `BANK.CUSTOMER.MASTER`, with cited evidence.
- The left navigator includes a `Codebase` browser grouped by programs,
  copybooks, and JCL source units, so users can click through the project even
  before they know a symbol name to search for.
- Symbol search now keeps loose fuzzy matching scoped to symbol names, while
  exact/prefix/type matches still work. Searching `report` stays focused on the
  report copybook/data/dataset family instead of surfacing distant runtime
  program names, and unmatched queries show `No matching symbols.`.

Parse-health checks:

- The normal M6 fixture shows `4/4 parsed` and `No parse warnings` in the left
  navigator.
- Parse Health also shows the analyzer's lightweight dialect/features guess,
  such as fixed/free-format COBOL, copybooks, JCL, `EXEC SQL`, `EXEC CICS`, and
  compiler directives when those signals are present.
- Graph Hints reports source-backed programs, copybooks, and paragraphs with no
  recorded incoming graph edges as potentially unreferenced. The wording stays
  cautious because external schedulers may still call entry programs.
- Loading a minimal warning graph through the `?graph=` URL shows `1/3 parsed`
  and lists warning rows such as `bad/UNSUPPORTED.cbl:12` with
  `unsupported preprocessor directive`; when a line is present, clicking the
  warning jumps the code panel to that source line.

Legend/filter checks:

- The left-nav legend renders enabled checkbox filters for graph node types.
- The graph filters now sit directly under Symbols in a compact two-column grid,
  before the Codebase browser and secondary status/settings panels, so the
  color legend and visibility controls are reachable without scrolling to the
  bottom of the left pane.
- Turning `Copybooks` off changes the graph orientation from `11 visible`,
  `26 indexed`, `0 hidden` to `9 visible`, `26 indexed`, `2 hidden`; turning it
  back on restores the original counts.
- Level-of-detail cluster nodes in the graph are actionable: clicking a
  collapsed `+N type` node expands the focused owner or re-centers on a
  non-focused owner, and expanding the focused node raises the direct-neighbor
  limit instead of only changing the toolbar label.
- When a focused graph slice has no hidden direct neighbors, the toolbar button
  reads `Focus complete` instead of a disabled-looking `Expand`, and its tooltip
  points users to search or the Codebase browser for unrelated indexed nodes.

Privacy mode checks:

- In local Ollama mode, the top bar shows `Local: no code leaves` with an
  explanatory tooltip/ARIA label that the model call stays on localhost.
- Switching Provider to `Anthropic` changes the top bar to `Cloud: Anthropic`
  and explains that retrieved code context is sent to Anthropic; switching back
  to `Ollama` restores the local-mode indicator.
- Non-secret model and scan preferences are saved to local app settings
  (`settings.json` in desktop app config, browser local storage in preview).
  Cloud API keys are still saved only through the OS keychain commands and are
  rejected if they appear in app settings.
- The AI pane shows an explicit usage card with local/cloud call count, bulk
  summary input token estimate, and a note that graph answers need no model
  while summaries and non-graph Ask send cited context only when the user runs
  them.

Scan settings check:

- The Ingest pane now exposes scan format, extension, and encoding controls for
  the desktop scan path.
- Encoding offers UTF-8 and CP037 / EBCDIC US. The analyzer and desktop source
  snippet/excerpt readers decode CP037 so indexed line citations still open in
  the code panel.
- In the desktop shell, analyzer JSON progress lines are forwarded as
  `analysis-progress` events and shown in the Ingest pane as counts such as
  `Parse 3/4` while indexing is running.
- Desktop cache fingerprinting and analyzer discovery both skip common artifact
  folders such as `.git`, `node_modules`, `target`, `dist`, and `build`, and
  skip source-like files over 16 MiB so repo checkouts with build output do not
  dominate scan time.
- In the browser preview those desktop scan controls are replaced by a compact
  note because the preview is a fixed prebuilt graph JSON. Browser users are
  not offered scan actions that cannot touch a local folder.

Relationship-click check:

- Clicking `COPIES src/LINEAGE.cbl:11` from `LINEAGE` scrolls the inspector to
  the `Relationship` detail, shows `LINEAGE COPIES CUSTOMER`, and highlights
  `COPY CUSTOMER.` at `src/LINEAGE.cbl:11` in the code pane.
- Clicking a relationship citation from an Ask answer now follows the same path:
  it selects the cited graph edge, opens the `Links`/relationship detail, and
  highlights the cited source line.
- Selected relationship details now show the `from` and `to` endpoints as
  graph-refocus buttons, so a cited relationship answer can move directly from
  the evidence line to either symbol in the dependency map.

Export check:

- Clicking `Export Docs` in the browser demo reports the concrete generated
  artifact names: `cobolens-lineage.md`, `cobolens-lineage.mmd`, and
  `cobolens-lineage.png`.
- After navigating to `CUSTOMER`, clicking `Export Docs` reports
  `cobolens-customer.md`, `cobolens-customer.mmd`, and
  `cobolens-customer.png`.
- Tauri command tests cover the desktop export writer: it writes Markdown,
  Mermaid, and PNG files with a sanitized prefix, rejects non-folder
  destinations, and rejects invalid PNG payloads before writing artifacts.

Graph-backed Ask check:

- The Inspector now opens on `Overview` for the first loaded graph and for new
  node selections. This gives a new user immediate graph facts, evidence, and
  source context before asking them to formulate a question.
- The Ask panel renders the latest answer in a dedicated response block above
  the composer, so the submitted question and graph answer are visible without
  scrolling past the suggested-question buttons.
- The Ask panel keeps a bounded `Recent answers` trail for the current graph.
  Previous questions can be restored with their cited answer and citation chips,
  which makes the surface behave more like a lightweight code conversation.
- The Overview panel has an `Explain from graph` action for the selected node. It
  now anchors the answer to the exact selected graph node instead of re-running
  fuzzy retrieval, so `CUSTOMER` explains the copybook without blending in
  `CUSTOMER-FILE` or `BANK.CUSTOMER.MASTER`.
- Inspector tabs remain readable at the default desktop preview width, and
  duplicated relationship source controls expose section-specific labels such
  as `Depends On: show ...` and `Lineage: show ...`.
- `npm run m6:verify` includes `tools/m6-verify/ui-contract-smoke.mjs` to keep
  the Ask response block, inspector tab widths, and relationship labels covered
  by automated checks.
- `Explain LINEAGE` now returns a graph-derived, cited brief immediately, so the
  suggested-question button behaves like the other graph shortcuts even when no
  model is configured.
- The `Explain <symbol>` Ask chip follows the same exact selected-node path as
  `Explain from graph`, while typed free-form Ask questions still use fuzzy symbol
  matching.
- `Where does CUSTOMER-FILE flow?` answers from the graph, includes the
  `CUSTOMER-FILE assigned-to CUSTIN` relationship, and the selected summary
  states that `CUSTIN` resolves to `BANK.CUSTOMER.MASTER`.
- Natural phrases now anchor to graph symbols without requiring exact COBOL/JCL
  names: `customer master file` matches `BANK.CUSTOMER.MASTER`, `daily report
  dataset` matches `BANK.REPORT.DAILY`, and `report file` matches the logical
  COBOL file node `REPORT-FILE`.
- Selected-symbol overview questions such as
  `What does this program do in plain English?` use the selected graph node as
  the only focus and answer instantly from the graph.
- Typing a broader explanation question changes the submit button from `Ask` to
  `Ask AI`, while typed graph-only questions use `Ask Graph` and suggested graph
  shortcuts still run instantly without a model.
- `What does LINEAGE call?` now answers only with
  `LINEAGE executes LINK RATEAPI at src/LINEAGE.cbl:40` and
  `LINEAGE CALLS RATEAUDIT at src/LINEAGE.cbl:43` with focused citations; it
  does not include unrelated copybook, read, write, or define edges.
- `What depends on LINEAGE?` now answers with `STEP010 RUNS LINEAGE` at
  `jcl/DAILYLN.jcl:2` and keeps the citation chips scoped to the matched
  program and incoming JCL relationship.
- Matched symbol citations preserve source ranges when the graph has them, for
  example `LINEAGE (program) at src/LINEAGE.cbl:1-47`; single relationship
  sites still cite their exact source line.
- Unknown symbols such as `FROBULATOR` produce an explicit no-match graph
  answer with no citations, rather than implying unsupported evidence.
- Selecting `CUSTOMER` from search after a `LINEAGE` Ask clears the old answer,
  resets the composer, opens `Overview`, and shows `CUSTOMER` graph facts rather
  than a stale `LINEAGE` response.

Model-backed Ask check:

- `Check AI` reports `Ollama is ready on localhost with llama3.2`.
- Grounded Ask now passes the selected Rosetta language into the model system
  prompt while keeping the graph-only grounding, citation, and no-invention
  rules.
- For pronoun-style questions such as "what does this program do?", Grounded Ask
  passes the current selected graph node as the selected symbol, labels that
  symbol in the model context, and keeps its source excerpt ahead of neighboring
  excerpts.
- Model-backed Ask requires exact inline citations such as
  `(src/LINEAGE.cbl:21)` and explicitly rejects `[1]` footnote-style citations,
  so cited answers stay clickable and auditable against source lines.
- Asking `Explain LINEAGE in plain English for a new developer.` labels the
  response as an `Ollama answer with cited graph context`, increments the local
  call counter, cites `src/LINEAGE.cbl:1` plus relationship lines with exact
  inline citation text, and does not explain `LINEAGE` as a generic compiler
  concept.
- While a model-backed Ask is running, the submit button changes to `Stop`.
  Stopping the request returns a graph-cited fallback with a model note instead
  of leaving the panel in a permanent loading state.

Model-backed Summary check:

- The Summary dock bulk action now reports `4 source units` on the M6 fixture,
  covering source-backed programs, copybooks, and paragraphs rather than only
  programs.
- Generating a summary first checks model readiness. While it is running, the
  action changes to `Stop`; stopping it leaves a clear `Summary generation was
  stopped.` message and restores the `Generate Summary` action.
- Generating a `LINEAGE` summary with local Ollama cites `src/LINEAGE.cbl:1`
  plus relationship lines, avoids generic preamble text, and does not explain
  `LINEAGE` as a generic compiler concept.
- Generating a `CUSTOMER` summary cites `copybook/CUSTOMER.cpy:1` plus
  `DEFINES` relationship lines, increments the local call counter, and preserves
  model line breaks in the Summary panel.

This verifies the current UI can answer "what depends on this?" and "where does this data flow?" from the `GraphDocument` alone.
