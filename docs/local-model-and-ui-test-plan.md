# Cobolens — Local-Model & UI Working-State Plan

Last updated: 2026-07-06.

This plan defines what "working" means for Cobolens and how to verify it: the UI
must be usable at every width, and the app must work end to end — parse a COBOL
codebase, let the local model read/reason over that code, answer with clickable
citations, and jump to the exact source that backs each claim. It also addresses
the "can the local model write changes to the code" question honestly.

## 1. Definition of a working state

A working Cobolens build satisfies all of:

1. **UI usable at every width** — desktop 3-pane and a clean single-column
   layout on narrow/tablet widths, with no view the user cannot navigate.
2. **Read the code** — source panel shows real file/line content; clicking a
   citation lands on the exact line that proves the relationship.
3. **The model reasons over the code** — an AI answer names real paragraphs,
   datasets, copybooks, and DB2/CICS signals from the parsed graph and source,
   with inline `file:line` citations, not generic boilerplate.
4. **Do what the reading says** — the app is an *understanding* tool: every
   substantive claim is source-cited and auditable. Writing/editing code is a
   PRD non-goal (see §4).
5. **Honest degradation** — when the model is unavailable or its answer isn't
   grounded, the app falls back to a cited graph answer and says so.

## 2. UI status (2026-07-06 rework)

### Responsive tiers (in `src/App.css`)
- **≥ 1281px** — full 3-pane: navigator rail | dependency graph | source+inspector.
- **1025–1280px** — 3-pane with narrower columns.
- **≤ 1024px** — single scrolling column, **graph-first**: prominent graph
  (56vh) → source + inspector → navigator/status rail last. Replaces the old
  cramped rail-beside-graph and phone-stack layouts that were unusable in the
  ~700–1024px range.
- **≤ 560px** — tiny-screen tweaks: search label hidden, Export hidden, graph
  56vh→52vh, Settings becomes a full-width sheet.

### Fixed in this pass
- The app is no longer "stuck" in an unusable narrow layout: at ~740px it now
  shows a large readable graph, full-width readable source, and a full-width
  Ask/inspector, in a natural scrolling column.
- Two grid-collapse bugs fixed (an `overflow:hidden` pane in an `auto` grid
  track collapsed to 0 height) — both the rail and the right-pane now get
  definite minimum heights so they never vanish.
- Graph rendering: camera zoomed to fill the pane (ratio 0.86), larger nodes
  (22/13), collision-culled labels (no more overlap), compact minimap pill.
- Settings renders as a clean readable drawer (full-width sheet on tiny screens).

### Known remaining UI nits (not blockers)
- One long right-edge graph label (`LINK RATEAPI`) can clip on the narrowest
  canvases; the node is still visible and listed under "Show nodes".
- On narrow, wheel-zoom over the graph zooms the graph (expected for a graph);
  page scrolling uses the scrollbar / areas outside the graph.
- The rail is graph-*last* on narrow; a future improvement is a collapsible rail
  toggle so the rail can be summoned without scrolling.

## 3. Local-model end-to-end test matrix

Reference model for local testing: **gemma4:12b-mlx** (a capable local model;
llama3.2:1b is too weak to reliably satisfy the citation guard). Embedding model:
`nomic-embed-text` (optional; enables semantic retrieval).

### 3a. Question routing (graph vs model)
Routing is decided by `isGraphQuestion` (`src/retrieval/graphAnswer.ts`).

| Question | Route | Expected UI subtitle |
| --- | --- | --- |
| "What depends on LINEAGE?" | Graph | "Answered from the graph" |
| "What does LINEAGE read/write/call?" | Graph | "Answered from the graph" |
| "Where does CUSTOMER-FILE flow?" | Graph | "Answered from the graph" |
| "Give me a codebase overview." | Graph | orientation answer |
| "Explain LINEAGE in plain English for a new developer." | Model | "Ollama answer with cited graph context" (accepted) OR a labeled graph fallback |
| "What is the business logic in LINEAGE?" | Model | accepted model answer or labeled fallback |

Read the `.answer-header span` subtitle to classify:
- **"Answered from the graph"** — deterministic graph route.
- **"Ollama answer with cited graph context"** — accepted model answer.
- **"Showing a cited graph answer because …" / "… I answered from the graph
  instead"** — model output rejected by the citation guard or timed out;
  cited graph fallback shown.

