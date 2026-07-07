# Cobolens Tech Debt

Last updated: 2026-07-07.

This is the honest running ledger of known debt: things that work well enough
for the local v1 release candidate but are shortcuts, deferrals, or rough edges
a future pass should address. It is not a bug list (see the readiness audit and
QA docs for behavior evidence) and not a roadmap of new features (see the README
roadmap and `docs/COBOL-Lens-PRD.md`). Each item says what it is, why it
matters, where it lives, and a suggested fix with rough effort.

Debt is grouped by area and tagged **[small]** (hours), **[medium]** (a day or
two), or **[large]** (a bounded but multi-day slice).

## START HERE — handoff for the next agent (2026-07-07)

**What this app is:** a local-first COBOL understanding tool. Rust sidecar parses
COBOL/JCL → `GraphDocument` JSON → React UI (dependency map + source reader +
grounded chat). AI (local Ollama or cloud) is optional; graph answers work
without it. Read `docs/DESIGN.md` before touching UI — it is the design contract
and it is enforced-ish by the smokes.

**How to work here (do this, in order):**
1. `npm run dev` for the browser preview. Click **Open Sample** to load the
   committed fixture (`public/m6-bakeoff-graph.json`). There is no folder-open in
   the browser — that needs the desktop app (`npm run tauri dev`).
2. Make changes in `src/` (mostly `src/App.tsx` ~3.9k lines, `src/App.css`,
   `src/graph/GraphView.tsx`, `src/model/*`, `src/retrieval/*`).
3. **Verify by actually driving the UI**, not by reading code — resize the
   window, drag the pane divider, collapse both side panels, switch Map/Source,
   ask a graph question and an AI question, click evidence. Many past regressions
   were "looked fine in code, broken on screen."
4. `npm run build` (tsc + vite) then `npm run m6:verify` (23 checks) must pass.
   **The UI-contract and accessibility smokes are string-greps over `App.tsx`/
   `App.css`** (`tools/m6-verify/ui-contract-smoke.mjs`, `accessibility-smoke.mjs`)
   — when you change copy, class names, or markup you WILL break them; update the
   assertions in the same change. This is itself debt (see below).
5. Local AI: `npm run ollama:check <model>` verifies the CLI/HTTP/generation/
   embeddings path. Reasoning ("thinking") models need `think:false` (already set
   in the probe and provider) or they return empty text.

**Biggest open debt, ranked:**
1. **`src/App.tsx` is a ~3.9k-line monolith** [large] — the single hardest thing
   about working here. Extract the top bar, left rail, center workspace, and
   inspector into components; extract the many `function X(){}` helpers. Until
   this is done every change is high-friction and the grep-smokes are brittle.
2. **Smokes are static greps, not behavior tests** [medium] — add ONE driven
   browser smoke (Playwright or reuse the preview harness) for the core loop
   (open sample → search → focus → Map/Source → ask → evidence→source) and stop
   asserting exact copy strings. This would end the "every copy tweak breaks the
   build" cycle.
3. **Ask does not stream** [large] — `generateText` buffers behind a 90s ceiling
   (`src/model/chat.ts`, `src/App.tsx` `MODEL_CALL_TIMEOUT_MS`). Switch to
   `streamText`; run the citation guard on the final text. Biggest local-AI UX win.
4. **Source is a windowed snippet, not a real file reader** [medium] — `−12/+60`
   lines (`src-tauri/src/lib.rs` `read_source_snippet`, browser mirror in
   `src/App.tsx`). No virtualized whole-file view, no syntax highlighting, no
   symbol-click / jump-to-definition. The Source file-switcher dropdown is a
   stopgap; a real file tree/tabs would be better.
5. **Left rail is a long stacked scroll** [medium] — Ingest, Search, Legend,
   Codebase, Inventory, Parse Health, Hints as equal blocks. Should be a project
   header + file tree + collapsible status accordions.

