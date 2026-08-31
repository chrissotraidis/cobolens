# Large-Graph Performance Loop 5 — 2026-08-31

## Goal

Keep routine investigation responsive on the bundled AWS CardDemo graph (6,139 nodes and 14,008 edges), especially while changing focus, switching Map/Source, opening Ask, and asking graph-backed questions.

## Profile findings

The slowdown was cumulative rather than one isolated renderer defect:

1. Focus and inspector updates repeatedly filtered the complete edge list.
2. Building a visible graph slice copied full node and edge maps even though only a small neighborhood was rendered.
3. Selecting one relationship rebuilt the graphology slice and Sigma renderer just to change one edge color.
4. Ask path planning rebuilt a complete adjacency map for each candidate path, while the orientation answer nested whole-edge scans inside source-node loops.
5. A local semantic embedding job could start 250 ms after every graph load without a user asking for AI work.
6. Returning to a recently viewed source file repeated parsing/splitting work.

## Changes

- Added a graph-identity `WeakMap` index with node, incoming, outgoing, incident, and edge-key lookup tables.
- Reused that index in map focus, expansion counts, dependency panels, graph summaries, evidence, graph answers, and Ask path planning.
- Kept synthetic cluster nodes and edges in small overlay maps rather than copying the complete graph index per focus.
- Moved relationship selection styling to an in-place Sigma edge attribute update.
- Replaced full search-result sorting with a bounded top-result insertion pass.
- Added a 24-file source cache while retaining 240-line source pages.
- Made semantic indexing explicit through AI Settings instead of automatic background work.

## Measured result

`tools/m6-verify/graph-index-smoke.mjs` creates a graph matching CardDemo's node and edge counts and compares 500 dependency queries:

| Measure | Result on this development machine |
| --- | ---: |
| Initial graph index | 9–11 ms |
| Repeated whole-edge scans | 88–89 ms |
| Cached adjacency lookups | 0.25–0.32 ms |
| Observed lookup speedup | 280–350× |

These numbers cover the isolated graph lookup hot path, not total browser paint time or local-model generation. The live CardDemo replay confirmed sample load, CBACT01C → CBACT02C focus, Source → Map, and Ask opening all completed without the prior dead/unresponsive state. Browser-control latency is not reported as application render timing because its automation round trip dominates the measurement.

## Verification

- frontend TypeScript and production build
- graph-index performance/behavior smoke, including self-loop correctness and cache identity
- graph selector and graph summary smokes
- graph Ask and semantic retrieval smokes
- source reader and UI contract smokes
- live CardDemo browser replay at 6,139 nodes / 14,008 edges

## Remaining limit

This pass removes known main-thread algorithmic waste. It does not yet claim a packaged-desktop frame-time budget. Before release, capture a browser performance trace and a packaged Tauri trace during repeated focus changes and a cold source load; set a concrete p95 interaction target from those traces rather than from automation round-trip time.
