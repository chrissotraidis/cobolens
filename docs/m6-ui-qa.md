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
- `CUSTIN` showed `BANK.CUSTOMER.MASTER` under Depends On and `STEP010` under Used By.

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

Scan settings check:

- The Ingest pane now exposes scan format, extension, and encoding controls for
  the desktop scan path.
- In the browser preview those controls and `Re-scan` are disabled because the
  preview is a fixed prebuilt graph JSON, not a live folder scan.

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

- `Explain LINEAGE` now submits an AI-backed explanation request directly, so
  the suggested-question button behaves like the other Ask shortcuts instead of
  looking like a dead control.
- Typing a broader explanation question changes the submit button from `Ask` to
  `Ask AI`, while graph-only questions keep the normal `Ask` label.
- `What does LINEAGE call?` now answers only with
  `LINEAGE executes LINK RATEAPI at src/LINEAGE.cbl:40` and focused citations;
  it does not include unrelated copybook, read, write, or define edges.
- `What depends on LINEAGE?` now answers with `STEP010 RUNS LINEAGE` at
  `jcl/DAILYLN.jcl:2` and keeps the citation chips scoped to the matched
  program and incoming JCL relationship.
- Selecting `CUSTOMER` from search after a `LINEAGE` Ask clears the old answer,
  resets the composer, and shows `CUSTOMER` suggested questions instead of a
  stale `LINEAGE` response.

Model-backed Ask check:

- `Check AI` reports `Ollama is ready on localhost with llama3.2`.
- Asking `Explain LINEAGE in plain English for a new developer.` labels the
  response as an `Ollama answer with cited graph context`, increments the local
  call counter, cites `src/LINEAGE.cbl:1` plus relationship lines, and does not
  explain `LINEAGE` as a generic compiler concept.

Model-backed Summary check:

- Generating a `LINEAGE` summary with local Ollama cites `src/LINEAGE.cbl:1`
  plus relationship lines, avoids generic preamble text, and does not explain
  `LINEAGE` as a generic compiler concept.
- Generating a `CUSTOMER` summary cites `copybook/CUSTOMER.cpy:1` plus
  `DEFINES` relationship lines, increments the local call counter, and preserves
  model line breaks in the Summary panel.

This verifies the current UI can answer "what depends on this?" and "where does this data flow?" from the `GraphDocument` alone.
