# Cobolens Tech Debt

Last updated: 2026-07-09.

This is the honest running ledger of known debt: things that work well enough
for the local v1 release candidate but are shortcuts, deferrals, or rough edges
a future pass should address. It is not a bug list (see the readiness audit and
QA docs for behavior evidence) and not a roadmap of new features (see the README
roadmap and `docs/COBOL-Lens-PRD.md`). Each item says what it is, why it
matters, where it lives, and a suggested fix with rough effort.

Debt is grouped by area and tagged **[small]** (hours), **[medium]** (a day or
two), or **[large]** (a bounded but multi-day slice).

## Release-confidence pass (2026-07-09)

The local required suite passed, but the two most recent `main` health runs were
not green: one caught a phone-layout assertion and the latest timed out waiting
ten seconds for Chrome's debugging port. The release gate is now hardened in
the current worktree:

- the rendered browser smoke uses two bounded 30-second launch attempts, unique
  attempt profiles, early process-exit detection, and diagnostics that preserve
  the browser path, exit status, last port error, and stderr;
- `browser-launch-smoke.mjs` simulates an early browser failure and verifies the
  retry and final diagnostic without launching a real browser;
- health and package workflows pin Node.js 22 instead of following `lts/*`;
- CI installs `rustfmt` and `clippy`, and `m6:verify` runs formatting and
  warning-denying lint checks for both Rust crates.

Remote proof is deliberately still open. This item is complete only after the
updated `main` workflow passes three consecutive clean runs; local success alone
does not establish that proof gate.

## Local AI reliability pass (2026-07-09)

The configured-state and frequent-fallback issues are closed locally:

- readiness responses are request-scoped, so an older provider/model check
  cannot overwrite newer settings;
- the v1 runner uses `COBOLENS_READINESS_MODEL` when set, otherwise the first
  installed non-embedding Ollama model, with `llama3.2:1b` only as the no-model
  fallback;
- Ollama Ask explicitly disables thinking, uses a stable seed, supplies labeled
  allowed evidence, normalizes harmless citation wrappers, filters claims
  independently, and makes one bounded citation retry before graph fallback;
- the live Qwen gate covers ten questions, streaming, repeated requests,
  cancellation, and grounded summaries. The latest proof retained model content
  for nine questions and used one explicit cited graph fallback.

The source-aware semantic retrieval and desktop AppData vector-store work is
also complete in the current pass; the remaining Local AI item is desktop
Ollama install-vs-running detection.

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
2. Make changes in `src/` (mostly `src/App.tsx` just under 400 lines plus extracted
   feature files under `src/settings/`, `src/navigator/`, `src/source/`,
   `src/workspace/`, `src/inspector/`, `src/App.css`,
   `src/graph/GraphView.tsx`, `src/model/*`, and `src/retrieval/*`).
3. **Verify by actually driving the UI**, not by reading code — resize the
   window, drag the pane divider, collapse both side panels, switch Map/Source,
   ask a graph question and an AI question, click evidence. Many past regressions
   were "looked fine in code, broken on screen."
4. `npm run build` (tsc + vite) then `npm run m6:verify` must pass.
   **The UI-contract smoke is now module-scoped, and the accessibility smoke
   still includes source checks over extracted UI files and `App.css`**
   (`tools/m6-verify/ui-contract-smoke.mjs`, `accessibility-smoke.mjs`) — when
   you change copy, class names, or markup you may need to update focused
   assertions in the same change. This is smaller now, but still debt (see
   below).
5. Local AI: `npm run ollama:check <model>` verifies the CLI/HTTP/generation/
   embeddings path. Reasoning ("thinking") models need `think:false` (already set
   in the probe and provider) or they return empty text. Use
   `COBOLENS_READINESS_MODEL=<model> npm run v1:readiness` to force a reference
   model; otherwise the sweep chooses an installed non-embedding model.

**Biggest open debt, ranked:**
1. **`src/App.tsx` is still a just-under-400-line root file** [large] — the single
   hardest thing about working here. The first helper/panel extractions are done,
   and project/session state, scan/load actions, and settings/model orchestration
   are now out of the root. The three-pane shell wrapper, skip links, and export
   toast are extracted too, but App still owns enough top-level wiring that
   every change is higher-friction and the grep-smokes are brittle.
