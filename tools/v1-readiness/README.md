# V1 Readiness Sweep

Run:

```sh
npm run v1:readiness
```

This is an umbrella check for the local v1 evidence trail. It first runs fast
report-contract and PRD-coverage smokes, always runs the current required
`m6:verify` suite, then attempts optional gates only when their local
prerequisites exist:

- cached COBOL Legacy Benchmark Suite under `.cache/benchmarks/`;
- local Ollama for the configured small-model readiness, grounded Summary
  smoke, and grounded Ask smoke;
- built Linux AppImage plus a desktop display for packaged GUI smoke.

Optional gates report `passed`, `failed`, or `skipped` in the final JSON report.
Only required-gate failure exits non-zero. The final `ready` field is stricter:
it is true only when required gates pass and optional evidence has no failures
or skips. This keeps the command useful across developer machines without
turning absent local tools into fake product failures.

The PRD-coverage smoke checks `docs/v1-readiness-audit.md`, which maps FR-1
through FR-32 to current evidence and explicitly calls out partial or unclaimed
areas such as Windows packaging and non-certified accessibility evidence.
