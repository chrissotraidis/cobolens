# Parser Upgrade Readiness

M6's final parser path is expected to evaluate ProLeap and mapa behind the existing `GraphDocument` sidecar contract. This helper reports whether the local environment has the JVM tooling needed to begin that spike.

```sh
npm run m6:parser-readiness
```

The current WSL environment does not need this tooling for the Rust semantic slice, but it does need it before we can compile or package a ProLeap/mapa sidecar.

