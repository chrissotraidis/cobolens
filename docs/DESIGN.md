# Cobolens Design Methodology

This is the design contract for Cobolens. Every UI change must adhere to it. If a
change violates a rule here, either change the design system deliberately (and
update this file) or don't ship it.

Cobolens is a **local workbench for reading and understanding COBOL** — closer to
an IDE or a "talk to your codebase" tool than a dashboard. The person using it is
a developer under time pressure trying to build a mental model of code they did
not write. Every decision answers one question: *does this help them read the
code and trust an answer about it?*

## 1. The three zones

The workspace is three vertical zones, left to right, in order of how the eye
should flow: **navigate → read → converse**.

1. **Navigator (left, collapsible).** Project ingest, search results, legend/
   filters, the codebase tree, and status (inventory, parse health, hints). It is
   navigation and status only — never settings, never the primary reading
   surface. It **collapses** to reclaim space (like an IDE sidebar / Claude's
   collapsible columns). Collapsed by default is acceptable on narrow widths.

2. **Workspace (center, the largest zone).** A single main area that **toggles
   between Map and Source**:
   - **Source** is the default reason the tool exists — read the actual code.
     It must be large, scrollable, and legible: monospace, line numbers, the
     cited line clearly highlighted, generous line context.
   - **Map** is the focus-and-expand dependency graph.
   A segmented control switches them. Selecting a symbol, clicking a citation, or
   "View source" brings Source forward; exploring dependencies brings Map
   forward. The center is where you *look*.

3. **Conversation / Inspector (right).** Ask (chat with the codebase), Overview
   (graph facts + optional AI), and Dependencies. This is where you *ask and
   read answers*, so it gets real width and full height — a conversation column,
   not a cramped dock.

Rationale for the layout the user asked for: code is the point, so Source lives
in the big center; the graph is one lens on it, not the permanent centerpiece;
chat is a first-class right column; and the navigator gets out of the way.

## 2. Selection & evidence — one model, always visible

- There is **one selection** app-wide. Clicking a graph node, a tree item, a
  search result, a dependency row, or a citation all set the same selected
  symbol, and every zone reflects it.
- **Citations are the trust mechanism.** Clicking any "Evidence" citation or a
  relationship site MUST bring **Source** forward in the center and highlight the
  exact line, with a visible "Focused citation: file:line" marker. The user
  should never click evidence and wonder where it went. Evidence → code is the
  single most important interaction; make it obvious and instant.
- Every substantive claim (graph or AI) carries a clickable `file:line` citation.
  AI answers that can't be grounded fall back to a cited graph answer and say so.

## 3. Collapse, resize & toggles — the user controls the space

The user owns their screen. Both side columns collapse, and the split between
the workspace and the conversation is draggable.

- **Both side panels collapse.** The navigator collapses from the top-bar
  two-pane icon; the inspector/chat collapses from a chevron on its own header.
  Collapsing either gives its width to the workspace. Collapse works at **every**
  width — on narrow single-column it collapses the section in place (height), not
  only on wide layouts. Collapse state **persists** across reloads.
- **The workspace ↔ conversation split is resizable.** A drag handle between the
  center and the right column lets the user widen chat (to read long answers) or
  widen the workspace (to read code). Honour a sensible min for each; persist the
  ratio. "You can expand the left but not the right" is a bug — both directions
  must work.
- **Segmented toggles** (Map / Source) switch center views. Active segment filled
  with the accent; inactive quiet. One toggle, one concept.
- A toggle/collapse/resize must only reflow the zones it targets. No surprise
  jumps elsewhere.

## 4. Density & legibility rules

- **No dead vertical space.** A panel's content fills its column from the top; it
  never floats in the middle of a tall empty box. Each pane is a single scroll
  region — you never have nested scroll traps or a short content block stranded
  with blank space above and below. If content is short, the panel is short (or
  top-aligned); it does not reserve a fixed tall frame it can't fill.
- **No walls of text.** Prose (graph facts, AI answers) is trimmed and
  structured — short lead sentence, then scannable cited lines. Long metadata
  paragraphs are broken into labelled rows, not a run-on paragraph the user must
  parse.
