# Parser Upgrade Readiness

M6's final parser path is expected to evaluate ProLeap and mapa behind the existing `GraphDocument` sidecar contract. This helper reports whether the local environment has the JVM tooling needed to begin that spike.

```sh
npm run m6:parser-readiness
```

The current WSL environment does not need this tooling for the Rust semantic slice, but it does need it before we can compile or package a ProLeap/mapa sidecar.

Run the mapa fixture probe with:

```sh
npm run m6:mapa-probe
```

The probe uses mapa's checked-in `CallTree.jar` and `JCLParser.jar` against `fixtures/m6-bakeoff`. It requires JDK 21 for those jars. By default it clones mapa into `.cache/parser-upgrade/mapa`; set `MAPA_HOME=/path/to/mapa` or pass `-- --mapa-home /path/to/mapa` to use an existing checkout.

Run the mapa `GraphDocument` candidate with:

```sh
npm run m6:mapa-bakeoff
```

The candidate lives at `sidecar/cobolens-analyze-mapa/bin/cobolens-analyze-mapa`, keeps the same analyzer CLI shape, runs mapa's CSV-producing jars, and maps those records back into the current app graph contract.

Compare the current Rust, ProLeap, and mapa candidates with:

```sh
npm run m6:compare-candidates
npm run m6:compare-candidates -- --root samples/mini-bank
npm run m6:compare-candidates -- --root /path/to/benchmark
npm run m6:compare-candidates -- --root /path/to/benchmark --timeout-ms 60000
```

The default root is `fixtures/m6-bakeoff`. `samples/mini-bank` is only a bundled smoke sample, not the official PRD benchmark suite. `--timeout-ms` caps each candidate so a parser hang is reported as a failed candidate instead of blocking the comparison run.

The mapa candidate also has an internal per-jar timeout. Set `MAPA_TOOL_TIMEOUT_MS=60000` to tune it; the default is 30000ms. When an upstream mapa jar times out, the candidate records a parse error and still emits the graph contract using lexical and any successful JCL output.

Check packaging readiness with:

```sh
npm run m6:packaging-readiness
```

This reports sidecar artifact sizes, startup smoke timings, and local WSL Tauri Linux prerequisites. It is expected to report `ready: false` when `pkg-config` or WebKit/dbus development packages are missing.
