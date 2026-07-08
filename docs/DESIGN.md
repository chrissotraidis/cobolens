# Cobolens Design Contract

This is the UI contract for Cobolens. Use it before changing screens,
components, copy, layout, or visual tokens.

Cobolens is a local workbench for reading and understanding COBOL, copybooks,
and JCL. It should feel closer to an IDE plus a cited code assistant than a
dashboard. The user is usually under time pressure, trying to build trust in an
unfamiliar system. Every UI decision should answer:

> Does this help the user read the code and trust an answer about it?

If a change conflicts with this document, either change the design contract in
the same pull request or do not ship the change.

## 1. Product Shape

Preserve the three-zone workbench:

```text
Navigator | Workspace Map/Source | Inspector/Chat
```

- **Navigator:** find and orient.
- **Workspace:** read source or inspect the map.
- **Inspector/Chat:** ask questions, review facts, inspect dependencies.

Do not turn Cobolens into a dashboard, migration suite, code editor, hosted
workspace, or AI-first chat app. The graph/source model is the product.

## 2. Layout Rules

### Navigator

Purpose: project entry, search, codebase navigation, filters, and status.

The navigator is not the primary reading surface and not a settings console.
Keep it narrow, scannable, and collapsible.

Do:

- Put primary navigation above status.
- Keep the codebase tree easy to reach.
- Group secondary status into compact sections or accordions.
- Use node-type swatches consistently with the graph legend.
- Collapse on medium/narrow screens without trapping the user.

Don't:

- Stack ingest, search, filters, inventory, parse health, and hints as equal
  weight forever.
- Put AI setup or scan-setting forms in the navigator.
- Hide the codebase tree below a long wall of status blocks.
- Use full-width buttons for actions that fit in compact controls.

### Workspace

Purpose: the main reading and exploration surface.

The workspace is the largest zone. It toggles between **Map** and **Source**.
Source is where evidence lands. Map is how relationships are explored.

Do:

- Keep the Map/Source segmented control visible and compact.
- Bring Source forward when a citation, relationship source, or "View source" is
  clicked.
- Bring Map forward when the user chooses a graph exploration action.
- Give Source and Map stable dimensions; controls must not resize the canvas or
  code reader unexpectedly.

Don't:

- Make the graph the permanent centerpiece at the expense of source reading.
- Put Source in a cramped side dock.
- Let an inspector tab or chat state resize the workspace without explicit user
  action.

### Inspector / Chat

Purpose: answer, explain, and inspect the current selection.

The right column is a conversation and evidence column, not a miscellaneous
drawer. It must stay readable at normal desktop widths and collapsible when the
user wants more workspace.

Do:

- Keep Chat, Overview, Dependencies, and Source-related details task-oriented.
- Keep answers structured: short lead, scannable bullets, cited evidence.
- Keep Ask available while reading the answer.
- Let the user widen or collapse the column.

Don't:

- Resize unrelated panes when the user switches inspector tabs.
- Clear chat history or graph expansion just because the selection changed.
- Present AI output as more authoritative than graph/source evidence.

## 3. Selection And Evidence

There is one app-wide selection. Graph nodes, tree items, search results,
dependency rows, source links, and citations all update the same selected symbol.

Citations are the trust mechanism.

Required behavior:

- Clicking evidence opens Source in the workspace.
- The cited line is highlighted.
- The source toolbar or marker names the focused citation as `file:line`.
- The clicked answer or dependency context remains visible enough that the user
  understands why they landed there.
- AI answers that cannot pass citation guards fall back to a cited graph answer
  and say so plainly.

Do:

- Prefer exact `file:line` citations over vague references.
- Use citations in graph answers, AI answers, summaries, dependencies, parse
  warnings, and exports.
- Keep source jumps fast and obvious.

Don't:

- Make a citation scroll a hidden pane with no visible feedback.
- Show substantive claims without source or graph evidence.
- Auto-refocus the graph in a way that discards the user's expanded context
  unless the user explicitly chooses that focus.

## 4. Source Reader

COBOL is column-sensitive. Source readability is a product requirement, not
polish.

Do:

- Use monospace type around 13px.
- Keep line numbers dim but readable.
- Highlight the focused line with an accent rail or tint.
- Highlight the selected symbol's line range subtly; the exact citation line must
  remain stronger and separately marked.
- Preserve line integrity; horizontal scroll beats wrapping.
- Use an opaque sticky toolbar/header when sticky elements are needed.
- Keep file navigation visible, with the current file and line range clear.
- Design current snippet behavior so it can grow into full-file virtualized
  reading later.

Don't:

- Wrap source by default.
- Let source text bleed through sticky headers.
- Hide the selected symbol inside a tiny keyhole without context.
- Use decorative cards around code.

Future source-reader work should move toward full-file reading,
jump-to-definition, and references without breaking the current citation flow.

## 5. Graph And Dependencies

The graph is a focused relationship lens, not a full-graph hairball.

Do:

- Start from a focus node.
- Show direct relationships first.
- Use expansion deliberately and preserve expansion when reasonable.
- Keep visible node controls keyboard-accessible.
- Explain relationships close to where the user clicked.
- Use the same node colors in graph labels, legend, chips, and lists.

Don't:

- Render every node by default.
- Use disabled "complete" controls when there is nothing to expand.
- Clip essential toolbar controls at narrow widths.
- Let edge labels or dependency descriptions become paragraph walls.

## 6. Chat, Overview, And AI

Graph answers work without AI. AI is optional and opt-in.

Do:

- Lead with graph-grounded answers when the graph can answer the question.
- Label graph, local AI, and cloud AI routes honestly.
- Keep model setup in Settings.
- Stream long local model answers when implemented.
- Keep Stop available during model calls.
- Run citation guards on final AI text.
- Explain local failures with the next useful action, such as `ollama serve`.

