# M6 Live UI Review

Date: 2026-06-30

## Scope

Reviewed the current in-app browser preview at `http://127.0.0.1:1430/?graph=/m6-bakeoff-graph.json`, focused on the first-run graph, left navigator controls, Inspector Ask/Overview flow, citation jumps, and filter/reset behavior.

## Evidence

- `01-start.png`: initial state before edits.
- `03-ask-answer.png`: graph-backed Ask preset answer.
- `04-citation-jump.png`: clicked Ask citation jumps source pane to the cited line.
- `07-overview.png`: first Overview pass revealed cramped header/actions.
- `09-overview-layout-fixed.png`: fixed Overview layout.
- `10-browser-preview-left-panel.png`: browser preview Ingest panel after removing disabled desktop controls.
- Current follow-up screenshots were captured in the Codex attachment audit folder:
  `08-after-overview-default.png`, `09-search-result-overview.png`,
  `11-explain-selected-exact.png`, `12-explain-chip-exact.png`, and
  `13-filter-reset.png`.

## Findings And Fixes

1. Browser preview exposed disabled desktop-only controls as if they were primary actions.
   Fixed by showing only the working `Open Sample` action in browser preview, with a compact note that folder open, re-scan, and scan settings run in the desktop app.

2. The Inspector previously opened on Ask because it was the fastest way to query
   the graph, but a fresh v1 pass showed that first-time users need the factual
   Overview first. Fixed by opening loaded/selected symbols on `Overview`, while
   keeping `Ask` one click away as the conversational follow-up.

3. The Summary panel mixed graph facts, model summaries, and Ask handoff under ambiguous labels.
   Fixed by renaming the tab/panel to `Overview`, labeling the bridge action `Explain in Ask`, and keeping `Generate Summary` as the explicit model-backed action.

4. The first Overview layout squeezed the heading when action buttons were present.
   Fixed by stacking the heading/subtitle above two equal-width action buttons.

5. Filter/reset behavior was checked after the fixes.
   Hiding `Data items` updated the graph orientation count and enabled Reset; Reset restored all types and disabled itself.

6. `Explain in Ask` and the `Explain <symbol>` Ask chip were using fuzzy
   retrieval, so `CUSTOMER` could blend the copybook with similarly named
   datasets/files. Fixed by anchoring those preset explanation actions to the
   currently selected graph node and generating a cited graph answer directly.

## Verification

- `npm run build`
- `node tools/m6-verify/ui-contract-smoke.mjs`
- `node tools/m6-verify/graph-ask-smoke.mjs`
- `npm run m6:verify`