- **Sticky headers are opaque and above content.** Any sticky element (the Source
  file header, panel titles) has a solid background and a z-index above the
  scrolling body. Code/text must never bleed through a sticky header.
- **Code does not wrap by default.** COBOL is column-sensitive; the Source view
  keeps lines intact and scrolls horizontally when needed, rather than wrapping
  a statement onto the gutter. Wrapping is a last-resort fallback only on the
  narrowest phones.
- **Compact controls.** Default control height is 28px (30px for a primary
  action); segmented toggles 24–26px. Avoid full-width bulky buttons where a
  normal-width button reads fine — buttons are sized to their label, grouped, and
  quiet unless primary. Two big side-by-side buttons that dominate a panel are a
  smell; prefer a compact row.
- **No primary label truncates.** Ellipsis only for repeated secondary metadata
  (file paths in lists); the full value is one interaction away.
- **Code is readable first.** Monospace ~13px, dim line-number gutter, focused
  line highlighted with an accent rail, generous scrollable context.
- **No nested cards.** One border per region; inside, use type and spacing.
- **Feedback is local to its trigger.**
- **Disabled states explain themselves inline**, not only via title tooltips.

## 5. Visual tokens

Colors (dark, technical):
- App background `#0b0d10`; panels/toolbars `#11151a`; raised `#151a20`.
- Borders `#20262e` (structural), `#27303a` (subtle).
- Text: primary `#dbe3ea` / `#e7ebef`; secondary `#9aa6b2`; dim `#7d8996`.
- Accent (local / active / focus): `#66c2a5` → `#5aa7a1`; tinted fills use
  `rgba(90,167,161,0.12)` with border `rgba(90,167,161,0.5)`.
- Warning/guard: `#e8d796`. Error: `#ffb4a2`.
- Node-type colors come from `nodeColor()` and are the legend's source of truth;
  reuse them everywhere a type is shown (swatches, chips).

Type: system UI stack for chrome; monospace (`ui-monospace, SFMono-Regular,
Menlo, Consolas, monospace`) for code, file paths, and citations. Chrome text
12–14px; headings are 11–12px uppercase tracked labels.

Shape & motion: 6–8px radii on controls, 999px pills for status; 1px borders;
transitions ≤140ms; respect `prefers-reduced-motion`.

## 6. States (every surface defines all five)

- **Empty:** name the one action that fills it (e.g. "Open the sample to begin").
- **Loading:** say what's happening; show progress where the analyzer/model emits
  it.
- **Disabled:** inline reason.
- **Error:** the failed thing + the reason + the next command (copyable).
- **Success:** confirmed at the point of action.

## 7. Responsive tiers

- **≥1200px:** three zones side by side (navigator | workspace | conversation).
- **~900–1200px:** navigator collapses by default; workspace + conversation share
  the width; the navigator opens as an overlay/temporary column on toggle.
- **<900px:** one scrolling column, workspace-first (Map/Source toggle up top,
  large), then conversation, then a collapsed navigator the user can expand.
- The user must never be trapped in a layout they cannot navigate or widen.

## 8. AI / local model surface

- One AI status truth (the top-bar mode indicator + Settings). Graph answers need
  no model; AI is opt-in and quiet until configured.
- **Model selection is a picklist you can always see, not a memory test.** The
  installed-model list loads when Settings opens **and** on Refresh, shows a
  loading state while it fetches, and stays populated. The user must never be
  forced to type a model name they can read in their terminal. When the Ollama
  server is down, say so and how to start it (`ollama serve`) — never fall back to
  a blank field with no list.
- A text field remains only for genuinely custom/remote names, secondary to the
  picklist.
- Privacy is stated where it's meaningful: "Local: no code leaves" in local mode;
  explicit consent copy for cloud.

---

Adherence check for any UI PR: Does Source read like code (no wrap, opaque
header)? Does clicking evidence land on the exact line? Can BOTH side panels
collapse, at every width? Can the user drag to widen chat? Does any panel strand
content in blank space? Are buttons compact, not bulky? Is the installed-model
list visible without typing? If any answer is wrong, fix it before shipping.