Don't:

- Require AI for navigation, source inspection, graph Ask, or export.
- Send code to cloud providers without explicit user setup.
- Treat a slow local model as a silent hang.
- Hide embedding failures by pretending semantic retrieval ran.

## 7. Density, Hierarchy, And Copy

Cobolens should be dense enough for repeated engineering work and calm enough to
scan under pressure.

Do:

- Use compact controls: 28px default, 30px primary, 24-26px segmented toggles.
- Use headings as small labels, not marketing headlines.
- Prefer rows, sections, and lists over nested cards.
- Keep panel content top-aligned.
- Put feedback near the action that caused it.
- Make disabled states explain themselves inline.
- Keep copy concrete: "Open sample", "No matching graph symbols", "Ollama server
  is not reachable".

Don't:

- Use hero sections, decorative cards, marketing panels, or empty illustration
  space.
- Strand a short panel in a tall blank frame.
- Create nested scroll traps.
- Use vague copy like "Something went wrong" without a next step.
- Truncate primary labels. Truncate only repeated secondary metadata, with the
  full value available by tooltip, title, or detail row.

## 8. Visual Tokens

The current visual language is dark, technical, and restrained. Refine it; do
not replace it casually.

Colors:

- App background: `#0b0d10`
- Panels/toolbars: `#11151a`
- Raised surfaces: `#151a20`
- Structural border: `#20262e`
- Subtle border: `#27303a`
- Primary text: `#dbe3ea` / `#e7ebef`
- Secondary text: `#9aa6b2`
- Dim text: `#7d8996`
- Accent/local/focus: `#66c2a5` to `#5aa7a1`
- Accent tint: `rgba(90,167,161,0.12)`
- Accent border: `rgba(90,167,161,0.5)`
- Warning/guard: `#e8d796`
- Error: `#ffb4a2`

Type:

- Chrome: system UI stack.
- Code, file paths, citations: `ui-monospace, SFMono-Regular, Menlo, Consolas,
  monospace`.
- Chrome text: 12-14px.
- Section labels: 11-12px uppercase, modest tracking.
- Do not scale font size with viewport width.

Shape and motion:

- Controls: 6-8px radius.
- Status pills: 999px radius.
- Borders: 1px.
- Transitions: 140ms or less.
- Respect `prefers-reduced-motion`.

Node-type colors come from `nodeColor()` and are the source of truth for graph
semantics.

## 9. States

Every meaningful surface defines these states:

- **Empty:** name the one action that fills it.
- **Loading:** say what is happening; show progress when available.
- **Disabled:** explain why and how to enable it.
- **Error:** name the failed action, reason, and next step.
- **Success:** confirm near the action, then get out of the way.

Examples:

- Empty workspace: "Open the sample to begin."
- No search result: "No matching graph symbols. Source text search is not
  implemented yet."
- Local AI down: "Ollama is not reachable. Start it with `ollama serve`."
- Export success: show the exported file names or destination.

## 10. Responsive Behavior

The user must never be trapped in a layout they cannot navigate, widen, or
collapse.

Tiers:

- **1200px and up:** navigator, workspace, and inspector side by side.
- **900-1199px:** navigator may collapse by default; workspace and inspector
  share the width.
- **Under 900px:** one scrolling column, workspace first, then inspector/chat,
  then navigator access.

Required behavior:

- Both side panels collapse at every width.
- Collapse state persists.
- The workspace/inspector split is draggable on widths where columns sit side by
  side.
- Narrow layouts keep Map/Source controls visible.
- Source keeps readable code and horizontal scroll.
- No pane collapses to zero because of grid overflow.

## 11. Accessibility

Accessibility is part of the workbench contract.

Do:

- Provide landmarks for the major zones.
- Keep skip links for keyboard users.
- Preserve visible focus rings.
- Use named buttons for icon-only controls.
- Keep graph visible-node controls keyboard-accessible.
- Ensure citations, dependency rows, and source jump controls are buttons or
  links with useful labels.
- Do not rely on color alone for status or node type.

Don't:

- Hide essential controls behind hover-only affordances.
- Use icon buttons without labels or tooltips.
- Break tab order when panes collapse.
- Treat static source grep checks as proof of accessible runtime behavior.

## 12. Verification Expectations

UI changes must be verified in the running app, not only by reading code.

Minimum for most UI changes:

- Launch the browser preview.
- Open the sample.
- Select a symbol from the navigator.
- Switch Map and Source.
- Ask a graph-backed question.
- Click an evidence citation and confirm Source highlights the right line.
- Resize the window.
- Collapse both side panels.
- Drag the workspace/inspector divider when available.

Automated checks should prove behavior where practical. Source-grep smokes are
allowed for stable contracts, but they are not a substitute for a driven browser
smoke of the core loop.

## 13. PR Checklist

Before merging a UI change, answer yes to each relevant item:

- Does the change preserve Navigator | Workspace | Inspector?
- Does Source still read like code: no default wrap, clear line numbers, opaque
  sticky chrome?
- Does clicking evidence open Source and highlight the exact cited line?
- Can both side panels collapse at the tested widths?
- Can the user widen chat or workspace without surprise layout jumps?
- Does Ask avoid discarding graph expansion unless the user chooses to refocus?
- Are controls compact and labels untruncated?
- Are empty, loading, disabled, error, and success states handled?
- Are icon-only controls named?
- Did the relevant smoke checks pass?
- Did someone verify the changed flow in the browser or desktop app?

If an answer is no, fix the UI, update this contract deliberately, or document
the debt in `docs/tech-debt.md`.
