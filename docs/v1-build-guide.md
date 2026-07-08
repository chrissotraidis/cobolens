# Cobolens v1 — Build Guide for the Next Implementation Pass

Date: 2026-07-06. Basis: full read of AGENTS.md, docs/AGENTS.md, PRD.md, docs/COBOL-Lens-PRD.md, README.md, docs/v1-readiness-audit.md, docs/m6-ui-qa.md; inspection of src/App.tsx, src/App.css, src/graph/GraphView.tsx, src/model/*, src/retrieval/*, src-tauri/src/lib.rs, tools/local-model/*, tools/m6-verify/*; live verification of the browser preview (Vite on 127.0.0.1:1421, fixture graph); `npm run build` (pass), `npm run ollama:check` (CLI installed, HTTP unreachable), `npm run m6:verify` (fails at "Tauri shell tests" with `resource path 'binaries' doesn't exist`).

Honesty note on verification coverage: the desktop GUI was **not** launched on this machine. `npm run tauri dev` on a fresh checkout fails before reaching a window (see P0-2), and that failure chain was verified via the cargo build output and `tauri.conf.json`, not by working around it. Everything labeled "verified live" below was verified in the browser preview.

---

## STATUS — updated 2026-07-06 after a fix pass

A follow-up pass squashed the bounded bugs below. Section 2 tags each item
**[FIXED]**, **[PARTIAL]**, or **[OPEN]**; the design/IA/wiring sections (3-5)
and the larger slices (6) remain forward-looking.

**Fixed and verified** (13 bugs, plus 2 found while verifying):

- BUG-1 [FIXED] browser demo `Open Sample` — committed `public/m6-bakeoff-graph.json`; un-ignored in `.gitignore`; error names the regen command.
- BUG-2 [FIXED] `resource path 'binaries' doesn't exist` — `src-tauri/binaries/.gitkeep` tracked, `.gitignore` ignores only built binaries, packaging script no longer wipes the dir. `cargo test` 17/17; `npm run m6:verify` 23/23 end-to-end from clean clone.
- BUG-3 [FIXED] embedding model — `embeddingModel` (default `nomic-embed-text`) added to `ModelSettings`, wired through `embedTexts`, the index key, settings migration, and a Settings field.
- BUG-4 [FIXED] Ask and summary streaming — both now stream draft text through `streamText`, use a first-token timeout, and guard final cited output.
- BUG-5 [FIXED] export feedback — dismissable top-right toast, verified at top=54/right=16.
- BUG-6 [FIXED] truncation — inspector tabs wrap (verified "Dependencies 11" full at 1100px); Sigma `stagePadding` 68 -> 96 stops edge-label clipping.
- BUG-7 [FIXED] left rail hierarchy — export status moved to a toast; navigation stays primary and status/filter blocks are secondary accordions.
- BUG-8 [OPEN] source browser — remains Slice 3.
- BUG-9 [FIXED] `Check AI` states — readiness and fetch-failure copy now name `ollama serve`; `ollama:check` probes embeddings separately.
- BUG-10 [FIXED] AI-setup hierarchy — full-width "Set up AI first" replaced by a quiet link; bulk summarize hidden until AI configured.
- BUG-11 [PARTIAL] QA overstatement — docs now flag the grep-based smokes as contract-level; a driven-browser smoke is tracked in docs/tech-debt.md (still open).
- BUG-12 [FIXED] host field — stores/display the bare origin; saved `.../api` migrates on load.

**Two additional bugs found while verifying the local-AI path (both fixed):**

- NEW-1 [FIXED] readiness probe failed thinking models — `num_predict: 24` was consumed by reasoning before any visible text (reproduced with `gemma4:12b-mlx`: `done_reason:"length"`, empty response). Raised to 160 in both probes.
- NEW-2 [FIXED] Ask used the raw completion API — switched `providers.ts` to the chat API and raised local token budgets (ask 260->512, summary 260->384). Verified end to end: a real local model returned an accepted, inline-cited answer instead of the guard fallback.

**Deliberately not done** (feature-scale, tracked as debt/slices): full-file source browser, source-chunk semantic indexing, and desktop Ollama install-vs-running detection. See `docs/tech-debt.md`.

Verification after the pass: `npm run build` pass; `npm run m6:verify` 23/23; `cargo test` 17/17; live browser checks plus a real Ollama matrix (server stopped, model missing -> recovery chips, embeddings missing -> visible note, full cited generation). The temporary Ollama server used for the generation check was stopped afterward.

---

## 1. Executive Diagnosis

> Note (2026-07-06): this diagnosis records the state **before** the fix pass.
> Items 1, 2, 3, 6 (its "Check AI" half), and 7 are now fixed or reduced; items
> 4 (source browser), part of 4's layout, and 5 (local model flow, now unblocked
> with Ask/summary streaming but desktop CLI-detect work still open) remain. See the STATUS banner above and the per-bug tags in
> section 2.

The core engine is real: the Rust sidecar produces a solid `GraphDocument`, graph Ask answers with correct citations (verified live: "What depends on LINEAGE?" → `STEP010 RUNS LINEAGE at jcl/DAILYLN.jcl:2`), citation clicks jump source correctly, and export produces the three artifacts. The product around that engine is what fails a real user. In priority order:

1. **Both first-run paths fail on a fresh clone.** Browser: "Open Sample" fetches `/m6-bakeoff-graph.json` (src/App.tsx:450), which is gitignored (.gitignore:14) and only exists after `npm run m6:fixture-graph`. Desktop: README's first command `npm run tauri dev` (README.md:100) fails because `tauri.conf.json` declares `binaries/` as a bundled resource but `src-tauri/binaries/` is gitignored (.gitignore:17) and only created by `npm run build:sidecar`. A new user cannot start the app either way by following the README top-to-bottom.
2. **The release gate itself fails on a fresh checkout.** `npm run m6:verify` — documented as the main verification suite (README.md:211-213) — dies at "Tauri shell tests" with `resource path 'binaries' doesn't exist`, for the same reason as above. The readiness audit cites this suite as evidence while it does not pass from a clean clone.
3. **Local AI has no complete product flow.** There is no embedding-model concept: `embedTexts` defaults the embedding model to the *generation* model (src/model/embeddings.ts:29, called without a model at src/App.tsx:893-900). Semantic retrieval failures are silently swallowed (`.catch(() => [])`, src/retrieval/context.ts:35), so with Ollama down — the current state of this machine — "semantic" Ask degrades invisibly. `Check AI` with the server stopped says "Start Ollama or check the host" (src/model/readiness.ts:49) but never says `ollama serve`, never distinguishes not-installed from stopped, and never checks embeddings at all (tools/local-model/ollama-smoke.mjs tests generation only).
4. **AI answers now stream, but source retrieval is still graph-only.** Ask and summaries now stream draft text through `streamText` with first-token timeout and guarded final output. The remaining Slice 5 work is source-chunk semantic indexing plus clearer retrieval status.
5. **Source browsing is a 15-line snippet viewer.** `read_source_snippet` returns ±8 lines around a target (src-tauri/src/lib.rs:305-307; browser mirror src/App.tsx:3186-3187; verified live: 15 `.source-line` elements, no way to scroll beyond). There is no full-file view, no file-level tree (the "Codebase" browser lists graph units, not files), no syntax highlighting. This cannot support "the first hour with an unfamiliar system."
6. **The layout leaks at every seam.** Verified live at 1100×800: left rail content is 1861px tall in an 852px pane (8 stacked blocks); search results, the "Dependenc… 11" tab, the composer draft, and graph node labels (`LINK RATEAPI`) all truncate or clip; export feedback renders at y≈1575 — off-screen at the bottom of the left rail (src/App.tsx:1325) while the Export button lives in the top-right.
7. **"AI is optional" is contradicted by the UI.** The widest, most prominent button on the default Overview tab is "Set up AI first" (src/App.tsx:2104-2120), plus a second "Set up AI for summaries" at the bottom (src/App.tsx:2156). The graph-first story the PRD tells is not the visual hierarchy the app shows.
8. **QA claims overstate the live experience.** The "UI contract smoke" and "accessibility smoke" are source-string greps over App.tsx/App.css (tools/m6-verify/ui-contract-smoke.mjs:6-9 reads files and checks `includes(...)`), not driven-browser tests. docs/v1-readiness-audit.md marks FRs "Evidenced" partly on that basis, and lists `npm run m6:verify` as an evidence command while it fails from a clean clone.

---

## 2. Major Bug And UX Audit

### BUG-1 — Browser demo "Open Sample" 404s on fresh clone — **P0** — **[FIXED 2026-07-06]**
- **Repro:** Fresh clone → `npm install` → `npm run dev` → open the app → click "Open Sample" (the primary first-run CTA in both the empty-graph card and the Ingest pane).
- **Expected:** Sample graph loads.
- **Actual:** `Could not load browser demo graph (404).` — `public/m6-bakeoff-graph.json` is gitignored (.gitignore:14) and only produced by `npm run m6:fixture-graph`. (`public/m6-bakeoff-source.json` *is* committed, making the asymmetry easy to miss.)
- **Files:** src/App.tsx:440-459 (`openSample` browser branch), .gitignore:14, tools/m6-bakeoff/export-fixture-graph.mjs, README.md:104-116.
- **Why it matters:** The single most-promoted button in the first-run experience fails for anyone who didn't read the "browser demo" section of the README first. It also silently biases all QA toward machines where the fixture was already generated.
- **Fix shape:** Either commit a small pre-generated demo graph under a non-ignored name (e.g. `public/demo-graph.json`, regenerated by CI when the fixture changes), or make `npm run dev` depend on a `predev` step that generates it, or have `openSample` fall back to generating a helpful error with the exact command to run. Committing the artifact is the smallest honest fix.
- **Verify:** `git clean -xfd public && npm run dev` → click Open Sample → graph loads. Add a check to m6:verify that the demo asset exists in the git index.

### BUG-2 — Desktop dev and Tauri tests fail on fresh clone: `resource path 'binaries' doesn't exist` — **P0** — **[FIXED 2026-07-06]**
- **Repro:** Fresh clone → `npm install` → `npm run tauri dev` (README Quick Start's first run command), or `npm run m6:verify`.
- **Expected:** Dev shell launches (dev mode already has a fallback path to the sidecar's debug binary at src-tauri/src/lib.rs:628-639); verify suite completes.
- **Actual:** tauri-build's resource step aborts compilation because `tauri.conf.json` `bundle.resources` maps `"binaries/": "binaries/"` and `src-tauri/binaries/` is gitignored (.gitignore:17), created only by tools/packaging/prepare-sidecar-resource.mjs (`npm run build:sidecar`). Confirmed in this checkout: m6:verify passes 15+ checks then fails at "Tauri shell tests" with exactly `resource path 'binaries' doesn't exist`.
- **Files:** src-tauri/tauri.conf.json (bundle.resources), tools/packaging/prepare-sidecar-resource.mjs, package.json scripts (`tauri:before-build` runs the sidecar build only for *release* builds), tools/m6-verify/run.mjs ("Tauri shell tests" entry), README.md:97-101.
- **Why it matters:** The documented desktop path and the documented release gate both fail out of the box. This is also the direct cause of the user-reported m6:verify failure.
- **Fix shape (choose one, keep it boring):** (a) have `prepare-sidecar-resource.mjs` (or a tiny `predev`/pretest step) create `src-tauri/binaries/` with a `.gitkeep`-style placeholder plus build the debug sidecar; (b) commit an empty `src-tauri/binaries/.gitkeep` and un-ignore the directory (ignore only the binary), since Tauri only needs the *path* to exist at compile time while runtime resolution already falls back to the debug sidecar; (c) make m6:verify's Tauri test step run `build:sidecar` first. Option (b) + a note in README is the smallest change; pair it with README ordering `npm run build:sidecar` before `npm run tauri dev`.
- **Verify:** `git clean -xfd src-tauri/binaries && cargo test --manifest-path src-tauri/Cargo.toml` compiles; `npm run m6:verify` completes end-to-end on a fresh clone.

### BUG-3 — No embedding-model setting; generation model silently used for embeddings — **P0 (product), bounded** — **[FIXED 2026-07-06]**
- **Repro:** Configure Ollama with `llama3.2` (the default), have Ollama running, ask a non-graph question ("Explain the business logic in LINEAGE…"). `semanticSearchGraph` calls `embedTexts({ settings, texts })` with no `model` (src/App.tsx:893-900), so `embedTexts` embeds with `llama3.2` (src/model/embeddings.ts:29 `model || settings.model`).
- **Expected:** A dedicated embedding model (e.g. `nomic-embed-text`), with its own readiness check and its own "not installed" guidance; retrieval quality that reflects an embedding-tuned model.
- **Actual:** Generation model doubles as embedding model. If embedding fails (model missing, server down, non-embedding model), `retrieveQuestionContext` swallows the error (`.catch(() => [])`, src/retrieval/context.ts:35) and the prompt says "Semantic vector matches: - None" — the user can never tell whether semantic retrieval ran, failed, or was skipped. Neither `Check AI` (src/App.tsx:694-715), `ollama:check` (tools/local-model/ollama-smoke.mjs), nor Settings mention embeddings.
- **Files:** src/model/embeddings.ts:21-56, src/App.tsx:893-900, src/retrieval/context.ts:35, src/model/config.ts (no `embeddingModel` field), tools/local-model/ollama-smoke.mjs.
- **Why it matters:** This is the difference between "local AI is wired" and "local AI happens to emit vectors." Retrieval quality with a chat model's embeddings is poor, and the silent-degrade path means nobody will ever file a bug — it just feels dumb.
- **Fix shape:** Add `embeddingModel` to `ModelSettings` (default `nomic-embed-text`), thread it through `embedTexts` and `semanticGraphIndexKey`, add an embeddings probe to `inspectOllamaReadiness` and `ollama-smoke.mjs` (POST `/api/embed` with a one-word input), and surface a visible "semantic search unavailable: <reason>" note in the Ask answer metadata instead of swallowing.
- **Verify:** Extend tools/m6-verify/model-readiness-smoke.mjs and embedding-privacy-smoke.mjs; manual matrix rows "generation ready / embedding missing" below.

### BUG-4 — Ask/summary responses do not stream; whole-call timeout — **P1** — **[FIXED 2026-07-07]**
- **Repro:** Working Ollama on CPU, ask any AI-routed question.
- **Expected:** Tokens appear as generated; Stop cancels mid-stream; slow models still feel alive.
- **Actual:** Fixed. Ask now streams draft text in the Chat answer card, summaries stream draft text in the Summary panel, and both guard final text before evidence/final summary output is trusted.
- **Files:** `src/model/chat.ts`, `src/model/summaries.ts`, `src/model/modelRuntime.ts`, `src/App.tsx`, `src/inspector/ChatAnswerPanel.tsx`, `src/inspector/SummaryDock.tsx`.
- **Why it matters:** Local-first + CPU inference makes streaming a functional requirement, not polish. The app now feels alive during model output instead of waiting for a whole completion.
- **Fix shape:** Done with shared first-token timeout plumbing, streamed draft rendering, Stop via the existing abort controller, and final citation guard semantics.
- **Verify:** `tools/m6-verify/model-chat-contract-smoke.mjs` covers Ask streaming; `tools/m6-verify/summary-prompt-smoke.mjs` and `tools/m6-verify/ui-contract-smoke.mjs` cover summary streaming.

### BUG-5 — Export feedback is invisible — **P1 (verified live)** — **[FIXED 2026-07-06]**
- **Repro:** Load sample at 1440×900, click "Export" in the top bar.
- **Expected:** Visible confirmation near the action: what was written, where, with a way to open it.
- **Actual:** Files download, but the status string renders as the *last* block of the scrollable left rail (src/App.tsx:1325) — measured at y=1575 in a 900px viewport, off-screen. The only other surfacing is the Export button's hover `title` (src/App.tsx:1181).
- **Files:** src/App.tsx:1181, 1325; src/App.css (export-status).
- **Why it matters:** Users will click Export repeatedly, think it's broken, and get triple downloads.
- **Fix shape:** Show the status as a transient toast/inline confirmation anchored to the top bar (or a small popover under the Export button) with the artifact names; keep a copy in the rail if desired.
- **Verify:** Manual browser + a UI-contract check that export status is rendered within the top-bar region; both browser (download) and desktop (folder write) paths.

### BUG-6 — Truncation cluster in top bar, tabs, search results, and graph labels — **P1 (verified live at 1100×800; visible at 1440 too)** — **[FIXED for tabs + graph labels 2026-07-06; top-bar priority-collapse still open]**
- **Repro:** Load the sample at ≤1200px width (the desktop window minimum is 960, src-tauri/tauri.conf.json `minWidth`).
- **Expected:** No control label is ever ellipsized into ambiguity; panes shed content deliberately (responsive rules), not by clipping.
- **Actual:** "Dependencies" tab renders "Dependenc… 11"; breadcrumb crumb capped at 190px and mode indicator at 138px with ellipsis (src/App.css:212-229); left-rail search results ellipsize ("BANK.CUSTO…"); graph node label `LINK RATEAPI` clips at the canvas edge; the composer's drafted question is cut off visually.
- **Files:** src/App.css:159 (topbar grid), 212-229, 320/327 (shell grid `248px minmax(340px,1fr) minmax(420px,38vw)`), 887-893 (tab min-width vs ellipsis); src/graph/GraphView.tsx:105-122 (Sigma label settings, stagePadding).
- **Why it matters:** A dense professional tool must never make the user guess what a control says. Truncated tab names and symbol names are exactly the names the user came to read (mainframe dataset names are long by nature).
- **Fix shape:** Rework the top bar to a two-tier or priority-collapse layout (brand + search + actions; focus/mode as a second row or moved into panes); give tabs icon+full-label with a minimum pane width instead of ellipsis; let search results wrap to two lines with the full name; increase Sigma `stagePadding` / camera ratio so focus-slice labels fit.
- **Verify:** Screenshot pass at 960/1100/1280/1440; a CSS-level check that `.inspector-tabs button` and `.search-results` names don't use `text-overflow: ellipsis` for primary labels.

### BUG-7 — Left rail is an 1861px stack of eight blocks — **P1 (verified live)** — **[FIXED 2026-07-07]**
- **Repro:** Load sample; inspect `.left-pane` scroll metrics (measured 1861px content in 852px).
- **Expected:** Navigation (Codebase browser, search results) reachable without scrolling; status (Inventory, Parse Health, Graph Hints) available but not competing.
- **Actual:** Fixed. The rail now leads with project/search/codebase navigation, then groups Legend & Filters, Inventory, Parse Health, and Graph Hints in secondary accordions.
- **Files:** `src/navigator/NavigatorRail.tsx`, `src/navigator/NavigatorPanels.tsx`, `src/App.css`.
- **Why it matters:** This is the "overloaded rail" problem the PRD explicitly warns about (docs/COBOL-Lens-PRD.md:98-109 says navigation and status only — but it's all stacked as equals).
- **Fix shape:** Done with a primary navigation zone and a secondary status/filter zone. The graph filters still live in the rail for now, but collapsed under the secondary group instead of competing with navigation.
- **Verify:** Rendered/UI/accessibility smokes cover the closed status accordions and opening Legend & Filters.

### BUG-8 — Source viewing is a fixed ±8-line snippet — **P1** — **[OPEN — Slice 3]**
- **Repro:** Select any node; try to read the whole file, or scroll past the snippet.
- **Expected:** A real file reader: full file scroll, the cited line highlighted and centered, line numbers, at least basic COBOL keyword highlighting, and next/previous citation navigation.
- **Actual:** Desktop `read_source_snippet` returns a bounded window around the target line; the browser mirror in `src/lib/sourceReader.ts` does the same. Verified live: snippet rendering ends at the returned window. Source is now the center workspace view, but it is still a snippet reader rather than a full-file browser.
- **Files:** src-tauri/src/lib.rs (`read_source_snippet`), src/lib/sourceReader.ts (browser mirror), src/workspace/WorkspacePane.tsx (center Source surface), src/source/CodeSnippet.tsx (snippet rendering), src/App.css (code-panel sizing).
- **Why it matters:** This is problem #5 in the user report and the README's own roadmap item #2. Understanding COBOL requires reading whole paragraphs and DATA DIVISION context, not 15-line keyholes.
- **Fix shape:** Add a `read_source_file` Tauri command (windowed: return the full file up to a size cap, or paged ranges), render a virtualized full-file view in the code panel with the citation line highlighted; keep the snippet API for excerpt/AI use. File-level entries in the Codebase tree open the file at line 1.
- **Verify:** New Tauri test for `read_source_file` bounds/encoding; manual: open `src/LINEAGE.cbl`, scroll whole file, citation still centers and highlights; large-file cap behavior on a >16MB file.

### BUG-9 — `Check AI` error states don't lead the user anywhere — **P1 (verified live)** — **[PARTIAL — stepper fixed; desktop CLI-detect open]**
- **Repro:** Ollama CLI installed but server stopped (this machine's state). Settings → Check AI.
- **Expected:** State-specific guidance: "Ollama is installed but not running — run `ollama serve` (or open the Ollama app)", distinct from "not installed → install link" and "running but model missing → `ollama pull …` with one-click model chips."
- **Actual:** Partial. Settings now shows a compact readiness stepper for install/serve, generation model, embedding model, and final test states. The app still cannot distinguish "Ollama not installed" from "installed but stopped" because it only reaches Ollama through HTTP; the desktop shell has no CLI-detect command yet.
- **Files:** `src/settings/SettingsDialog.tsx`, `src/model/readiness.ts`, `src-tauri/src/lib.rs` (no ollama-detect command).
- **Why it matters:** This is the "no clear offline AI setup path" complaint. The information exists in the repo's tooling but not in the product.
- **Fix shape:** Desktop: add a small Tauri command that checks for the `ollama` binary (`which ollama`) so the first step can distinguish not-installed vs stopped. Browser stays HTTP-only.
- **Verify:** Manual matrix rows (no CLI / CLI+stopped / running+no model / model+no embed / all green); extend model-readiness-smoke for the new desktop-only state if the command lands.

### BUG-10 — Overview's primary CTA is AI setup, contradicting graph-first positioning — **P2 (verified live)** — **[FIXED 2026-07-06]**
- **Repro:** Load sample; look at the default Overview tab.
- **Expected:** Primary emphasis on graph facts, evidence, View source, Ask — with AI as a quiet tertiary action, per PRD principle 6.
- **Actual:** "Set up AI first" is the full-width, visually loudest button (src/App.tsx:2104-2120 `summary-wide-action`), and the panel footer adds "Set up AI for summaries" (src/App.tsx:2156). Two AI-setup CTAs on the default view of an "AI optional" product.
- **Fix shape:** Demote unconfigured-AI actions to a single quiet link ("AI summary available after setup →"); when AI *is* configured, promote "Generate AI summary" to normal weight. Keep "Summarize all" inside Settings' usage card or an overflow menu — bulk cost belongs near the estimate.
- **Verify:** Screenshot review; ui-contract check that only one AI-setup entry point renders in Overview.

### BUG-11 — QA suite presents source greps as UI/accessibility evidence — **P2 (process bug, bounded)** — **[PARTIAL — docs corrected 2026-07-06; core-loop rendered UI smoke added 2026-07-07; brittle source checks remain, see docs/tech-debt.md]**
- **Repro:** Read tools/m6-verify/ui-contract-smoke.mjs (reads App.tsx/App.css as text, asserts `includes(...)` — 4 `includes(` composites in the head alone) and accessibility-smoke.mjs (same pattern); compare docs/v1-readiness-audit.md rows FR-13…FR-24 marked "Evidenced" citing these smokes plus manually recorded notes in docs/m6-ui-qa.md.
- **Expected:** Claims labeled as what they are: static contract checks + one-time manual QA notes, not automated UI verification. Ideally one thin driven-browser smoke (Playwright or the existing preview harness) for load-sample → search → focus → citation-jump → export.
- **Actual:** README calls m6:verify a "verification suite" covering "UI contract smoke" and "accessibility smoke" (README.md:231-247); v1-readiness-audit lists `npm run m6:verify` as evidence command #1 while it fails from a clean clone (BUG-2).
- **Fix shape:** (a) Rename/annotate the smokes ("source contract check") in run.mjs output and docs; (b) add one real browser smoke for the core loop; (c) re-run the readiness audit after BUG-1/2 land and downgrade any row whose evidence was grep-only.
- **Verify:** Docs diff review; new browser smoke green in CI.

### BUG-12 — Ollama Host field default exposes `/api` and disagrees with tooling — **P2** — **[FIXED 2026-07-06]**
- **Repro:** Settings → Host shows `http://127.0.0.1:11434/api` (src/model/config.ts:29); `ollama:check` uses `http://127.0.0.1:11434` (ollama-smoke.mjs:7); README says the same base URL without `/api`.
- **Actual:** `normalizeOllamaBaseUrl` appends `/api` regardless (src/model/privacy.ts:12-15), so the `/api` suffix in the field is redundant noise a user can plausibly break (e.g. pasting `http://127.0.0.1:11434` "fixes" nothing, pasting `.../api/api`— actually normalize handles trailing, not doubled). Cosmetic but it's the only URL a novice sees.
- **Fix shape:** Store and display the bare origin (`http://127.0.0.1:11434`), append `/api` only in the client layer; migrate saved settings on load.
- **Verify:** model-privacy-smoke + settings round-trip test.

### NEW-1 — Readiness generation probe falsely fails thinking-capable local models — **P1** — **[FIXED 2026-07-06]**
- **Found while:** running the E7 "all green" matrix row against a real local Ollama.
- **Repro (pre-fix):** configure a thinking-capable model (reproduced with `gemma4:12b-mlx`), Settings -> Check AI.
- **Expected:** "generation returned text".
- **Actual:** "Ollama generation returned no text". The probe capped output at `num_predict: 24`, which the model consumed entirely on hidden reasoning before emitting any visible text (`done_reason: "length"`, empty `response`); raising the cap to 160 produced "Local inference is ready."
- **Files:** src/model/readiness.ts (generation probe body), tools/local-model/ollama-smoke.mjs.
- **Fix applied:** `num_predict` 24 -> 160 in both probes, documented as a cap not a target. Interim heuristic; see NEW-2 and BUG-4 for the streaming follow-up.

### NEW-2 — Model-backed Ask used the raw completion API, breaking chat/thinking models — **P1** — **[FIXED 2026-07-06]**
- **Found while:** the first real model-backed Ask fell back to the graph with "model answer had no exact source citations".
- **Repro (pre-fix):** with a working local chat model, ask an AI-routed question ("Explain the business logic in LINEAGE for a new developer").
- **Expected:** an accepted, inline-cited model answer.
- **Actual:** `providers.ts` built the model via `ollama.completion(model)`, which bypasses the chat template so a thinking model's reasoning leaked into `text` and the citation guard rejected it. Switching to the chat API (`ollama(model)`) plus larger local budgets (ask 260 -> 512, summary 260 -> 384) produced an accepted answer citing `src/LINEAGE.cbl:21`, `:6`, `:40`, `:43` inline.
- **Files:** src/model/providers.ts, src/model/chat.ts, src/model/summaries.ts, and the two contract smokes asserting the budget constants.
- **Why it matters:** Every modern local chat/thinking model would have fallen to the graph path, making "AI Ask" look permanently broken on exactly the models users install today.
- **Note:** This is a correctness fix, not the streaming work; BUG-4 (streaming) still stands.

Also observed, not itemized: the graph focus toolbar's "Focus complete" disabled button reads as broken UI even with its tooltip (src/App.tsx:242-247); the `is-ask-focused` shell class changes grid proportions when switching to Ask (src/App.tsx:1214), which makes panes jump; Ask auto-refocuses the graph to the first matched node on every answer (src/App.tsx:909-911), discarding the user's expansion state (`focusOnNode` clears `expandedNodeIds`, src/App.tsx:554). The last three are captured in docs/tech-debt.md.

---

## 3. Product And Design Philosophy

Cobolens is a **workbench**, not a dashboard. The user is a professional under time pressure trying to build a mental model of a hostile codebase. Every design decision should answer: *does this help the user trust an answer about code they didn't write?*

**First-run / open-project.** The app's first screen is about the *project*, not the app. One decision: "Open a COBOL folder" (desktop) or "Explore the sample". Nothing else competes — no AI mention beyond a single quiet line, no inspector chrome rendered for a project that doesn't exist (today the right pane renders four tabs and three buttons against no graph). Every first-run promise must survive a fresh clone; a demo button that 404s is worse than no demo button.

**Browser demo vs desktop app.** The browser build is a *read-only demonstration of a pre-analyzed graph* — say exactly that, once, in a persistent but small badge (e.g. "Demo mode — analyzing your own code needs the desktop app"), instead of scattering per-control apologies ("Keychain is available in the desktop app", "Scan settings apply when…", "Open Folder runs in the desktop app" — currently three different phrasings in three places). Demo mode should hide desktop-only controls entirely rather than render them disabled with excuse text.

**Project/file navigation.** The left rail is navigation, full stop. Its spine is a real file tree (directories → files → units within files), because engineers orient by files; the current unit-type grouping (Programs/Copybooks/JCL) can be a secondary grouping toggle. Status (inventory, parse health, hints) is diagnostics: collapsed accordions with count badges, expanded on demand. Anything that is a *setting* or a *filter* lives where it acts (graph filters on the graph), never in the rail.

**Graph / source / inspector hierarchy.** The graph is the map; source is the territory; the inspector explains the current selection. Rules: (1) selection is one concept app-wide — clicking a node, a tree item, a search result, or a citation all set the same selection, and every pane reflects it; (2) the source pane is a real reader (full file, highlighted evidence lines), because citations are the product's trust mechanism and a citation that lands in a 15-line keyhole undercuts it; (3) pane sizes are stable — switching tabs must never resize the grid (kill `is-ask-focused` layout shifts); (4) the inspector never scrolls the whole app; each pane owns its scroll.

**Search and dependency exploration.** Search is the fastest verb and must be omnipresent (top bar), with results rendered *at the search box* (dropdown/palette), not in a different pane 400px away. Dependency exploration follows a strict grammar: every relationship row is `<other symbol> <verb> at <file:line>`, and both halves are clickable — symbol refocuses the graph, site focuses the source. This grammar already exists (RelationshipList) and is good; extend it everywhere (Graph Hints, parse warnings already do this).

**Chat/Ask as "talk to this codebase."** Ask is a conversation *about the current selection with the whole graph in reach*. Principles: graph answers are instant and labeled as deterministic; AI answers stream, carry inline citations, and visibly degrade to the cited graph answer when the guard trips (the guard design is genuinely good — keep it); the routing distinction (graph vs model) is shown *before* submit, as today, but with one label system, not four ("Ask", "Ask Graph", "Ask AI", "Set up AI" all appear on one button today). Never let an Ask answer silently change the user's graph state; offer "Focus LINEAGE" as a chip instead of auto-refocusing.

**Local AI status and setup.** AI state is a first-class, always-visible fact: one status chip (e.g. "AI: off / local llama3.2 / cloud Anthropic") in the top bar replacing the current privacy pill, opening a setup panel that is a *stepper*, not a form. Each step has a state and one action: Install → Run → Pull generation model → Pull embedding model → Test. All copy names exact commands. The privacy claim ("no code leaves this machine") appears inside this panel where it's meaningful, and on cloud providers becomes an explicit consent line.

**States.** Every surface defines all five states — and the disabled state must explain itself inline, not via `title` tooltips (touch users and keyboard users never see today's tooltips). Empty states name the one action that fills them. Loading states name what's happening and show progress where the analyzer emits it (it does). Errors name the failed thing, the reason, and the next command. Success is confirmed where the action was taken (see Export).

**Dense professional UI rules.**
- No primary label may truncate. Ellipsis is allowed only for repeated secondary metadata (file paths in lists), and the full value must be one interaction away.
- No nested cards. One border per region; inside a region use typography and spacing, not more boxes (today: answer-card > focus-strip > composer > route-note > response > chips > history — six bordered boxes in one tab).
- No control renders unless its precondition can be met in this build (demo mode hides, not disables, desktop-only actions).
- Stable geometry: user-initiated navigation never moves or resizes panes the user didn't touch.
- Feedback is spatially local to its trigger.
- One voice for state copy: "X needs Y → do Z", with the command in a copyable code span.

---

## 4. Proposed Information Architecture

Organized around the seven real workflows (open → scan → browse → explore → ask → configure AI → export).

**Top bar** (one row, never truncating):
- Brand (small)
- Global search / command palette (⌘K; results as an anchored dropdown with type badges; Enter focuses top hit — the current ranking logic in src/App.tsx:3485-3523 is good, keep it)
- Right cluster: AI status chip (off/local/cloud — replaces the privacy pill and doubles as the settings entry for AI), Export button, Settings gear.
- Breadcrumb/current-focus moves *out* of the top bar and into the graph toolbar, which is where focus is a meaningful concept.

**Left rail — "Project"** (fixed 260-280px):
1. Project header: project name/root path, status dot (Idle/Indexing n/m/Ready/Error), overflow menu with Open Folder / Open Sample / Re-scan / Scan settings shortcut. (Ingest shrinks from a pane to a header.)
2. File tree (primary body): directories → files → units; unit rows keep the color swatch; file rows open the file in source view. Search-in-tree filter box pinned above.
3. Collapsed accordions at bottom: Inventory (counts in header), Parse Health (`4/4 ✓` or `1/3 ⚠` in header; warning rows clickable as today), Hints (count in header).

**Center — workspace with two tabs at the graph toolbar level: Map | Source.**
- **Map:** the Sigma focus-and-expand view as today, plus: focus breadcrumb, Expand/Collapse, node-list toggle, and a Filters/Legend popover (moved from rail). Orientation counts stay bottom-right.
- **Source:** full-file reader (virtualized), file path header with line indicator, evidence gutter markers for all citations touching this file, prev/next evidence buttons. Clicking a `PERFORM`/`COPY`/`CALL` target that exists in the graph navigates (this is roadmap item #2 — symbol clicks come after full-file view).
- Map and Source stay in sync through the single selection model; a small "Show in map / Show source" affordance in each header crosses over.

**Right inspector** (fixed ~400px, stable):
- Tabs: **Overview | Ask | Dependencies** (the "Source" tab dies; source is a center-pane citizen).
- Overview: graph facts brief + evidence chips (as today), quiet AI-summary affordance per BUG-10.
- Ask: conversation list (question/answer turns with citation chips, scrollable history inline rather than a `<details>`), composer pinned at bottom, route indicator on the composer, suggested chips above the composer only when the conversation is empty.
- Dependencies: relationship groups as today (Depends On / Used By / Data flow), plus the relationship-detail card when an edge is selected.

**Settings drawer** (top-bar gear): two sections as today — AI (rebuilt as the readiness stepper; provider select; generation model; embedding model; host; Rosetta; usage/cost card) and Scanning (desktop only; hidden in demo). Keys stay keychain-only.

**Empty workspace (no project):** a single centered panel — logo, "Open a COBOL folder" (desktop primary), "Explore the sample", one line about AI being optional, link to docs. Rail shows a skeleton tree; inspector shows nothing (not dead buttons).

---

## 5. Offline Language Model Wiring

Target: a complete, honest, local-first "ask this codebase" loop with Ollama as the reference provider. Keep the existing guard/fallback architecture — it is the best part of the current wiring.

**Readiness model.** Replace the boolean-ish `ModelReadiness` with an explicit state machine evaluated per concern:
```
installed?   (desktop: `which ollama` via a new Tauri command; browser: unknown)
serving?     GET {base}/api/tags (2.5s timeout — as today, readiness.ts:44)
genModel?    tags contains settings.model (normalize :latest — keep isSameOllamaModel)
embModel?    tags contains settings.embeddingModel
genWorks?    POST /api/generate, num_predict 24 (as today, opt-in probe)
embWorks?    POST /api/embed with ["ping"] and vector-shape check
```
Each state maps to one UI row in the setup stepper with one copyable command (`ollama serve`, `ollama pull llama3.2`, `ollama pull nomic-embed-text`). `ollama-smoke.mjs` grows the same two embedding checks so CLI and app agree.

**Generation vs embedding model.** Two settings, two defaults: `model: "llama3.2"` (generation; keep `llama3.2:1b` as the recovery suggestion) and `embeddingModel: "nomic-embed-text"` (small, embedding-tuned, standard in the Ollama ecosystem). Never silently substitute one for the other; if the embedding model is missing, semantic retrieval is *off with a visible reason*, while generation still works.

**Host handling.** Store the bare origin (`http://127.0.0.1:11434`); derive `/api` internally (privacy.ts already normalizes). Keep `assertLocalOllamaUrl`'s localhost-HTTP-only rule (privacy.ts:1-10) — it is the privacy guarantee; keep rejecting cloud embeddings (embeddings.ts:58-67) until a deliberate provider path exists.

**Model discovery/installation UX.** Keep `Refresh models` (tags-only, fast) and the installed-model chips with Current/Fast-local badges (App.tsx:1882-1903 — good). Add: the stepper shows pull commands for missing defaults *before* any error occurs; after a `Check AI` failure the chips remain (they do); pulls stay outside the app in v1 (no download manager — out of scope, just copyable commands).

**Chunking and indexing.** Today's "semantic index" embeds one metadata sentence per node ("X is a program at file:line. Relationships: …", semantic.ts:108-132) — it never embeds source. Upgrade in two bounded steps:
1. Keep graph-fact chunks, but add *source-unit chunks*: for each program/paragraph/copybook with source, embed its excerpt (reuse `read_source_excerpt`, cap ~220 lines / split at paragraph boundaries for long units), text prefixed with `file:start-end` so matches carry citations natively.
2. Index build is explicit and observable: build on first AI-routed question (as today) but with a progress note ("Indexing 34 units…"), and invalidate by the existing graph-fingerprint key (semantic.ts:71-93 — keep).

**Graph-aware retrieval.** The current pipeline (rank symbols lexically → pull 1-hop edges → read excerpts for ≤8 context nodes → optional semantic matches; context.ts:21-111) is the right shape. Additions: merge semantic source-chunk hits as excerpt candidates (not just extra focus nodes); when two symbols match, keep the `shortestConnectionPath` trick (graphAnswer.ts:368-397) in the model prompt too, not only in graph answers; always tell the model what retrieval did ("semantic matches: none — embedding model unavailable") so its hedging matches reality.

**Vector storage.** Browser: localStorage as today (semantic.ts:95-106) with its quota-tolerant writes. Desktop: move to a JSON (or SQLite later if size demands — not before) file under AppData via two tiny Tauri commands (`read_vector_index`/`write_vector_index`), keyed identically. Local disk, never inside the scanned repo, never uploaded. Document the location in Settings ("Index stored at …, delete anytime").

**Prompt construction.** Keep `groundedAnswerSystemPrompt` and the citation-format contract (prompts.ts, chat.ts:33-44) — they're carefully written. Keep `enforceGroundedAnswerCitations` as the acceptance gate with the cited-graph fallback. One change: with streaming, the guard runs on completion; render streamed text in a "draft" style and stamp it "cited ✓" or swap to the guarded fallback at the end, with the same explanatory note as today.

**Streaming/cancellation/timeout/errors.** `streamText`; first-token timeout ~20s local / 10s cloud with the existing staged patience copy; overall Stop button as today (AbortController plumbing already exists — App.tsx:3124-3156 adapts nearly unchanged); on error mid-stream, keep partial text visible, labeled, with the graph fallback offered underneath rather than auto-replacing.

**Privacy guarantees.** Unchanged and restated in the AI panel: graph answers never call any model; local mode = localhost HTTP Ollama only (enforced in code, not just copy); cloud calls happen only on explicit AI actions and send only the retrieved slice (bounded: ≤8 excerpts × ≤220 lines); keys keychain-only (lib.rs:448-487); embeddings local-only until a real cloud-embedding decision.

**Fallback when AI is unavailable.** Exactly the current behavior, made *louder*: graph Ask, source, dependencies, export all work; AI-routed questions show the stepper state inline in Ask (which the `ask-readiness` block already approximates) instead of a dead-end error.

**End-to-end "Ask this codebase":** select or name a symbol → route classifier (keep `isGraphQuestion`) → graph route answers instantly with citations → model route: readiness gate (cheap: tags+model check) → retrieve (graph rank + semantic if embeddings ready) → stream grounded answer → guard on completion → citations clickable into the full-file source view → answer retained in per-graph history.

**Code editing:** out of scope, per PRD non-goals — and nothing in this guide should imply otherwise. Do not add any write-to-source path in v1. (If a future pass proposes edits, it requires: diff preview, explicit per-file user approval, writes restricted to the opened root, a dry-run mode, tests before/after, and a rollback file copy — but do not build toward this now.)

---

## 6. Implementation Slices

Status after the 2026-07-07 pass: **Slice 1 is done**; **Slice 2 is mostly
paid down**; **Slice 4 is partially done** (embedding-model setting, separate
readiness/embedding checks, chat API, command-naming copy, and the lightweight
Settings stepper landed; desktop CLI detection is still open); **Slice 5 is partially done** (Ask and summaries stream
with first-token timeout; source-chunk indexing is still open). Source browser/full-file work
remains.

### Slice 1 — First-run integrity (unblock everything) — DONE
Committed the demo graph, tracked `src-tauri/binaries/` via `.gitkeep`, stopped
the packaging script wiping the dir, fixed the macOS-only export test, and
updated README/QA docs. `npm run m6:verify` now passes 23/23 from a clean clone.
Not yet done: the fresh-clone **CI gate** (tracked in docs/tech-debt.md) — the
fix is in place but nothing in CI clones clean and re-runs the suite.

### Slice 1 (original scope, for reference) — First-run integrity (unblock everything)
- **Goal:** Fresh clone works: browser demo loads, `npm run tauri dev` launches, `npm run m6:verify` passes end-to-end.
- **Files:** .gitignore, public/ (commit demo graph or add predev generation), src-tauri/tauri.conf.json or tools/packaging/prepare-sidecar-resource.mjs (+ a `.gitkeep` under src-tauri/binaries), package.json scripts, tools/m6-verify/run.mjs, README.md (Quick Start ordering + prerequisites), docs/v1-readiness-audit.md (re-verify claims).
- **Outcome:** A new user's first three commands all succeed; the release gate is trustworthy again.
- **Tests:** CI job (or local script) that clones into a temp dir and runs `npm ci && npm run build && npm run m6:verify`; browser demo smoke asserting the demo asset is tracked by git.
- **Risks:** Committing a generated JSON can drift from the fixture — add a verify check that regenerating matches (or accept drift with a "regenerated on release" note). Tauri resource semantics differ per-platform; test the `.gitkeep` approach on Linux CI too.

### Slice 2 — Layout and design-system cleanup
- **Goal:** No truncation at ≥960px; left rail restructured (project header + file tree + status accordions); stable pane geometry; export feedback local to the button; demo-mode badge replacing scattered desktop-only notes; Overview AI CTAs demoted.
- **Files:** src/App.tsx (root shell/orchestration), src/workspace/WorkspacePane.tsx, src/topbar/TopBar.tsx, src/navigator/NavigatorRail.tsx, src/inspector/InspectorPane.tsx, src/inspector/ChatAnswerPanel.tsx, src/inspector/SummaryDock.tsx, src/App.css (topbar grid, shell grid, tab/list rules), src/graph/GraphView.tsx (label padding).
- **Outcome:** The app reads as one deliberate workbench at 1280×800 and 1440×900; problems 3, 4, and part of 2 in the user report are closed.
- **Tests:** Update ui-contract-smoke expectations (it greps for class structures that will change — budget for this); screenshot pass at 960/1100/1440; accessibility smoke (skip links/landmarks must survive restructuring).
- **Risks:** ui-contract-smoke is still partly coupled to source strings — the slice must update the smoke in the same PR or verify goes red. Rail restructure still touches the largest root component; consider extracting rail components first as a no-behavior-change refactor commit.

### Slice 3 — Real source browser
- **Goal:** Full-file reading with highlighted citations; file-based tree entries; Source promoted to a center-pane tab; the inspector "Source" tab removed.
- **Files:** src-tauri/src/lib.rs (new `read_source_file` command + tests), src/workspace/WorkspacePane.tsx (`CodeSnippet` -> `FileView`), src/source/CodeSnippet.tsx, src/App.tsx (snippet state/effects), src/lib/sourceReader.ts, src/App.css, left-rail tree component.
- **Outcome:** Problem 5 closed: a user can actually read LINEAGE.cbl top to bottom, with cited lines marked.
- **Tests:** Rust tests for bounds/encoding/size-cap; browser demo check that the source bundle serves full files (it already contains full text — m6-bakeoff-source.json is a file→text map); manual: citation from Ask centers the right line in the full file.
- **Risks:** Very large files (up to the 16MB scan cap) need virtualization or a windowed fallback — cap the full-file view (e.g. 20k lines) with an explicit "showing first N lines" notice rather than freezing. Keep the ±8 snippet path for the AI excerpt reader untouched.

### Slice 4 — Local AI readiness stepper + embedding model — PARTIALLY DONE
Landed in the 2026-07-06 pass: `embeddingModel` setting + Settings field,
`ollama:check` embedding probe, chat-API switch, and error copy that names
`ollama serve`/`ollama pull`. Landed in the 2026-07-07 pass: the lightweight
Settings readiness stepper. **Still open:** the desktop `which ollama`
CLI-detect command (install-vs-stopped distinction).
- **Goal:** Settings AI section becomes a staged readiness stepper; `embeddingModel` added to settings with its own checks; desktop `ollama` CLI detection; `ollama:check` extended to embeddings; error copy names exact commands.
- **Files:** src/model/config.ts, src/model/readiness.ts, src/model/embeddings.ts, src/App.tsx (Settings panel ~1559-1986, checkModelReadiness ~694-775), src-tauri/src/lib.rs (CLI-detect command), tools/local-model/ollama-smoke.mjs, tools/m6-verify/model-readiness-smoke.mjs + embedding-privacy-smoke.mjs, README local-AI section.
- **Outcome:** Problems 6 and half of 7 closed: a user with nothing installed reaches working local AI by following the panel top to bottom.
- **Tests:** Readiness/embedding smokes for each state; settings schema migration test (old saved settings without `embeddingModel` normalize cleanly — extend `normalizeModelSettings`, src/App.tsx:3070-3089); manual matrix rows below.
- **Risks:** Settings schema change must not invalidate the semantic index key format incompatibly (the key embeds the model string — src/App.tsx:3306-3308 changes to use `embeddingModel`); keychain/provider paths must remain untouched.

### Slice 5 — Streaming retrieval-backed Ask
- **Goal:** AI Ask and summaries stream; first-token timeout replaces the whole-call timeout; source-chunk semantic indexing with visible index/build status; retrieval status surfaced in answers; Ask no longer auto-refocuses the graph.
- **Status:** Partial. Ask and summaries stream draft text, have first-token
  timeout, and still guard final output; source-chunk indexing and the remaining
  readiness-stepper polish are still open.
- **Files:** src/model/chat.ts, src/model/summaries.ts, src/model/modelRuntime.ts (timeout semantics), src/App.tsx (askQuestion orchestration), src/inspector/ChatAnswerPanel.tsx, src/retrieval/semantic.ts (source chunks), src/retrieval/context.ts (status reporting, unswallow errors), optional desktop vector-store commands in lib.rs.
- **Outcome:** Problem 7 closed: "talk to this codebase" feels alive on CPU-class hardware, degrades honestly, and cites reliably.
- **Tests:** model-chat-contract-smoke updated for streaming; semantic-retrieval-smoke extended for source chunks and for the "embedding unavailable → explicit status" path; manual: `llama3.2:1b` streamed answer + mid-stream Stop + guard-fallback case.
- **Risks:** The citation guard currently assumes final text — streaming needs the draft/stamped rendering to avoid flashing uncited prose as final; keep the guarded fallback semantics byte-compatible with export provenance labels. Ollama streaming via `ollama-ai-provider-v2` should use the chat API path (`ollama(model)` rather than `.completion()`, providers.ts:17) — verify prompt fidelity with the existing prompt smokes.

Recommended order: 1 → 2 → 4 → 3 → 5 (1 unblocks CI truthfulness; 2 is prerequisite visual ground for 3; 4 before 5 because streaming work presumes the readiness states exist).

---

## 7. QA Matrix

Run after each slice; full pass before any release claim. ✅ = must pass, 👁 = manual visual check.

**Environments**
| # | Environment | Checks |
|---|---|---|
| E1 | Browser demo, fresh clone | ✅ `npm run dev` → Open Sample loads without any prior generation step; demo badge visible; desktop-only controls hidden (not disabled); Export downloads 3 files with visible confirmation; `?graph=` URL loads fixture |
| E2 | Desktop app, fresh clone | ✅ documented Quick Start commands succeed in order; window opens; Open Folder shows native picker; Re-scan disabled until a graph exists; settings persist across restart (settings.json, no secrets — lib.rs:434-446) |
| E3 | Desktop, no Ollama installed | ✅ stepper shows "not installed" with install guidance; graph Ask/source/deps/export all fully functional; AI actions route to setup, never error-loop |
| E4 | Ollama installed, server stopped (current machine state) | ✅ stepper: installed ✓ / serving ✗ with `ollama serve` copyable; `Check AI` completes < 3s (tags timeout); no AI call attempted |
| E5 | Server running, configured model missing | ✅ stepper: model ✗ with `ollama pull llama3.2`; installed-model chips offered; picking a chip re-checks green |
| E6 | Generation ready, embedding model missing | ✅ AI Ask works (streamed); answer carries "semantic search off: nomic-embed-text not installed" status; no silent degradation; pull command shown in stepper |
| E7 | All green (gen + embed) | ✅ `ollama:check` all-true incl. embeddings; AI Ask streams, cites inline, guard fallback labeled when tripped; Stop works mid-stream; index-build progress shown once, cached on second ask (vector cache hit) |

**Data sets**
| # | Input | Checks |
|---|---|---|
| D1 | Bundled sample (mini-bank) | ✅ 4/4 parsed; LINEAGE dependency panel matches m6-ui-qa expectations; citation click centers correct line in full-file view; export md/mmd/png contents sane |
| D2 | Real local COBOL folder (pick one from docs/05-test-repos.md) | ✅ scan completes with progress events; parse warnings listed and clickable; unparsed files don't kill the scan; record parser gaps as issues (roadmap #1) |
| D3 | Empty folder / folder with no COBOL | ✅ explicit "no source units found (looked for .cbl,.cob,.cpy,.jcl)" state with scan-settings hint — not a blank graph or crash |
| D4 | Bad input (binary junk with .cbl extension, >16MB file) | ✅ oversized skipped per lib.rs:13/206; junk yields parse warnings not crashes; UI communicates partial coverage |
| D5 | Large tree (hundreds of files) | ✅ scan progress visible; UI responsive during scan (FR-3); graph focus-and-expand stays usable; rail tree virtualized or acceptably fast; semantic index build bounded and communicated |

**Cross-cutting**
| # | Area | Checks |
|---|---|---|
| X1 | Export & citations | ✅ export from both shells; provenance labels (graph-derived / AI / guarded fallback) correct in Markdown; every Ask citation opens the exact file:line; evidence chips match answer text |
| X2 | Layout | 👁 960 / 1100 / 1280 / 1440 widths: no truncated primary labels, no pane jumps switching tabs, no off-screen feedback |
| X3 | Privacy | ✅ no network calls to non-localhost in local mode during a full session (devtools network audit); cloud mode indicator + consent copy correct; keys absent from settings.json and localStorage |
| X4 | Suites | ✅ `npm run build`, `npm run m6:verify` (end-to-end, fresh clone), `npm run v1:readiness`, `npm run ollama:check` matrix rows E3-E7 |

---

## 8. Open Questions

1. **Is the browser demo a supported distribution channel or a dev/QA harness?** This decides whether Slice 1 commits a demo artifact + demo-mode design work, or explicitly de-scopes the browser build to `?graph=` QA use. The README currently markets it; the code treats it as a dev mode (`import.meta.env.DEV` gate, src/App.tsx:285).
2. **Is macOS a v1 target?** Docs claim Linux-validated + Windows-unsigned only, but development is happening on macOS and `tauri.conf.json` ships icns. This decides how much of the QA matrix must run per-platform and whether the desktop-GUI verification gap found here (macOS) matters for release claims.
3. **Which embedding model is the blessed default?** Proposed `nomic-embed-text` (small, standard). If the team prefers zero-extra-downloads, the alternative is shipping without semantic retrieval by default and making it a labeled opt-in — that changes Slice 4/5 copy and defaults.
4. **Demo graph freshness policy:** if the demo JSON is committed (Slice 1), does drift from the live analyzer output fail CI, or is it a release-time regeneration? (Determines whether m6:verify gains a comparison check.)
5. **Where does the desktop vector index live** — keep browser-storage-only (webview localStorage; simplest, current behavior) or move to an AppData file via Tauri commands (survives webview storage clears, sizeable indexes)? Slice 5 needs this decided before writing the store.
6. **Ask history persistence:** per-graph in-memory only (today) or persisted per project fingerprint? Affects Slice 5's data model; no strong recommendation — in-memory is defensible for v1.