2. **Some UI smokes still use source-string contracts** [medium] — the rendered
   UI smoke now drives the core loop (first-run → open/import sample →
   search/focus → Map/Source → graph Ask → evidence→source) and tablet/narrow
   layout behavior, and the UI-contract smoke no longer builds one whole-app
   source blob. It now reads extracted modules directly for stable hooks, while
   the accessibility smoke still reads source/CSS. Move the remaining fragile
   assertions toward runtime behavior or durable `data-testid`s over time.
   Citation target resolution, graph selector behavior, summary planning,
   summary graph copy/evidence, Ask focus routing, model runtime behavior,
   inspector progress copy, Ask history, layout state, source line state, source
   reader behavior, and app settings persistence now have focused behavior
   smokes. Browser-process startup now has a focused behavior smoke too, so this
   remaining debt is mostly narrow source-string contracts.
3. **Desktop cannot distinguish Ollama missing from Ollama stopped** [small] —
   Settings now has a lightweight readiness stepper, but the app still only
   learns about Ollama through the HTTP API. Desktop can eventually add a tiny
   CLI-detect command; keep browser behavior HTTP-only.
4. **Source navigation is intentionally basic** [medium] — full-file reading is
   complete, but syntax highlighting, symbol clicks, jump-to-definition, and
   find-references are not implemented. Add those only after real-project source
   and retrieval behavior are stable.
