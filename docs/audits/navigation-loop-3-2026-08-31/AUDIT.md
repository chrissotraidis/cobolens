# Navigation Goal Loop 3 — 2026-08-31

Target: `http://127.0.0.1:1420/`

Goal: make a realistic CardDemo investigation coherent at a constrained
desktop width: focus a program without surprise, move between Map and Source
without mounting both expensive views, find one file among 152, understand what
a graph selection did, and reach Dependencies or Ask without hunting for an
unlabeled panel toggle.

## Flow evidence

| Step | Flow | Health | Output |
| ---: | --- | --- | --- |
| 1 | Windowed CardDemo baseline with Inspector hidden, long rail, and no visible Ask destination | Needs work | [01-windowed-map-inspector-hidden.png](screenshots/01-windowed-map-inspector-hidden.png) |
| 2 | CBACT02C baseline Source view with a flat 152-file native selector | Needs work | [02-cbact02-source-flat-selector.png](screenshots/02-cbact02-source-flat-selector.png) |
| 3 | Native selector opened; the browser capture API cannot include the operating-system menu overlay | Capture-limited; user screenshot retained as issue evidence | [03-source-selector-open.png](screenshots/03-source-selector-open.png) |
| 4 | Selected-symbol action bar, labeled Ask entry, compact rail, and explicit relationship expansion | Healthy | [04-windowed-map-context-actions.png](screenshots/04-windowed-map-context-actions.png) |
| 5 | CBACT02C Source after explicit `Open source`; only Source is mounted | Healthy | [05-cbact02-source-redesigned.png](screenshots/05-cbact02-source-redesigned.png) |
| 6 | Lazy grouped file switcher over the 152-file inventory | Healthy | [06-source-file-switcher.png](screenshots/06-source-file-switcher.png) |
| 7 | Source switcher filtered directly to CBACT03C | Healthy | [07-filtered-source-switcher.png](screenshots/07-filtered-source-switcher.png) |
| 8 | The 924-line CBSTM03A file rendered as a 240-line page with explicit paging | Healthy | [08-large-source-paging.png](screenshots/08-large-source-paging.png) |
| 9 | Dependencies opened directly from the selected-symbol bar | Healthy | [09-map-dependencies-inspector.png](screenshots/09-map-dependencies-inspector.png) |
| 10 | Ask opened in context with CBSTM03A and a ready plain-English prompt | Healthy | [10-map-ask-inspector.png](screenshots/10-map-ask-inspector.png) |

## Results

### Navigation and performance

| Interaction | Baseline behavior | Result in the live development replay |
| --- | --- | ---: |
| Choose CBACT02C in Codebase | Silently switched to Source and appeared stalled | Map focus retained; selected actions visible; 939 ms |
| Open selected program source | Map and full Source tree remained mounted together | Source mounts on demand; 795 ms |
| Switch from CBACT02C to CBACT03C | Scan a 152-option native menu | Search to one result; 651 ms |
| Read CBSTM03A | Render all 924 source rows | Render the relevant 240-line page; 642 ms to open |

The measurements include in-app browser interaction overhead and local
development rendering; they are comparative UX evidence, not packaged-app
benchmarks. The structural fixes remove the clear sources of scale-dependent
work: Sigma no longer builds while Source is active, Source rows no longer
mount while Map is active, the file list only renders when opened, and long
files render one bounded page.

### Interaction contract

- Codebase items now focus the map. Guided trace stops still open exact source
  because their labels explicitly promise inspection.
- Every focused map symbol exposes `Open source`, `Dependencies`, and
  `Ask about this` in one stable bar.
- Relationship expansion says `More relationships +N`, describing both the
  action and the amount of hidden context.
- The top bar uses a labeled `Ask` action; the Inspector has a visible `Close`.
- The Cobolens brand invokes the same root-map reset as Home.
- Source no longer highlights an entire large file as if every line were a
  meaningful selection. Broad program ranges use the focused-line marker;
  short ranges retain selection highlighting.
- Programs, Copybooks, and JCL form a one-group-at-a-time accordion. Parse
  Health and Graph Hints stay closed until requested.

## Remaining limits

1. **P1 — Packaged performance remains a separate gate.** The replay proves
   that the development UI no longer performs the known eager work. Cold load
   and interaction timing must still be measured in a packaged desktop build.
2. **P2 — Dense expanded maps remain dense.** `More relationships` is explicit,
   but expanding hundreds of edges still prioritizes completeness over label
   legibility. Dependencies is the reliable list view for that case.
3. **P2 — The native menu baseline cannot be recaptured exactly.** The in-app
   browser screenshot API excludes operating-system select overlays; the user's
   supplied screenshot remains the direct visual evidence for that defect.
4. **P2 — Parser fallback warnings remain real.** CardDemo still exposes the
   recorded dialect gaps from the prior hardening loop. This navigation work
   does not relabel them as clean parses.

## Verification

- `npm run build`
- `node tools/m6-verify/ui-contract-smoke.mjs`
- `node tools/m6-verify/sample-library-smoke.mjs`
- `node tools/m6-verify/semantic-retrieval-smoke.mjs`
- `node tools/m6-verify/source-reader-smoke.mjs`
- `node tools/m6-verify/accessibility-smoke.mjs`
- Live in-app browser at 1100×760: CBACT02C focus, explicit Source open,
  CBACT03C filtered source switch, CBSTM03A paging, Dependencies, Ask, and
  brand/Home reset.
