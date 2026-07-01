# M6 product review pass - 2026-06-30

Live target: `http://127.0.0.1:1430/?graph=/m6-bakeoff-graph.json`

Screenshots:

- `screenshots/01-current-ask.png` - Ask answer before the pass; composer was below answer/evidence.
- `screenshots/02-ask-followup-composer-top.png` - Summary `Ask follow-up` after the composer was moved above the answer.

Checks performed:

- Summary `Ask follow-up` opens Ask, seeds `Explain LINEAGE in plain English.`, clears stale answers, and focuses the composer.
- Graph shortcut `What does this program do in plain English?` returns an instant cited graph answer with no model call.
- Ask evidence citation for `LINEAGE COPIES CUSTOMER` jumps the code pane to `src/LINEAGE.cbl:11` while keeping Ask visible.
- Links tab still opens the relationship browser, and relationship source-line buttons still open relationship details.
- Legend filters and Reset work.
- Symbol search focuses the chosen node and clears results.
- `Check AI` reports a local Ollama timeout clearly when the configured model does not finish the quick generation probe.
- Browser console had no warnings or errors during the pass.

Fixes made:

- Moved the Ask composer above the answer/evidence block so the user can keep talking while reading the current answer.
- Preserved the Ask tab when Ask evidence citations select a cited relationship edge.
- Added explicit ARIA labels to search result buttons to distinguish them from similarly named codebase-tree buttons.
