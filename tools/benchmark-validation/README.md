# Benchmark Validation

The PRD names the COBOL Legacy Benchmark Suite and IBM zopeneditor sample as release validation targets. They are not bundled in this repo.

Run this helper after placing a benchmark checkout on disk:

```sh
npm run validate:benchmark -- --root /path/to/COBOL-Legacy-Benchmark-Suite
```

Write an auditable report with:

```sh
npm run validate:benchmark -- \
  --root /path/to/COBOL-Legacy-Benchmark-Suite \
  --report .cache/benchmark-reports/legacy-benchmark-report.json \
  --graph .cache/benchmark-reports/current-graph.json
```

If the benchmark is cloned to the default ignored cache location, use:

```sh
npm run validate:benchmark:local
```

The script runs the current analyzer sidecar through the stable
`GraphDocument` contract. It intentionally does not download large corpora or
claim validation when the benchmark is absent.

The validator checks the pieces that matter for the PRD v1 acceptance criteria:

- the graph schema is valid and non-empty;
- parsing is forgiving: parse failures are listed with file and reason instead
  of aborting the whole run;
- every edge references existing graph nodes;
- citation sites are structurally valid when present;
- benchmark-scale semantic signals are present for programs, copybooks, data
  items, datasets, JCL jobs/steps/DDs, DB2 tables, CICS commands, call/perform
  control flow, copy usage, JCL wiring, reads, writes, moves, queries, and DD
  usage;
- the lightweight scan covers every benchmark source file;
- every graph edge has a file+line citation site.

The JSON report includes parse coverage, clean parse coverage, recoverable
syntax warning counts, fatal parse failure counts, node/edge type counts,
citation coverage, source-backed node coverage, external-node counts by type,
parse-error counts by reason, and parse-error samples. This records what the
current analyzer understands and where it degrades on the primary PRD corpus.

`parseCoverage` means the analyzer completed its lightweight graph scan for
that share of files. `parseErrors` can still list files where tree-sitter saw
dialect syntax errors; those are syntax-fidelity warnings, not necessarily
total file drops.

Use the M6 comparison runner when evaluating parser candidates:

```sh
npm run m6:compare-candidates -- --root /path/to/COBOL-Legacy-Benchmark-Suite
```

`samples/mini-bank` is a bundled smoke sample for local exploration, not benchmark evidence.
