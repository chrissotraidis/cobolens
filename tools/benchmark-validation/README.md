# Benchmark Validation

The PRD names the COBOL Legacy Benchmark Suite and IBM zopeneditor sample as release validation targets. They are not bundled in this repo.

Run this helper after placing a benchmark checkout on disk:

```sh
npm run validate:benchmark -- --root /path/to/COBOL-Legacy-Benchmark-Suite
```

The script runs the current analyzer sidecar through the stable `GraphDocument` contract and reports graph size, node/edge types, and parse errors. It intentionally does not download large corpora or claim validation when the benchmark is absent.

