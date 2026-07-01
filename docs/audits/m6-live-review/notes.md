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

## Findings And Fixes

1. Browser preview exposed disabled desktop-only controls as if they were primary actions.
   Fixed by showing only the working `Open Sample` action in browser preview, with a compact note that folder open, re-scan, and scan settings run in the desktop app.

2. The Inspector opened on Summary/Overview even though Ask is the fastest way to understand the loaded graph.
   Fixed by making Ask the default inspector tab and putting graph question chips in the first visible inspector state.

3. The Summary panel mixed graph facts, model summaries, and Ask handoff under ambiguous labels.
   Fixed by renaming the tab/panel to `Overview`, labeling the bridge action `Explain in Ask`, and keeping `Generate Summary` as the explicit model-backed action.

4. The first Overview layout squeezed the heading when action buttons were present.
   Fixed by stacking the heading/subtitle above two equal-width action buttons.

5. Filter/reset behavior was checked after the fixes.
   Hiding `Data items` updated the graph orientation count and enabled Reset; Reset restored all types and disabled itself.

## Verification

- `npm run build`
- `node tools/m6-verify/ui-contract-smoke.mjs`
- `node tools/m6-verify/graph-ask-smoke.mjs`
- `npm run m6:verify`
