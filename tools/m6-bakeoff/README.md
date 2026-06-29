# M6 Parser Bake-Off Runner

The runner executes analyzer candidates against `fixtures/m6-bakeoff` and checks the emitted Cobolens `GraphDocument` for the semantic signals needed by M6.

```sh
node tools/m6-bakeoff/run.mjs
node tools/m6-bakeoff/run.mjs --contract-only
node tools/m6-bakeoff/run.mjs --candidate proleap=/path/to/analyzer --candidate mapa=/path/to/analyzer
```

Each candidate command must accept the existing analyzer CLI shape:

```sh
candidate --root <fixture-root> --out <graph.json> --format auto --ext .cbl,.cob,.cpy,.jcl --encoding utf8
```

The current Rust sidecar is included by default when it has already been built. It is expected to pass `--contract-only` and fail some semantic checks; that failure is the baseline M6 is meant to improve.
