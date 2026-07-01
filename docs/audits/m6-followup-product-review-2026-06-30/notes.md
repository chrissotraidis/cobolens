# M6 Follow-Up Product Review

Date: 2026-06-30
Scope: Local browser demo at `http://127.0.0.1:1430/?graph=/m6-bakeoff-graph.json`.

## Steps Captured

1. Overview and AI default state
   - Health: usable, but the working small local model was not discoverable until the user clicked `Check AI`.
   - Evidence: `01-overview-ai-state.png`.

2. AI readiness with installed models
   - Health before fix: readiness found `llama3.2:1b`, but selecting a model made the installed-model chips disappear.
   - Health after fix: installed-model chips remain visible after switching models.
   - Follow-up: `Refresh models` now reads installed Ollama models without running a generation probe, and the default-width right pane no longer reports horizontal overflow.
   - Evidence: `02-ai-small-model-ready.png`, `07-patched-ai-ready.png`, `11-refresh-models-responsive.png`.

3. Summary generation
   - Health before fix: safe, but fallback copy read like internal guard/debug output.
   - Health after fix: explains that the model draft was rejected for citation issues and then presents a cited graph answer.
   - Evidence: `03-summary-generated.png`, `08-patched-summary.png`.

4. Ask initial state and graph shortcut
   - Health before fix: functional, but graph answers used system-ish labels such as `Graph answer, no model required` and `Relationships that answer this`.
   - Health after fix: answer headline and sections read more conversationally while keeping citations.
   - Evidence: `04-ask-initial.png`, `05-ask-graph-answer.png`, `09-patched-ask-graph.png`.

5. Ask AI guarded answer
   - Health before fix: safe, but fallback text centered the guard machinery.
   - Health after fix: the app states why the model text was not used and gives the cited graph answer.
   - Evidence: `06-ask-ai-result.png`, `10-patched-ask-ai.png`.

## Remaining Observations

- Default browser-width horizontal overflow in the right inspector/code area is fixed for the M6 fixture path checked in this review. Smaller mobile/tablet breakpoints still deserve a separate manual pass before calling v1 done.
- The small local Ollama model often misses the strict citation contract, so Cobolens correctly falls back to graph-cited answers. Higher-quality model behavior or a tighter response format could make the AI path feel more conversational.
- Installed Ollama models are discovered by `Refresh models`, `Check AI`, or model-call readiness. The app still avoids surprise background local probes on initial load.
