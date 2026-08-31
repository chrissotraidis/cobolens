# Hardening Goal Loop 2 — 2026-08-31

Target: `http://127.0.0.1:1420/`

Goal: make the realistic sample journey fast and navigable, use the pinned
public corpora to remove reproducible parser noise, then replay the complete
sample, map, source, and compact-width experience as a new user.

## Flow evidence

| Step | Flow | Health | Output |
| ---: | --- | --- | --- |
| 1 | CardDemo baseline: 272 inventory controls and 5.1–5.6 second local load | Needs work | [01-carddemo-long-inventory-baseline.png](screenshots/01-carddemo-long-inventory-baseline.png) |
| 2 | CardDemo after bounded semantic preparation and grouped 12-item previews | Healthy | [02-carddemo-collapsed-inventory.png](screenshots/02-carddemo-collapsed-inventory.png) |
| 3 | Same-viewport baseline/result comparison | Healthy | [03-carddemo-before-after.png](screenshots/03-carddemo-before-after.png) |
| 4 | Large focused map at 430×820 | Healthy | [04-carddemo-compact.png](screenshots/04-carddemo-compact.png) |
| 5 | Four-scenario chooser at 430×820 | Healthy; intentionally scrollable | [05-sample-library-compact.png](screenshots/05-sample-library-compact.png) |
| 6 | Guided CardDemo stop opens the exact 924-line COBOL source | Healthy | [06-carddemo-guided-source.png](screenshots/06-carddemo-guided-source.png) |
| 7 | Regenerated z/OS Connect map after comment/literal noise removal | Healthy with one recorded syntax warning | [07-zosconnect-clean-map.png](screenshots/07-zosconnect-clean-map.png) |

## Results

### Large-project load and navigation

| Measure | Baseline | Result |
| --- | ---: | ---: |
| CardDemo time to usable map in the local development browser | 5.1–5.6 s | 0.82 s |
| Initially mounted source-tree controls | 272 | 13 |
| Visible entries in an expanded source group | All | 12 plus `Show more` |

The performance defect was eager semantic preparation, not the size of the
sample response. The initial render built relationship text for every
source-backed node by rescanning the complete edge list. Semantic preparation
now stops at the 160 chunks it can use and indexes incident edges once. The
source tree independently uses progressive disclosure, keeps the selected item
visible, and opens a hidden group when a guided stop or search selects it.

A full live replay switched safely through all four samples. Recorded load
times after the optimization were 696 ms (quick tour), 334 ms (IBM batch), 356
ms (z/OS Connect), and 778 ms (CardDemo). The map returned from Source for every
switch, and CardDemo guided stops opened both COBOL and JCL source successfully.

### Public-corpus parser regression

| Scenario | Before | After | Change |
| --- | ---: | ---: | ---: |
| Customer report batch | 306 nodes / 1,103 edges | 286 / 979 | −20 / −124 |
| Claims API requester | 216 nodes / 328 edges | 188 / 263 | −28 / −65 |
| CardDemo system | 6,339 nodes / 14,657 edges | 6,139 / 14,008 | −200 / −649 |

The removed artifacts came from fixed/free-format comment statements, words
inside quoted display literals, literal `MOVE` sources modeled as data items,
and CICS `READ FILE(...)` being interpreted as a dataset named `FILE`. The
regression keeps genuine quoted calls and the CICS file operand. The quick-tour
fixture remains unchanged at 28 nodes and 33 edges.

All 190 files still produce usable graph/source output. The 31 existing
tree-sitter fallback warnings are unchanged and stay visible in Parse Health.

## Remaining limits

1. **P1 — Dialect coverage still falls back.** Seven IBM batch files, one z/OS
   Connect file, and 23 CardDemo files contain constructs the tree-sitter check
   does not accept. The lightweight scanner keeps them usable, but Cobolens is
   not yet a full IBM semantic analyzer.
2. **P2 — The Source file switcher is flat.** CardDemo exposes 152 options in a
   native select. Search and the grouped navigator are faster, but the switcher
   itself will eventually benefit from filtering or grouping.
3. **P2 — Compact scenario choice scrolls.** At 430×820, the first two sample
   cards are immediately readable and later scenarios sit below the fold. This
   is reasonable for four entries; a larger library will need filtering.
4. **P2 — Timing is local-development evidence.** The 0.82-second result is a
   repeatable browser flow with local static assets. Packaged desktop startup
   and first-launch disk-cache behavior remain separate release gates.

## Verification

- `cargo fmt --manifest-path sidecar/cobolens-analyze/Cargo.toml`
- `cargo test --manifest-path sidecar/cobolens-analyze/Cargo.toml` — 9 passed
- `cargo build --manifest-path sidecar/cobolens-analyze/Cargo.toml`
- `npm run samples:build`
- `npm run build`
- `node tools/m6-verify/sample-library-smoke.mjs`
- `node tools/m6-verify/semantic-retrieval-smoke.mjs`
- `node tools/m6-verify/source-reader-smoke.mjs`
- `node tools/m6-verify/ui-contract-smoke.mjs`
- `node tools/m6-verify/accessibility-smoke.mjs`
- Live in-app browser: all sample switches, grouped inventory preview/expand,
  hidden-group guided selection, Map/Source proof, 1280×720, and 430×820.
