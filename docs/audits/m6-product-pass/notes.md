# M6 Product Pass Notes

Date: 2026-06-30

## Scope

Live browser pass against the M6 fixture at `http://127.0.0.1:1430/?graph=/m6-bakeoff-graph.json`, focused on whether Summary and Ask feel coherent for the v1 goal: local, cited COBOL understanding.

## Screenshots

1. `01-overview-summary.png` - Overview with guarded Summary fallback.
2. `02-ask-empty.png` - Ask empty state and graph shortcuts.
3. `03-ask-shortcut-answer.png` - Codebase overview graph answer.
4. `04-citation-jump.png` - Citation jump into JCL relationship detail.
5. `05-typed-ask-result.png` - Broad typed Ask routed through Ollama before the patch.
6. `06-feed-ask-graph-path.png` - Patched feed-into question answered instantly from graph path.

## Findings

1. Ask status could describe the draft question rather than the displayed answer. After a graph shortcut, typing a broader question changed the header to fallback/model-unavailable language even though the visible answer was still a graph answer.
2. Typed lineage wording like "How does BANK.CUSTOMER.MASTER feed into LINEAGE?" went to Ollama, timed out, and then fell back, despite the graph already containing the DD-to-file-to-program path.
3. Ask answers read more like a report block than a conversation. The question and answer were present, but not clearly labeled.
4. Citation jumps correctly focused source and relationships, but they can move the inspector away from Ask. The Recent answers control remains important for recovery.

## Fixes In This Pass

1. Ask subtitles now derive from the displayed answer, with explicit fallback metadata for model failures.
2. Ask answer output now uses labeled Question and Answer sections.
3. Feed/lineage-style questions route to graph mode and include a bounded connection path between matched symbols.
4. UI and graph Ask smoke contracts cover the stale subtitle fix and the feed-into path.
5. Ask evidence citations now keep the Ask answer visible while focusing the graph/code on the cited source.
6. Overview now has an Ask follow-up handoff that opens Ask with the selected symbol in the prompt.

## Remaining UX Risk

Summary and Ask are still separate tabs. The patched handoff is clearer, but a future v1 pass could still consider a single "Understand" dock if the tabs continue to feel too split during larger-codebase QA.
