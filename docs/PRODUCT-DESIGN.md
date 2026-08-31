# Cobolens Product Design

## Product Thesis

**Trace the system. Prove every answer.**

Cobolens is an evidence-first investigation desk for unfamiliar COBOL systems. It is not an IDE with a chatbot attached and it is not a dashboard of parser internals. The product should help one engineer move from uncertainty to a source-backed explanation without losing their place.

The primary product loop is:

1. **Orient** — choose a job, program, copybook, dataset, or search result.
2. **Trace** — follow its direct dependencies and data flow in the map.
3. **Prove** — open the exact relationship or cited source lines.
4. **Explain** — ask in the current context; AI may synthesize, but graph and source remain authoritative.
5. **Carry forward** — export the investigation as useful documentation.

Every screen and control should advance one of those steps.

## Personality

Cobolens should feel like a quiet night desk for technical investigation: calm, precise, archival, and humane. It should not feel like a neon hacker console, an enterprise monitoring wall, or a generic AI assistant.

- **Calm:** progressive disclosure instead of every capability at once.
- **Precise:** concrete relationship names, paths, source ranges, and status copy.
- **Evidence-first:** source proof is close to every explanation.
- **Private by default:** graph-only work is useful; model use is explicit and honestly labeled.
- **Respectful of legacy code:** the interface clarifies the system without treating it as obsolete or broken.

## Interface Grammar

### Type

- Use the system sans-serif for navigation, guidance, answers, and controls.
- Use monospace only for source code, symbol names, paths, and source locations.
- Default body copy should be comfortably readable at 14–15px.
- Compact labels may be 12–13px; avoid tiny all-caps prose.

### Color

- **Teal:** focus, selected evidence, and local/private state.
- **Periwinkle:** Ask, conversation, and explanation entry points.
- **Amber:** model work in progress or a state that needs review.
- **Coral:** actionable failure or risk.
- **Neutral ink:** the dominant frame so source and graph remain visually primary.

Color must reinforce a labeled state; it must never be the only carrier of meaning.

### Surfaces and controls

- Prefer one clear pane surface over stacked bordered cards.
- Use spacing and typography for hierarchy before adding another border.
- Give each view one obvious next action.
- Keep secondary mechanics behind disclosure controls.
- Use buttons for actions, links for navigation, and status chips only for status.

## Workspace Model

The desktop workspace is three coordinated areas:

- **Navigator — Orient:** project contents, search, guided sample trace, filters, and scan health.
- **Canvas — Trace and Prove:** dependency map or cited source, with direct switching between them.
- **Inspector — Explain:** a composer-first Chat view and a compact Dependencies view.

Conversation belongs inside the Inspector as the continuation of investigation. It should never become a detached chat destination. The current selection is the conversation context; answers retain their cited original context.

Chat follows a composer-first hierarchy:

- the top-bar Chat control is a real open/close toggle with a distinct conversation color;
- the selected symbol appears as a compact context header, not a second report;
- source and optional local explanation are secondary context actions;
- suggested questions wrap into readable rows instead of becoming a hidden horizontal strip;
- graph facts and citations are collapsed under `Context & evidence` until requested;
- answer routing lives inside the composer as an `Auto`, `Graph`, or `Local AI` menu;
- the full explanation of answer architecture belongs in Settings, not in the conversation flow.

The workspace has stable navigation rules:

- choosing a codebase item changes map focus; it does not silently change modes;
- the selected-symbol bar always offers `Open source`, `Dependencies`, and `Chat about this`;
- the labeled `Chat` action in the top bar remains visible when the Inspector is closed;
- choosing the Cobolens brand or Home returns to the root map focus;
- Source uses a lazy, grouped, searchable file switcher rather than a flat native list;
- long source files render in bounded pages while citation jumps open the page containing the cited line.

Large-system interactions have an equally stable performance contract:

- index graph nodes and adjacency once per loaded graph; focus, dependency, and context updates must not rescan every edge;
- changing a selected relationship restyles the existing Sigma edge instead of rebuilding the renderer;
- Map, Source, Navigator, and Chat mount only the work visible in the current state;
- source files reuse a bounded in-memory cache and still render in bounded pages;
- local embeddings never start as hidden background work after a project loads; semantic preparation is an explicit AI action;
- validate these rules against CardDemo-scale data, not only the compact teaching fixture.

## State Design

### First run

One central welcome state explains the promise and presents two choices: import a project or explore samples. The sample library should make scenario, scale, provenance, and the behavior being exercised clear before loading. It progresses from a quick teaching fixture to real public systems; it is not a gallery of disconnected toy files. Do not repeat setup instructions in all three panes.

### Sample library

Samples are product onboarding and parser hardening in the same surface:

- every entry states its scale and investigation purpose;
- public code retains its license, repository, and pinned source revision;
- source is available offline so every guided stop can reach proof;
- parser fallback warnings remain visible in Parse Health;
- each scenario supplies a short trace that gives the user an anchor before open exploration;
- large inventories preview a small, useful set per source group and expand only on request;
- switching samples must be safe from Map or Source, including long source files and large graphs.

### Selected symbol

Lead with a plain-language graph brief, then the few actions that matter: inspect source, ask in context, and inspect dependencies. Evidence is visible but compact.

Selection must visibly change the symbol name and action bar. A graph click is
not complete if the only feedback is a brighter node. Opening source is an
explicit action so orientation on the map is never lost by surprise.

### Model work

Show one calm progress surface with the useful current stage and elapsed time. Do not expose a speculative multi-step pipeline that can disagree with reality. The map and source remain usable while a model works.

### Failure

Say what failed, what still works, and the smallest recovery action. Never imply that missing AI makes the graph unusable.

### Small screens

Treat panes as modes, not as a long desktop layout stacked vertically. Preserve readable type and touch targets; hide secondary desktop controls before shrinking them.

At tablet and windowed widths, Navigator and Inspector are overlay drawers over
the full-height canvas. Opening or closing Chat must not resize Sigma or leave an
empty lower half of the application. At phone widths, the Inspector becomes a
full-width drawer below the two-row top bar.

## Product Review Questions

Use these questions for every goal-based loop:

1. Can a new user state what Cobolens is for within ten seconds?
2. Is there one obvious next action in the current state?
3. Does the selected graph/source context remain visible while asking and reading an answer?
4. Can every important explanation be traced to exact evidence?
5. Does optional AI feel subordinate to the evidence workflow?
6. Is body text comfortable without zooming?
7. Are repeated guidance, duplicate relationships, and internal implementation details removed or collapsed?
8. Does the same journey remain coherent at desktop and compact widths?
9. Does the sample library still expose at least one realistic parser or scale boundary instead of only curated success cases?
10. Does the current action stay proportional to the visible slice, or does it accidentally rescan/rebuild the whole project?
