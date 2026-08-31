# Ask and Inspector Goal Loop 4 — 2026-08-31

Target: `http://127.0.0.1:1420/`

Scope: the windowed-width path from opening Ask, understanding the current
selection, choosing an answer route, and returning to the map.

## Flow evidence

| Step | Flow | Health | Output |
| ---: | --- | --- | --- |
| 1 | Baseline Ask state: long investigation report above the composer | Needs work | [01-ask-open-baseline.png](screenshots/01-ask-open-baseline.png) |
| 2 | Baseline Ask closed: the map remains at 58vh and leaves half the app blank | Broken | [02-ask-closed-baseline.png](screenshots/02-ask-closed-baseline.png) |
| 3 | Baseline answer settings: a routing choice expands into a second instructional screen | Needs work | [03-answer-settings-baseline.png](screenshots/03-answer-settings-baseline.png) |
| 4 | Redesigned Ask: compact context, primary composer, distinct Ask color, overlay drawer | Healthy | [04-ask-drawer-redesigned.png](screenshots/04-ask-drawer-redesigned.png) |
| 5 | Ask closed through the same top-bar toggle; map keeps the full viewport | Healthy | [05-ask-closed-full-map.png](screenshots/05-ask-closed-full-map.png) |
| 6 | Answer route embedded as a small composer popover | Healthy | [06-answer-route-popover.png](screenshots/06-answer-route-popover.png) |
| 7 | Context and evidence opened only when requested | Healthy | [07-context-evidence-open.png](screenshots/07-context-evidence-open.png) |

## Findings and decisions

1. **Ask had two competing entry points.** The top-bar control only opened the
   Inspector, while a distant `Close` action closed it. The top-bar control now
   toggles Ask and exposes `Open Ask` / `Close Ask` labels and pressed state.
2. **Responsive stacking broke the workspace.** At 803×900, closing the stacked
   Inspector left the map at 58vh with empty space below. Navigator and Inspector
   are now fixed overlay drawers at widths up to 1024px. The canvas stays full
   height and does not reflow when Ask toggles.
3. **The context report competed with the question.** The repeated workflow
   sentence, three actions, AI readiness pill, paragraph, citations, suggestions,
   and project tools all appeared before the composer. The default context is now
   one compact header, two actions, two suggestions, and a collapsed evidence row.
4. **Answer settings were over-explained in the task flow.** Route selection now
   lives in the composer footer. Its popover closes after a selection and shows
   only the currently useful route description. Settings retains the complete
   explanation of graph, Local AI, and semantic retrieval.
5. **Closed Inspector work continued invisibly.** The Inspector now unmounts
   while closed, so evidence and conversation components do not rerender during
   ordinary map navigation.
6. **Ask looked like another teal workspace action.** Periwinkle now identifies
   conversation consistently in the top bar, Inspector tab, selected-symbol
   action, suggested questions, and route control. Teal remains graph/source
   focus; amber remains model activity.

## Accessibility notes

- Ask retains a button pressed state and now names both actions explicitly.
- The Inspector retains a visible Close action for users working inside the drawer.
- Context and route controls use native disclosure elements with keyboard behavior.
- Route options remain named buttons with pressed state.
- The audit confirms visible hierarchy and named controls; it does not claim full
  screen-reader or zoom conformance without platform assistive-technology testing.

## Verification

- `npm run build`
- `node tools/m6-verify/ui-contract-smoke.mjs`
- `node tools/m6-verify/accessibility-smoke.mjs`
- `node tools/m6-verify/ask-focus-smoke.mjs`
- `node tools/m6-verify/model-chat-contract-smoke.mjs`
- Live in-app browser at 803×900: open Ask, close Ask, reopen Ask, switch to Graph
  route, open context evidence, and confirm the canvas remains full-height.