### 3b. "Is the model actually reasoning?" checks
An accepted model answer must:
- cite real `file:line` sites that exist in the graph (e.g.
  `src/LINEAGE.cbl:21` for the CUSTOMER-FILE read, `:40` for the CICS LINK,
  `jcl/DAILYLN.jcl:2` for the JCL step);
- name real artifacts (paragraphs like BUILD-REPORT, datasets like
  BANK.CUSTOMER.MASTER, copybooks CUSTOMER/REPORT, DB2 CUSTOMER_TABLE);
- match the actual source when you click each citation.

If the answer is generic ("this program processes data") with no real sites, it
is boilerplate — the guard should have rejected it; investigate the guard
(`src/model/answerGuard.ts`) and the retrieved context.

### 3c. Coverage checklist (run through the UI with gemma4:12b-mlx)
1. Settings → set Model `gemma4:12b-mlx` → Check AI → "ready … returned text".
2. Graph question → instant cited answer; click each citation → correct line.
3. Model question ("Explain LINEAGE in plain English…") → accepted cited answer;
   verify it names real paragraphs/datasets and each citation lands correctly.
4. Overview → Generate AI summary for a program → accepted or labeled fallback;
   summary cites source + at least one relationship.
5. Guard: ask something the model can't ground ("hey") → cited graph fallback,
   clearly labeled — not boilerplate presented as a real answer.
6. Semantic retrieval: with `nomic-embed-text` missing, a model answer shows the
   "semantic search was unavailable" note but still answers; install it and the
   note disappears.
7. Timeout/Stop: a slow generation shows staged progress; Stop leaves a clear
   stopped state; the 90s ceiling lets a slow 12B finish (streaming is the
   proper future fix — see tech-debt).
8. Readiness states: model not installed / server stopped / embedding missing
   each give a specific, actionable message (see `docs/tech-debt.md`).
8a. Reasoning ("thinking") models (e.g. Qwen3 / deepseek-r1 variants): both the
    readiness probe and generation send `think: false`, so the model answers
    directly instead of spending its whole token budget on hidden chain-of-thought
    and returning empty text. Verified end to end with a local
    `Qwen3.6-35B ...` build: Check AI passes and Ask returns an accepted,
    inline-cited answer. Without this, such a model fails Check AI with
    "generation returned no text" even though it is installed and strong.
9. Export: Markdown/Mermaid/PNG produced; provenance labels correct.
10. Repeat the core loop at 740px width and desktop width — both usable.

## 4. "Can the local model write changes to the code?" — scope answer

**No, not in v1 — and by design.** `docs/COBOL-Lens-PRD.md` lists COBOL
editing, generation, and translation as explicit **non-goals**. Cobolens is an
*understanding* tool: it reads code and answers cited questions. "Doing what the
reading says the app does" means exactly that read-and-explain loop, which works
end to end (verified: graph → cited answer → jump to the proving source line).

Architecturally the app is read-only on purpose:
- The Rust analyzer sidecar only *reads* and emits a `GraphDocument`.
- Tauri exposes `read_source_snippet` / `read_source_excerpt` and a scoped
  `write_export_files` (docs only) — there is **no** command that writes back to
  source, and `safe_source_path` sandboxes reads to the opened root.
- The model prompts and citation guard are built to *explain retrieved context*,
  explicitly forbidding invention — the opposite of a code generator.

### If code-editing were ever pursued (out of current scope, needs sign-off)
It would require a deliberate, safe edit workflow — do **not** build toward this
without explicit product approval:
1. **Diff preview** — the model proposes a unified diff; nothing is written
   until the user sees it.
2. **Explicit per-file approval** — user approves each file; no silent writes.
3. **Write boundary** — a new Tauri `write_source_file` command reusing the
   `safe_source_path` sandbox so writes cannot escape the opened root.
4. **Backup + rollback** — copy the original before writing; one-click revert.
5. **Dry-run mode** and **tests before/after** where a build/test command exists.
6. Clear labeling that edits are model-suggested and unverified.

Until that exists and is signed off, keep Cobolens read-only and honest about it.

## 5. Next work (tracked)
- Streaming AI answers (removes the blind 90s ceiling) — biggest local-AI UX win.
- Optional collapsible rail on narrow widths (graph-first without scrolling past nav).
- Full-file source browser (currently a windowed snippet) — see `docs/tech-debt.md`.
