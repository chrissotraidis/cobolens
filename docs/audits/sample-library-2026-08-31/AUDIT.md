# Sample Library Product Audit — 2026-08-31

Target: `http://127.0.0.1:1420/`

Goal: replace the single toy-sample action with a graduated offline library,
then use realistic public projects to test selection, graph scale, source proof,
parser health, sample switching, and compact-width behavior as a new user.

## Flow evidence

| Step | Flow | Health | Output |
| ---: | --- | --- | --- |
| 1 | Baseline first run with one ambiguous Sample action | Needs work | [01-baseline-first-run.png](screenshots/01-baseline-first-run.png) |
| 2 | Desktop sample chooser with four explained scenarios | Healthy | [02-sample-library.png](screenshots/02-sample-library.png) |
| 3 | CardDemo focused map after a guided source jump | Usable; cold-load follow-up | [03-carddemo-map.png](screenshots/03-carddemo-map.png) |
| 4 | Sample chooser at 430×820 | Healthy; intentionally scrollable | [04-sample-library-430x820.png](screenshots/04-sample-library-430x820.png) |
| 5 | Matched 917×900 first-run result | Healthy | [05-final-first-run.png](screenshots/05-final-first-run.png) |
| 6 | Matched before/after first-run comparison | Healthy | [06-first-run-before-after.png](screenshots/06-first-run-before-after.png) |
| 7 | IBM batch/report sample with visible parser health | Healthy with recorded warnings | [07-ibm-batch-map.png](screenshots/07-ibm-batch-map.png) |
| 8 | z/OS Connect API Requester sample | Healthy with one recorded warning | [08-zosconnect-map.png](screenshots/08-zosconnect-map.png) |
| 9 | Four-file guided quick tour | Healthy | [09-quick-tour-map.png](screenshots/09-quick-tour-map.png) |

## What the realistic samples exposed

### Fixed during the loop

1. **P0 — Switching from Source could blank the app.** Replacing a loaded
   graph while a long source file and the sample dialog unmounted in one event
   could produce a React `removeChild` failure. Sample loading now keeps the
   current graph mounted during fetch, moves the workspace to Map, then swaps
   in the ready graph before closing the chooser.
2. **P1 — Guided Trace looked present but was not clickable.** The native
   `<details>` grid item collapsed to two pixels inside the scrolling navigator;
   content overflowed visually while hit testing landed on the parent. The
   guide now uses max-content sizing, and each stop resolves against the loaded
   graph before it is enabled.
3. **P1 — Desktop samples could not use bundled browser source.** Tauri source
   reads previously preferred the display label as a filesystem root. Sample
   source bundles now take precedence, so the same graph/source assets work in
   browser and desktop shells.
4. **P2 — “Sample” gave no sense of choice or purpose.** It is now `Samples`
   and opens a library that states scenario, scale, file/node count, subsystem
   focus, license, and the exact action.

### Still open

1. **P1 — Cold large-sample load is noticeable.** CardDemo took about five
   seconds in the local development browser on this pass. The chooser remains
   visible with an `Opening…` state and the previous graph stays usable, but a
   production-mode timing profile is still needed.
2. **P1 — Real-code parser precision is uneven.** The public corpora produce 31
   fallback warnings and several false-positive external dataset/table/program
   names. All 186 files remain usable, and Parse Health exposes the warnings;
   parser improvement should now use these pinned corpora as regressions.
3. **P2 — Large inventory navigation is long.** CardDemo has 272 source-backed
   program/copybook/JCL entries in the left rail. Search works, but group
   disclosure or result limiting would make browsing faster for a new user.
4. **P2 — Compact selection requires scrolling.** At 430×820, cards retain
   readable type and complete actions but the third and fourth scenarios sit
   below the fold. This is acceptable for four entries; the library will need
   filtering before it grows much further.

## Verification

- `npm run build`
- `node tools/m6-verify/sample-library-smoke.mjs`
- `node tools/m6-verify/source-reader-smoke.mjs`
- `node tools/m6-verify/ui-contract-smoke.mjs`
- `node tools/m6-verify/accessibility-smoke.mjs`
- Live in-app browser: chooser, all four scenarios, guided stops, full source,
  source-to-sample switching, 6,339-node map, and 430×820 layout.