**Layout gotchas already fixed (don't reintroduce):** an `overflow:hidden` pane in
an `auto` grid track collapses to 0 (rail + right-pane bugs) — use definite row/
column minimums; the inspector width is a CSS var `--right-w` clamped by
`src/lib/layoutState.ts`'s `clampRightWidth()` so it can't cover the map;
`.topbar-actions button` sets `padding:0 10px` which will crush any icon button
unless overridden.

## Recently paid down (2026-07-07)

For context, the build-guide fix pass closed these; they are no longer debt:

- Fresh-clone blockers: `src-tauri/binaries/` is a tracked resource path
  (`.gitkeep`); `public/m6-bakeoff-graph.json` is a committed demo asset;
  `write_export_files` test canonicalizes paths for macOS. `npm run m6:verify`
  now passes end-to-end from a clean clone.
- Fresh-clone verification: `npm run m6:verify` now builds the Rust analyzer
  debug sidecar before running the fixture suite, missing `cargo` reports a
  setup-oriented error, and `.github/workflows/health.yml` runs the suite on a
  clean Ubuntu checkout.
- Verification contract: `tools/m6-verify/verification-contract-smoke.mjs`
  keeps the runner, README, M6 verification guide, and health workflow aligned
  on the Rust/Cargo prerequisite and missing-Cargo remedy.
- Driven UI coverage: `tools/m6-verify/rendered-ui-smoke.mjs` now exercises the
  core browser loop through first-run empty-state guidance, import/sample,
  runtime skip-link landmark focus, Settings setup/focus, side-panel collapse
  geometry, graph node-list toggle state, Legend filter hide/reset behavior,
  Inventory counts, Parse Health status, Graph Hints status, Overview Ask
  follow-up, Ask-tab geometry, Overview View source, symbol focus, Map/Source
  toggle, Source file switching, Source reader code layout, relationship
  detail/endpoints, relationship endpoint refocus, tablet/narrow responsive
  layout, symbol-search keyboard flow, graph expand/hide behavior, graph Ask,
  Ask composer availability, compact/expanded evidence, and citation-to-source
  focus/readability that keeps Chat visible.
- Citation target resolution: `tools/m6-verify/citation-focus-smoke.mjs` now
  covers exact relationship-label matching, explicit node ids, source-range
  fallback, and unknown citation targets for `src/source/citationFocus.ts`. The
  main verifier runs it before the Rust analyzer build step, so it still reports
  in environments missing Cargo.
- Graph selectors: `tools/m6-verify/graph-selectors-smoke.mjs` now covers
  codebase inventory counts, first focus, source tree grouping, source file
  representatives, Graph Hints source units, and ranked/limited symbol search
  results for `src/lib/graphSelectors.ts`. Graph-derived App view data now lives
  in `src/graph/useGraphDerivedData.ts` instead of being assembled inline.
- Summary planning: `tools/m6-verify/summary-planning-smoke.mjs` now covers
  summary generation candidates and bulk token estimates for
  `src/inspector/summaryPlanning.ts`. `src/App.tsx` delegates those summary
  planning derivations instead of owning the filter and token heuristic inline.
- Summary graph copy/evidence: `tools/m6-verify/summary-graph-smoke.mjs` now
  covers graph-backed overview text, selected-node answers, guarded summary
  fallbacks, source/relationship evidence, external-node honesty, and COBOL
  logical-file/DD/dataset bridge wording for `src/inspector/summaryGraph.ts`.
- Ask focus routing: `tools/m6-verify/ask-focus-smoke.mjs` now covers the
  overview/orientation questions that should not auto-refocus the graph versus
  symbol-specific questions that may sync Ask focus via `src/retrieval/askFocus.ts`.
- Model runtime: `tools/m6-verify/model-runtime-smoke.mjs` now covers first-token
  timeout copy, Stop handling after streaming begins, controller cleanup, friendly
  provider errors, and semantic embedding cache keys for `src/model/modelRuntime.ts`.
- Inspector progress copy: `tools/m6-verify/inspector-progress-smoke.mjs` now
  covers AI waiting/streaming detail text and bulk summary fallback labels for
  `src/inspector/aiProgress.ts` and `src/inspector/summaryProgress.ts`.
- Ask history: `tools/m6-verify/chat-history-smoke.mjs` now covers recent-answer
  ordering, duplicate replacement, the six-answer cap, and no-mutation behavior
  for `src/inspector/chatHistory.ts`.
- Layout state: `tools/m6-verify/layout-state-smoke.mjs` now covers local
  storage fallbacks, persisted layout values, storage-error tolerance, and the
  inspector width clamp in `src/lib/layoutState.ts`.
- Source lines: `tools/m6-verify/source-line-smoke.mjs` now covers source range
  labels, selected/focused/citation marker precedence, composed line classes, and
  accessible line-state text for `src/source/sourceLineLabels.ts`.
- Source reader: `tools/m6-verify/source-reader-smoke.mjs` now covers browser
  snippets, excerpts, source bundle caching, encoded path lookup, missing-source
  errors, and `m6-bakeoff` graph/source URL pairing for
  `src/lib/sourceReader.ts`.
- App settings: `tools/m6-verify/app-settings-smoke.mjs` now covers saved
  model/scan normalization, local/cloud provider field cleanup, browser
  persistence, malformed browser settings, and fallback defaults for
  `src/lib/appSettings.ts`.
- Build chunking: `vite.config.ts` now uses conservative manual chunks for
  graph, AI, Tauri, and shared vendor dependencies. `npm run build` no longer
  emits the single-large-bundle warning; the largest current chunk is the
  AI vendor bundle at about 420 KB raw / 104 KB gzip.
- Demo asset policy: `README.md` now names the release/analyzer-change
  regeneration rule for `public/m6-bakeoff-graph.json` and
  `public/m6-bakeoff-source.json`; `tools/m6-verify/demo-assets-smoke.mjs`
  validates committed demo assets, fixture source parity, citation line ranges,
  and the documented policy before the Rust analyzer build step.
- Packaging claims: `README.md` keeps the packaging section explicit that current
  bundles are unsigned QA/release-candidate artifacts, and
  `tools/m6-verify/packaging-contract-smoke.mjs` checks that signed public
  installers are not claimed before signing is validated.
- Ask geometry: the Ask tab no longer adds `is-ask-focused` to the workspace
  shell, so switching inspector tabs cannot change outer pane proportions. Ask
  focus sync now uses `preserveExpansion: true`, keeping user-expanded graph
  context while still updating the selected symbol behind the answer.
- Source reading: `SourceFileView` distinguishes the selected symbol range from
  the exact focused/citation line. The source toolbar shows `lines start-end`
  for range selections, selected-range rows get a subtle rail, and focused
  citation rows use a distinct `C` marker. Source line labels and state helpers
  now live in `src/source/sourceLineLabels.ts`, and full-file loading now lives
  in `src/source/useSourceFile.ts`.
- Left rail hierarchy: the rail now reads as Project/Search/Codebase first, with
  Legend & Filters, Inventory, Parse Health, and Graph Hints grouped under
  native collapsible `details` accordions in a secondary Status and filters
  region.
- Ask and summary streaming: model-backed Ask and AI summaries now use
  `streamText`, show clearly labeled draft text while the request is running,
  apply a first-token timeout, and still run the citation guard on the final text
  before evidence/final summary text appears.
- App structure: app settings normalization/storage helpers moved to
  `src/lib/appSettings.ts`; settings load/save effects moved to
  `src/settings/useAppSettingsPersistence.ts`; browser/Tauri source-reading
  helpers moved to `src/lib/sourceReader.ts`; Tauri environment detection moved to
  `src/lib/tauri.ts`; the root chrome presenter moved to `src/AppShell.tsx`;
  the Settings dialog host moved to
  `src/settings/SettingsHost.tsx`; the Settings dialog and AI/scan settings
  panels moved to `src/settings/SettingsDialog.tsx`; the navigator rail moved to
  `src/navigator/NavigatorRail.tsx`; navigator-side panels moved to
  `src/navigator/NavigatorPanels.tsx`; the source reader moved to
  `src/source/SourceFileView.tsx`; full-file loading moved to
  `src/source/useSourceFile.ts`; model source-excerpt reading moved to
  `src/source/useSourceExcerptReader.ts`; dependency/relationship inspector panels
  moved to `src/inspector/DependencyPanels.tsx`; the top bar moved to
  `src/topbar/TopBar.tsx`; inspector tabs moved to
  `src/inspector/InspectorTabs.tsx`; the Overview/Summary panel moved to
  `src/inspector/SummaryDock.tsx`; summary graph/evidence and selected-node
  graph explanation helpers moved to `src/inspector/summaryGraph.ts`; graph
  selectors/search ranking/source grouping helpers moved to
  `src/lib/graphSelectors.ts`; shared graph label formatting moved to
  `src/lib/graphLabels.ts`; persisted layout reading and inspector width
  clamping moved to `src/lib/layoutState.ts`; workspace layout state/persistence,
  side-panel toggles, and inspector resize handling moved to
  `src/workspace/useWorkspaceLayout.ts`;
  workspace Map/Source view state, node focus, Home reset, Source switching,
  Ask evidence citation handling, relationship/citation jumps, and selected-edge
  actions moved to
  `src/workspace/useWorkspaceNavigation.ts`;
  shared AI progress helpers moved to
  `src/inspector/aiProgress.ts`; bulk summary progress formatting moved to
  `src/inspector/summaryProgress.ts`; Ask focus-sync routing moved to
  `src/retrieval/askFocus.ts`; model call timeout/error/key helpers moved to
  `src/model/modelRuntime.ts`; the Ask/Chat panel moved to
  `src/inspector/ChatAnswerPanel.tsx`; shared inspector evidence/message
  components moved to `src/inspector/MessageParts.tsx`; the center Map/Source
  workspace moved to `src/workspace/WorkspacePane.tsx`; the inspector shell,
  tabs host, resize divider, and panel routing moved to
  `src/inspector/InspectorPane.tsx`; the Navigator/Workspace/Inspector layout
  wrapper moved to `src/workspace/WorkspaceShell.tsx`; workspace skip links
  moved to `src/workspace/WorkspaceSkipLinks.tsx`; documentation export
  orchestration moved to `src/export/runDocumentationExport.ts`; export
  toast/status handling moved to
  `src/export/useDocumentationExport.ts`, with the visible toast in
  `src/export/ExportToast.tsx`; citation target resolution moved to
  `src/source/citationFocus.ts`; inspector tab state and scroll routing moved to
  `src/inspector/useInspectorRouting.ts`; bounded Ask history dedupe/capping moved to
  `src/inspector/chatHistory.ts`; Ask question/status/answer/error/history state
  and restore/clear/navigation/project-load reset handlers moved to
  `src/inspector/useChatState.ts`; Ask
  graph/model routing, semantic retrieval, streaming draft updates, fallback,
  and cancel handling moved to `src/inspector/useAskGeneration.ts`; summary
  state, graph overview summary action, streaming generation, bulk progress, and
  cancel handling moved to `src/inspector/useSummaryGeneration.ts`; summary
  candidate and bulk token planning moved to `src/inspector/summaryPlanning.ts`;
  desktop analysis
  progress listening moved to `src/scan/useAnalysisProgress.ts`; project session
  state moved to `src/scan/useProjectState.ts`; project open/import/sample/rescan
  actions, browser import input ref, and dev graph loading moved to
  `src/scan/useProjectActions.ts`;
  scan/model settings, settings dialog state,
  model-call count, and AI readiness composition moved to
  `src/settings/useAppSettingsState.ts`; provider
  keychain state/actions moved to `src/settings/useProviderKeyState.ts`; model
  readiness, provider choice, local model-list refresh, and model-call preflight
  moved to `src/settings/useModelReadiness.ts`; graph expansion/filter/node-list
  state moved to `src/graph/useGraphViewState.ts`; graph-derived view data moved
  to `src/graph/useGraphDerivedData.ts`; symbol search query/results and keyboard
  handling moved to `src/navigator/useSymbolSearch.ts`. These are the first
  no-behavior extraction slices.
- Local AI: dedicated embedding model separate from the generation model; local
  Ollama uses the chat API; readiness/`ollama:check` probe generation and
  embeddings separately; semantic-retrieval failure surfaces visibly; Settings
  shows a compact AI readiness stepper for install/serve, generation model,
  embedding model, and final test states.
- UX: export toast, non-truncating inspector tabs, wider graph label padding,
  demoted AI-setup CTAs, first-run inspector empty state.

## Application structure

### App.tsx is a just-under-400-line root file — **[large]**
- **What:** `src/App.tsx` holds the root component, state wiring, and product
  shell composition in one file.
  Settings normalization/storage helpers have been extracted to `src/lib/`;
  settings load/save effects moved to `src/settings/useAppSettingsPersistence.ts`;
  root chrome composition moved to `src/AppShell.tsx`;
  Settings host moved to `src/settings/SettingsHost.tsx`; Settings moved to
  `src/settings/SettingsDialog.tsx`; the navigator rail moved to
  `src/navigator/NavigatorRail.tsx`; navigator panels moved to
  `src/navigator/NavigatorPanels.tsx`; the source reader moved to
  `src/source/SourceFileView.tsx`; full-file loading moved to
  `src/source/useSourceFile.ts`; model source-excerpt reading moved to
  `src/source/useSourceExcerptReader.ts`; dependency inspector panels moved to
  `src/inspector/DependencyPanels.tsx`; the top bar moved to
  `src/topbar/TopBar.tsx`; inspector tabs moved to
  `src/inspector/InspectorTabs.tsx`; the Overview/Summary panel moved to
  `src/inspector/SummaryDock.tsx`; summary graph/evidence and selected-node
  graph explanation helpers moved to `src/inspector/summaryGraph.ts`; graph
  selectors/search ranking/source grouping helpers moved to
  `src/lib/graphSelectors.ts`; shared graph label formatting moved to
  `src/lib/graphLabels.ts`; persisted layout reading and inspector width
  clamping moved to `src/lib/layoutState.ts`; workspace layout state/persistence,
  side-panel toggles, and inspector resize handling moved to
  `src/workspace/useWorkspaceLayout.ts`;
  workspace Map/Source view state, node focus, Home reset, Source switching,
  Ask evidence citation handling, relationship/citation jumps, and selected-edge
  actions moved to
  `src/workspace/useWorkspaceNavigation.ts`;
  shared AI progress helpers moved to
  `src/inspector/aiProgress.ts`; bulk summary progress formatting moved to
  `src/inspector/summaryProgress.ts`; Ask focus-sync routing moved to
  `src/retrieval/askFocus.ts`; model call timeout/error/key helpers moved to
  `src/model/modelRuntime.ts`; the Ask/Chat panel moved to
  `src/inspector/ChatAnswerPanel.tsx`; shared evidence/message components moved
  to `src/inspector/MessageParts.tsx`; the center Map/Source workspace moved to
  `src/workspace/WorkspacePane.tsx`; the inspector shell, tabs host, resize
  divider, and panel routing moved to `src/inspector/InspectorPane.tsx`;
  the Navigator/Workspace/Inspector layout wrapper moved to
  `src/workspace/WorkspaceShell.tsx`;
  workspace skip links moved to `src/workspace/WorkspaceSkipLinks.tsx`;
  documentation export moved to `src/export/runDocumentationExport.ts`; export
  toast/status handling moved to `src/export/useDocumentationExport.ts`, with
  the visible toast in `src/export/ExportToast.tsx`;
  citation target resolution moved to `src/source/citationFocus.ts`; inspector
  tab state and scroll routing moved to `src/inspector/useInspectorRouting.ts`; bounded Ask
  history dedupe/capping moved to `src/inspector/chatHistory.ts`; Ask
  question/status/answer/error/history state and restore/clear/navigation/
  project-load reset handlers moved to `src/inspector/useChatState.ts`; Ask graph/model routing, semantic retrieval,
  streaming draft updates, fallback, and cancel handling moved to
  `src/inspector/useAskGeneration.ts`; summary state, graph overview summary
  action, streaming generation, bulk progress, and cancel handling moved to
  `src/inspector/useSummaryGeneration.ts`;
  summary candidate and bulk token planning moved to
  `src/inspector/summaryPlanning.ts`; desktop analysis progress
  listening moved to `src/scan/useAnalysisProgress.ts`; project session state
  moved to `src/scan/useProjectState.ts`; project open/import/sample/rescan
  actions, browser import input ref, and dev graph loading moved to
  `src/scan/useProjectActions.ts`;
  scan/model settings, settings dialog state, model-call count, and AI readiness
  composition moved to `src/settings/useAppSettingsState.ts`;
  provider keychain state/actions moved to
  `src/settings/useProviderKeyState.ts`; model readiness, provider choice, local
  model-list refresh, and model-call preflight moved to
  `src/settings/useModelReadiness.ts`; graph expansion/filter/node-list state
  moved to `src/graph/useGraphViewState.ts`; graph-derived view data moved to
  `src/graph/useGraphDerivedData.ts`; symbol search query/results and keyboard
  handling moved to `src/navigator/useSymbolSearch.ts`. The remaining App root
  wiring is still monolithic.
- **Why it matters:** Every UI change touches the largest file in the repo, and
  the grep-based UI-contract smoke is tightly coupled to its exact markup
  strings, so refactors ripple into test churn. It also makes the layout/IA work
  (below) risky.
- **Where:** `src/App.tsx`.
- **Fix:** Continue extracting the workspace shell and remaining orchestration
  helpers as no-behavior-change refactors first, then update the
  smoke to target stable `data-testid`s instead of markup strings.

### Settings/model state is still threaded through presentation components — **[medium]**
- **What:** `src/settings/useAppSettingsState.ts` now owns scan/model settings,
  provider key state, readiness, and model-call count, but `ModelSettings`,
  readiness, and callbacks are still passed into presentation components
  (`App -> SettingsDialog -> ModelSettingsPanel`; `App -> InspectorPane ->
  ChatAnswerPanel/SummaryDock`).
- **Why it matters:** Adding a field (as the embedding model just showed)
  requires edits at every layer.
- **Where:** `src/settings/useAppSettingsState.ts`, `src/App.tsx`, and the
  settings/inspector presentation components.
- **Fix:** Keep the new hook boundary, then consider a tiny feature-local context
  only if prop threading continues to slow real changes; do not add a state
  library (Principle 0).

## Testing and verification

### UI contract and accessibility smokes still include source-string contracts — **[medium]**
- **What:** `tools/m6-verify/rendered-ui-smoke.mjs` drives the core browser loop,
  and `tools/m6-verify/ui-contract-smoke.mjs` now reads extracted modules
  directly instead of one broad whole-app source blob. It and
  `accessibility-smoke.mjs` still assert selected substrings/CSS rules exist.
- **Why it matters:** The running-app coverage catches core-loop regressions, but
  cosmetic refactors can still break source-string checks. First-run,
  responsive layout, panel geometry, source reading, citations, navigator
  status panels, Ask, and graph behavior are now covered by the rendered browser
  smoke; keep trimming remaining source checks toward durable hooks, not broad
  runtime UI proof.
- **Where:** `tools/m6-verify/ui-contract-smoke.mjs`,
  `tools/m6-verify/accessibility-smoke.mjs`.
- **Fix:** Move fragile assertions toward runtime checks or stable `data-testid`s
  as the App.tsx split creates clearer component boundaries.

### Public package signing remains unconfigured — **[small]**
- **What:** The packaged macOS app now has an automated resource and launch
  smoke locally and in packaging CI. Linux and Windows remain unsigned QA
  builds. Apple notarization and public installer signing are not configured.
- **Why it matters:** Unsigned artifacts are useful release-candidate evidence,
  but they should not be presented as public installers.
- **Where:** `tools/desktop/macos-packaged-smoke.mjs`,
  `.github/workflows/package.yml`, `docs/desktop-release-hardening.md`.
- **Fix:** Add platform credentials and notarization only when a public release
  channel is selected; do not store signing secrets in the repository.

## Local AI

### Fixed local token budget with thinking-model headroom is a heuristic — **[small]**
- **What:** Local budgets were raised (ask 512, summary 384, readiness probe
  `num_predict` 160) so thinking-capable models (for example `gemma4:12b-mlx`)
  have room to emit visible text after their reasoning. These are guessed caps.
- **Why it matters:** A very verbose reasoner could still exhaust the budget
  before visible text; a tiny model wastes headroom.
- **Where:** `src/model/chat.ts`, `src/model/summaries.ts`,
  `src/model/readiness.ts`, `tools/local-model/ollama-smoke.mjs`.
- **Fix:** Tune visible-token budgets against real local hardware and consider
  reading the model's thinking capability from tags.

### Semantic index scale is bounded — **[medium]**
- **What:** Source and graph chunks are interleaved and capped at 160 chunks per
  index. Source ranges split at paragraph/source-unit boundaries and at 80-line
  maximums. This is intentionally bounded for local embedding latency.
- **Why it matters:** Very large codebases need measured chunk selection rather
  than simply raising the cap and increasing cold-start time.
- **Where:** `src/retrieval/semantic.ts`, `src/retrieval/useSemanticIndex.ts`.
- **Fix:** Use the real-corpus benchmark to measure recall and indexing latency,
  then add file/symbol preselection or incremental indexing only if evidence
  shows the current cap misses material source.

### No Ollama CLI-vs-server detection — **[small]**
- **What:** The app cannot distinguish "Ollama not installed" from "installed
  but not running" (it only reaches the HTTP API). Error copy now names
  `ollama serve`, and Settings has a staged readiness stepper, but the first row
  still has to treat install/serve as one HTTP-reachability state.
- **Why it matters:** A first-time local-AI user still has to self-diagnose which
  of those two setup states they are on.
- **Where:** `src/model/readiness.ts`, `src/App.tsx` (Settings panel),
  `src-tauri/src/lib.rs` (would need a `which ollama` command).
- **Fix:** Add a desktop CLI-detect command (`which ollama` or equivalent) and
  keep the browser stepper HTTP-only.

## Source browsing

### Source definition/reference navigation is not implemented — **[medium]**
- **What:** Full-file reading, line integrity, file switching, and citation
  centering are complete. Source remains a reader: identifiers are not clickable
  and there is no definition/reference index or syntax highlighter.
- **Why it matters:** The current trust loop is strong for citations, but deeper
  exploration still requires graph/search navigation.
- **Where:** `src/source/SourceFileView.tsx`, `src/source/citationFocus.ts`, and
  the analyzer graph contract.
- **Fix:** Add definition/reference navigation only after full-file behavior is
  proven against real corpora; reuse graph node/range identities rather than
  introducing a second parser in the webview.

## Layout and information architecture

### Cover-up + toggle-button fixes — 2026-07-07 (fifth UX pass)
- **Fixed the inspector covering the map:** dragging the pane divider (or a
  persisted width) could squeeze the center pane until its toolbar spilled and
  the graph was hidden. Width is now clamped by `src/lib/layoutState.ts`
  (including the drag handler) so the center keeps a usable minimum;
  `.center-toolbar` clips and its action buttons are compact so they never
  overflow.
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
  file tree / tabs).

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
- **Remaining:** a broader tooltip audit; Overview still top-aligns short
  content (acceptable).

### UX refinement pass — 2026-07-07 (per refined docs/DESIGN.md layout, density, and AI rules)
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
  source could be added. Source now remains mounted across Map/Source switches
  and reads complete files up to the explicit 2 MB safety cap.

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

## Open questions blocking some of the above

1. Is the browser demo a supported distribution channel or a QA harness? Governs
   how much demo-mode design and demo-asset-freshness tooling is worth building.
2. Is macOS a v1 target? Governs how much of the QA matrix runs per-platform and
   whether the desktop-GUI gap matters for release claims.
