# Parser Corpus Benchmark

Date: 2026-07-09

## Reproduce

```sh
npm run benchmark:corpora:setup
npm run benchmark:corpora
```

The setup command clones three pinned public repositories under the gitignored
`.cache/benchmarks/` directory. The benchmark writes per-corpus and aggregate
JSON reports under `.cache/benchmark-reports/`. Thresholds are versioned in
`tools/benchmark-validation/expectations/`.

## Baseline

| Corpus | Revision | Files | Scan coverage | Syntax-clean | Nodes | Edges | Cited edges | Local time |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| COBOL Legacy Benchmark Suite | `c4d72b4` | 77 | 100% | 48.1% | 1,687 | 2,698 | 100% | 185 ms |
| IBM Z Open Editor sample | `41f7055` | 23 | 100% | 69.6% | 306 | 1,103 | 100% | 67 ms |
| dscobol Cobol-Projects | `2cc0510` | 204 | 100% | 41.2% | 2,298 | 8,580 | 100% | 703 ms |

All 304 discovered COBOL, copybook, and JCL files completed the forgiving
lightweight scan. There were no fatal file failures. The combined graph
contains 12,381 relationships, all with file and line evidence.

The suite covers fixed and free-form COBOL, standalone copybooks, JCL jobs,
steps and DDs, DB2 SQL, CICS in the legacy suite, file reads/writes, data
moves, calls, performs, and imperfect source. A dscobol file containing pasted
zero-width Unicode formatting marks exposed a tree-sitter stall; the syntax
pass now removes those invisible marks and has a bounded timeout, while leaving
source text and the lightweight scan intact.

## Honest Limits

- `Syntax-clean` is an advisory tree-sitter fidelity measure, not scan
  coverage. Standalone copybooks such as
  `src/copybook/batch/BCHCON.cpy` are not full COBOL compilation units and are
  commonly flagged even though their definitions and COPY relationships are
  indexed.
- Dialect constructs still produce recoverable syntax warnings. Examples
  include `COBOL/SAM1.cbl:34` in IBM's sample and
  `Extra-Stuff/Blue/test.cbl:7` in dscobol. The report keeps file, line, and
  reason so this is visible rather than silently treated as a clean parse.
- A dynamic `CALL` target is represented by the following source token as an
  external program. Cobolens does not evaluate working-storage values to
  resolve the runtime target.
- `COPY ... REPLACING` records the copybook dependency but does not expand and
  substitute copybook text into the calling program's syntax tree.
- Encoding is selected per scan. Mixed UTF-8 and EBCDIC repositories require
  separate scans today.
- Files larger than the analyzer's 16 MiB source safety limit and extensions
  outside the configured COBOL/JCL set are not part of the discovered-file
  denominator.

These limits are why the release claim is "forgiving dependency scan with
source evidence," not compiler-grade validation or complete runtime call
resolution.