**Layout gotchas already fixed (don't reintroduce):** an `overflow:hidden` pane in
an `auto` grid track collapses to 0 (rail + right-pane bugs) — use definite row/
column minimums; the inspector width is a CSS var `--right-w` clamped by
`clampRightWidth()` so it can't cover the map; `.topbar-actions button` sets
`padding:0 10px` which will crush any icon button unless overridden.

## Recently paid down (2026-07-06)

For context, the build-guide fix pass closed these; they are no longer debt:

- Fresh-clone blockers: `src-tauri/binaries/` is a tracked resource path
  (`.gitkeep`); `public/m6-bakeoff-graph.json` is a committed demo asset;
  `write_export_files` test canonicalizes paths for macOS. `npm run m6:verify`
  now passes end-to-end from a clean clone.
- Local AI: dedicated embedding model separate from the generation model; local
  Ollama uses the chat API; readiness/`ollama:check` probe generation and
  embeddings separately; semantic-retrieval failure surfaces visibly.
- UX: export toast, non-truncating inspector tabs, wider graph label padding,
  demoted AI-setup CTAs, first-run inspector empty state.

## Application structure

### App.tsx is a ~3.7k-line monolith — **[large]**
- **What:** `src/App.tsx` holds the root component, ~20 sub-components
  (SettingsDialog, SummaryDock, ChatAnswerPanel, RelationshipList, CodeSnippet,
  ...), and ~40 free functions (retrieval glue, formatting, source IO, settings
  normalization) in one file.
- **Why it matters:** Every UI change touches the largest file in the repo, and
  the grep-based UI-contract smoke is tightly coupled to its exact markup
  strings, so refactors ripple into test churn. It also makes the layout/IA work
  (below) risky.
- **Where:** `src/App.tsx`.
- **Fix:** Extract by feature into `src/panels/` (Inspector, Ask, Overview,
  Dependencies, Settings), `src/topbar/`, `src/rail/`, and `src/lib/` helpers as
  a no-behavior-change refactor first, then update the smoke to target stable
  `data-testid`s instead of markup strings.

### Settings/model state is threaded by hand through deep prop drilling — **[medium]**
- **What:** `ModelSettings`, readiness, and callbacks are passed down several
  component layers (App -> SettingsDialog -> ModelSettingsPanel; App ->
  right pane -> ChatAnswerPanel/SummaryDock).
- **Why it matters:** Adding a field (as the embedding model just showed)
  requires edits at every layer.
- **Where:** `src/App.tsx`.
- **Fix:** A small React context for model/settings state once App.tsx is split;
  do not add a state library (Principle 0).

## Testing and verification

### "UI contract" and "accessibility" smokes are static source greps — **[medium]**
- **What:** `tools/m6-verify/ui-contract-smoke.mjs` and `accessibility-smoke.mjs`
  read `App.tsx`/`App.css` as text and assert substrings/CSS rules exist. They do
  not run the app.
- **Why it matters:** They pass whether or not the running UI behaves, and they
  break on cosmetic refactors that change markup strings. Docs should not present
  them as runtime UI verification (the readiness audit now flags this).
- **Where:** `tools/m6-verify/ui-contract-smoke.mjs`,
  `tools/m6-verify/accessibility-smoke.mjs`.
- **Fix:** Add one driven-browser smoke (Playwright, or the existing preview
  harness) covering the core loop: load sample -> search -> focus -> Ask (graph)
  -> citation jump -> export. Keep the source greps but relabel them as
  "source contract checks".

### No fresh-clone CI gate — **[small]**
- **What:** Nothing in CI clones into a clean dir and runs
  `npm ci && npm run build && npm run m6:verify`. The two P0s just fixed were
  both fresh-clone-only failures that a warm working tree hid.
- **Why it matters:** Regressions of this class are invisible to contributors
  who already generated fixtures/binaries locally.
- **Where:** `.github/workflows/`.
- **Fix:** A CI job that runs the suite in a clean checkout; add a check that the
  demo graph and `.gitkeep` are tracked by git.

### Desktop GUI unverified on macOS — **[small]**
- **What:** Verification of the desktop shell is via `cargo test` and
  packaged-Linux smokes. The actual macOS window has not been launched in this
  checkout.
- **Why it matters:** macOS is the active dev platform but is not a claimed
  release target; the gap should be explicit, not assumed-covered.
- **Where:** `tools/desktop/*`, `docs/v1-readiness-audit.md`.
- **Fix:** Decide whether macOS is a v1 target (open question below); if so, add
  a desktop smoke that launches and screenshots the packaged app.

## Local AI

### AI Ask/summaries buffer instead of streaming — **[large]**
- **What:** `generateGroundedAnswer`/`generateUnitSummary` use `generateText`,
  which returns only when the whole completion is done, behind a fixed 45s
  ceiling (`MODEL_CALL_TIMEOUT_MS`, `src/App.tsx:103`).
- **Why it matters:** On CPU-class local Ollama a good 60s answer is
  indistinguishable from a hang and gets killed. Streaming is a functional
  requirement for local-first chat, not polish.
- **Where:** `src/model/chat.ts`, `src/model/summaries.ts`,
  `src/App.tsx` (`runTimedModelCall`, `ChatAnswerPanel`).
- **Fix:** Switch to `streamText`; render incrementally; run the citation guard
  on the final text (draft style -> stamped/guarded); change the timeout to
  "no first token within N seconds" plus the existing Stop control. This is
  Slice 5 in the build guide.

### Fixed local token budget with thinking-model headroom is a heuristic — **[small]**
- **What:** Local budgets were raised (ask 512, summary 384, readiness probe
  `num_predict` 160) so thinking-capable models (for example `gemma4:12b-mlx`)
  have room to emit visible text after their reasoning. These are guessed caps.
- **Why it matters:** A very verbose reasoner could still exhaust the budget
  before visible text; a tiny model wastes headroom.
- **Where:** `src/model/chat.ts`, `src/model/summaries.ts`,
  `src/model/readiness.ts`, `tools/local-model/ollama-smoke.mjs`.
- **Fix:** Once streaming lands, budget on first-token/visible-token rather than
  a total cap; consider reading the model's thinking capability from tags.

### Semantic index embeds graph facts, not source — **[medium]**
- **What:** `buildSemanticChunks` embeds one metadata sentence per node
  ("X is a program at file:line. Relationships: ..."). It never embeds source
  code.
- **Why it matters:** Semantic retrieval can only match on structural
  descriptions, so "where is the interest calculated" won't find the arithmetic.
- **Where:** `src/retrieval/semantic.ts`.
- **Fix:** Add source-unit chunks (reuse `read_source_excerpt`, split long units
  at paragraph boundaries, prefix with `file:start-end` so matches carry
  citations). Part of Slice 5.

### Desktop semantic vector index lives in webview storage — **[medium]**
- **What:** The vector cache uses `localStorage` in both browser and desktop.
- **Why it matters:** Desktop indexes are wiped when webview storage clears and
  are quota-bound; a real project index wants a file on disk.
- **Where:** `src/retrieval/semantic.ts`
  (`createLocalStorageSemanticVectorStore`).
- **Fix:** Two small Tauri commands (`read_vector_index`/`write_vector_index`)
  writing a JSON file under AppData, keyed identically; keep localStorage for the
  browser demo. Depends on the open question about index location.

### No Ollama CLI-vs-server detection; setup is a form, not a stepper — **[medium]**
- **What:** The app cannot distinguish "Ollama not installed" from "installed
  but not running" (it only reaches the HTTP API). Error copy now names
  `ollama serve`, but Settings is still a flat form rather than a staged
  Install -> Serve -> Generation model -> Embedding model -> Test wizard.
- **Why it matters:** A first-time local-AI user still has to self-diagnose which
  step they are on.
- **Where:** `src/model/readiness.ts`, `src/App.tsx` (Settings panel),
  `src-tauri/src/lib.rs` (would need a `which ollama` command).
- **Fix:** Slice 4 in the build guide: a desktop CLI-detect command plus a
  readiness stepper UI, each row with one copyable command.

## Source browsing

### Source view is a fixed +/-8-line snippet — **[large]**
- **What:** `read_source_snippet` returns lines target +/- 8; the browser mirror
  matches. There is no full-file scroll, no syntax highlighting, no symbol
  clicks. The inspector "Source" tab describes the panel rather than being a
  reader.
- **Why it matters:** Understanding COBOL needs whole paragraphs and DATA
  DIVISION context; a 15-line keyhole undercuts the citation-trust story.
- **Where:** `src-tauri/src/lib.rs` (`read_source_snippet`), `src/App.tsx`
  (`CodeSnippet`, `SourceInspectorPanel`, source IO).
- **Fix:** Slice 3 in the build guide: a `read_source_file` command (size-capped
  / windowed), a virtualized full-file reader with the cited line highlighted,
  file-level tree entries, and later symbol-click navigation. Keep the snippet
  API for AI excerpts.

## Layout and information architecture

### Cover-up + toggle-button fixes — 2026-07-07 (fifth UX pass)
- **Fixed the inspector covering the map:** dragging the pane divider (or a
  persisted width) could squeeze the center pane until its toolbar spilled and
  the graph was hidden. Width is now clamped by `clampRightWidth()` (and in the
  drag handler) so the center keeps a usable minimum; `.center-toolbar` clips and
  its action buttons are compact so they never overflow.
- **"Focus complete" removed:** the expand control was a confusing disabled
  "Focus complete" when a focus had no hidden neighbors — it now simply hides,
  and shows "Expand +N" only when there is something to expand. "Show nodes" →
  "Nodes".
- **Toggle icon button fixed (for real):** `.topbar-actions button` was applying
  `padding: 0 10px` to the 30px icon button, cramming the 17px glyph into an 8px
  box; overridden to `padding:0`, and the glyph redesigned to a clean outline +
  solid compartment (no floating sliver).
- **Remaining:** graph node labels can still clip at the center-pane's right edge
  (Sigma renders labels to the canvas edge); the top bar still truncates
  breadcrumb/search at very narrow widths.

### Entry points, status chrome & source nav — 2026-07-07 (fourth UX pass)
- **Import affordance:** added a top-bar **Open** button (parallel to Export) —
  opens the folder picker on desktop, the sample in the browser. Previously the
  only way in was the rail's Open Sample.
- **Toggle buttons redesigned:** the collapse toggles are now quiet ghost icon
  buttons (not boxed chips) with cleaner panel glyphs, aligned in the top bar.
- **First-run is not a fake button:** the "Get started" card's desktop-only note
  and the rail's "runs in the desktop app" box are now plain captions, not
  button-styled boxes.
- **Chat status compacted:** the verbose "AI mode: uses Ollama on only the
  retrieved…" block and the "Ollama is ready on localhost with …" block are now
  a small **mode chip** + a **glowing green "Live" status dot**, with the detail
  in tooltips (hover the dot → the model + reachability).
- **Source file navigation:** the Source toolbar has a **file switcher dropdown**
  listing every file in the codebase, so "where are the other files?" is answered
  in place — pick a file to open it (and focus its symbol).
- **Remaining:** the file switcher is a native select (could become a richer
  file tree / tabs); Source could still highlight the selected symbol's full line
  range.

### Copy + interaction pass — 2026-07-07 (third UX pass)
- **Fixed:** model answers rendered as a wall of text because the formatter only
  parsed `-` bullets — now normalizes `-`/`*`/`•` (incl. inline) so answers are
  real lists; the chat conversation was **wiped on every node selection and tab
  switch** — now it persists (selection no longer clears the answer/history or
  forces the Overview tab); the top-bar inspector-collapse button was
  vertically misaligned (now boxed to 30px, aligned with Export).
- **Copy:** "Ask" → **"Chat"** (tab + panel); the confusing "AI answer:" route
  chip → "AI mode:"; verbose/duplicative subtitles trimmed; "Graph ready" status
  → "Ready" (the loaded view is a Map, not a "graph"); inspector header now shows
  the selected symbol (swatch + name) instead of "Work with this code";
  Dependencies sections renamed to plain "Uses / calls / reads" and "Used by"
  with a how-to hint; Codebase and Inventory got one-line explainers + item
  tooltips.
- **Clarity:** Map/Source toggle now has icons + a teal accent on the Source
  toolbar so the current view is obvious; the Source toolbar shows the focused
  symbol (swatch + name + file + line); Evidence is a clean single-line list
  (label left, `file:line` right) with a "click to open in Source" hint.
- **Remaining:** the Source view could highlight the selected symbol's full line
  range (not just the cited line); a broader tooltip audit; Overview still
  top-aligns short content (acceptable).

### UX refinement pass — 2026-07-07 (per refined docs/DESIGN.md §3-4, 8)
- **Fixed:** the sticky Source header overlapped scrolling code (now the center
  toolbar owns the file/line and the redundant in-source header is hidden); code
  no longer wraps (column-accurate, horizontal scroll); the Overview/Ask action
  buttons were bulky full-width slabs (now a compact label-width row — a
  `.summary-actions > div` selector was overriding the flex row); the installed-
  model dropdown now shows loading/empty/server-down states clearly.
- **Added:** both side panels collapse (navigator via the top-bar two-pane icon,
  inspector via a second top-bar icon), the workspace/inspector split is
  drag-resizable (`.pane-divider`, clamped 320-860px), and collapse + width
  persist across reloads (`cobolens.railCollapsed` / `inspectorCollapsed` /
  `rightWidth`).
- **Remaining (small):** on the single-column narrow layout the navigator rail
  sits at the bottom, so collapsing it from the top bar is correct but not
  visible where the user is looking — a narrow-specific rail drawer/scroll-to
  would make it feel responsive. Overview still shows some empty space below
  short content (top-aligned, acceptable but could host more at-a-glance facts).

### Information architecture — overhauled 2026-07-07 (per docs/DESIGN.md)
- **What changed:** The workspace was restructured to three zones per
  `docs/DESIGN.md`: a **collapsible** navigator rail (top-bar toggle), a **center
  workspace that toggles Map / Source** (source is now the large center reading
  surface with a generous scrollable window, not a cramped right-hand dock), and
  a full-height **inspector/chat** right column. Clicking any Evidence citation
  or "View source" brings Source forward in the center and highlights the cited
  line. Settings model selection is now a dropdown auto-populated from locally
  installed models.
- **Remaining (small):** the "Skip to source" landmark was dropped (source is a
  toggle inside the workspace, reachable via the Source button) — a keyboard user
  tabs to the workspace then the Source control; a dedicated skip that toggles
  source could be added. Source is still a windowed snippet (±12 / +60 lines),
  not a true whole-file virtualized reader (see the Source browsing item below).

### Responsive layout — reworked 2026-07-06 (mostly resolved)
- **What changed:** The narrow-width layout was previously unusable — below
  ~760px the app forced a cramped rail-beside-graph / phone-stack that a user
  could get "stuck" in (tiny graph, unreadable, panes collapsed to zero). It is
  now three clean tiers (see `docs/local-model-and-ui-test-plan.md` §2): 3-pane
  desktop ≥1025px, and a single graph-first scrolling column ≤1024px (graph →
  source → inspector → rail), with a full-width Settings sheet on tiny screens.
  Two grid-collapse bugs (overflow:hidden panes collapsing to 0 height in `auto`
  tracks) were fixed with definite row minimums.
- **Remaining nits (small):** on narrow, the rail is graph-*last* (a collapsible
  rail toggle would let users summon nav without scrolling); one long graph label
  (`LINK RATEAPI`) can clip at the far right edge; wheel-zoom over the graph
  competes with page scroll on narrow (standard graph tradeoff).
- **Where:** `src/App.css` media queries (`max-width: 1280/1024/560`),
  `src/graph/GraphView.tsx` (camera/label config).

### Left rail is still an equal-weight stack of blocks — **[medium]**
- **What:** The rail stacks Ingest, Search, Legend & Filters, Codebase,
  Inventory, Parse Health, and Graph Hints as peers. On desktop the Codebase
  browser (primary navigation) sits below the fold; on narrow the whole rail is
  pushed below the graph/inspector.
- **Why it matters:** The PRD says the rail is "navigation and status only";
  today it is an overloaded scroll.
- **Where:** `src/App.tsx` (left pane), `src/App.css`.
- **Fix:** Build-guide Slice 2: a project header + file tree as the spine,
  status as collapsed accordions, filters in a graph-toolbar popover, and a
  collapse toggle for narrow widths.

### Switching to the Ask tab reshapes the grid — **[small]**
- **What:** The `is-ask-focused` class on `.shell`/`.right-pane` changes column
  proportions when Ask is active, so panes jump on tab switch.
- **Why it matters:** Violates the "stable geometry" rule; user-initiated tab
  changes should not resize untouched panes.
- **Where:** `src/App.tsx` (`inspectorTab === "ask"` class toggles),
  `src/App.css`.
- **Fix:** Give Ask room without resizing siblings (internal scroll), or make the
  proportion change opt-in.

### Ask auto-refocuses the graph and discards expansion state — **[small]**
- **What:** After answering, Ask calls `focusOnNode(...)` on the first matched
  node, and `focusOnNode` clears `expandedNodeIds`.
- **Why it matters:** Asking a question silently throws away the graph the user
  expanded.
- **Where:** `src/App.tsx` (`askQuestion` focus sync, `focusOnNode`).
- **Fix:** Offer a "Focus <symbol>" chip instead of auto-refocusing, or preserve
  expansion across an Ask-driven focus.

## Build and packaging

### Single ~980 KB JS bundle, no code splitting — **[small]**
- **What:** `vite build` emits one ~980 KB (263 KB gzip) chunk and warns about
  it. Sigma/graphology and the AI SDKs all load up front.
- **Why it matters:** Slower first paint, especially for the browser demo; the
  warning is noise on every build.
- **Where:** `vite.config.ts`, dynamic-import boundaries in `src/`.
- **Fix:** `manualChunks` for the graph and AI-SDK vendors, and/or lazy-load the
  AI provider modules (only needed when a model action runs).

### Committed demo graph can drift from analyzer output — **[small]**
- **What:** `public/m6-bakeoff-graph.json` is now a committed artifact of
  `npm run m6:fixture-graph`. Nothing fails if the analyzer changes and the
  committed graph is stale.
- **Why it matters:** The browser demo could silently show an out-of-date graph.
- **Where:** `public/m6-bakeoff-graph.json`,
  `tools/m6-bakeoff/export-fixture-graph.mjs`, `tools/m6-verify/run.mjs`.
- **Fix:** Either a verify check that regenerating matches the committed file, or
  a documented "regenerated at release" policy (see open question below).

## Open questions blocking some of the above

1. Is the browser demo a supported distribution channel or a QA harness? Governs
   how much demo-mode design and demo-asset-freshness tooling is worth building.
2. Is macOS a v1 target? Governs how much of the QA matrix runs per-platform and
   whether the desktop-GUI gap matters for release claims.
3. Where does the desktop vector index live — webview storage or an AppData
   file? Blocks the vector-store item above.
4. Demo-graph freshness policy: fail CI on drift, or regenerate at release?
