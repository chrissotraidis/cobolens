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
- 2 programs
- 2 copybooks
- 1 JCL step

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

Parse-health checks:

- The normal M6 fixture shows `4/4 parsed` and `No parse warnings` in the left
  navigator.
- Loading a minimal warning graph through the `?graph=` URL shows `1/3 parsed`
  and lists file/reason rows such as `bad/UNSUPPORTED.cbl` with
  `unsupported preprocessor directive near line 12`.

Legend/filter checks:

- The left-nav legend renders enabled checkbox filters for graph node types.
- Turning `Copybooks` off changes the graph orientation from `11 visible`,
  `26 indexed`, `0 hidden` to `9 visible`, `26 indexed`, `2 hidden`; turning it
  back on restores the original counts.

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
- In the browser preview those controls stay disabled because the preview is a
  fixed prebuilt graph JSON. `Re-scan` is disabled there too, so browser users
  are not offered a scan action that cannot touch a local folder.

Relationship-click check:

- Clicking `COPIES src/LINEAGE.cbl:11` from `LINEAGE` scrolls the inspector to
  the `Relationship` detail, shows `LINEAGE COPIES CUSTOMER`, and highlights
  `COPY CUSTOMER.` at `src/LINEAGE.cbl:11` in the code pane.

Export check:

- Clicking `Export Docs` in the browser demo reports the concrete generated
  artifact names: `cobolens-lineage.md`, `cobolens-lineage.mmd`, and
  `cobolens-lineage.png`.
- After navigating to `CUSTOMER`, clicking `Export Docs` reports
  `cobolens-customer.md`, `cobolens-customer.mmd`, and
  `cobolens-customer.png`.

Graph-backed Ask check:

- The Ask panel renders the latest answer in a dedicated response block above
  the composer, so the submitted question and graph answer are visible without
  scrolling past the suggested-question buttons.
- Inspector tabs remain readable at the default desktop preview width, and
  duplicated relationship source controls expose section-specific labels such
  as `Depends On: show ...` and `Lineage: show ...`.
- `AI explain LINEAGE` now submits an AI-backed explanation request directly, so
  the suggested-question button behaves like the other Ask shortcuts instead of
  looking like a dead control.
- `Where does CUSTOMER-FILE flow?` answers from the graph, includes the
  `CUSTOMER-FILE assigned-to CUSTIN` relationship, and the selected summary
  states that `CUSTIN` resolves to `BANK.CUSTOMER.MASTER`.
- Natural phrases now anchor to graph symbols without requiring exact COBOL/JCL
  names: `customer master file` matches `BANK.CUSTOMER.MASTER`, `daily report
  dataset` matches `BANK.REPORT.DAILY`, and `report file` matches the logical
  COBOL file node `REPORT-FILE`.
- Typing a broader explanation question changes the submit button from `Ask` to
  `Ask AI`, while graph-only questions keep the normal `Ask` label.
- `What does LINEAGE call?` now answers only with
  `LINEAGE executes LINK RATEAPI at src/LINEAGE.cbl:40` and
  `LINEAGE CALLS RATEAUDIT at src/LINEAGE.cbl:43` with focused citations; it
  does not include unrelated copybook, read, write, or define edges.
- `What depends on LINEAGE?` now answers with `STEP010 RUNS LINEAGE` at
  `jcl/DAILYLN.jcl:2` and keeps the citation chips scoped to the matched
  program and incoming JCL relationship.
- Selecting `CUSTOMER` from search after a `LINEAGE` Ask clears the old answer,
  resets the composer, and shows `CUSTOMER` suggested questions instead of a
  stale `LINEAGE` response.

Model-backed Ask check:

- `Check AI` reports `Ollama is ready on localhost with llama3.2`.
- Grounded Ask now passes the selected Rosetta language into the model system
  prompt while keeping the graph-only grounding, citation, and no-invention
  rules.
- Asking `Explain LINEAGE in plain English for a new developer.` labels the
  response as an `Ollama answer with cited graph context`, increments the local
  call counter, cites `src/LINEAGE.cbl:1` plus relationship lines, and does not
  explain `LINEAGE` as a generic compiler concept.
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
