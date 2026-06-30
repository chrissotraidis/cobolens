# M6 Current-State Verification

This runner verifies the completed M6 surface:

- strict M6 bake-off fixture,
- benchmark validation helper against the M6 fixture,
- frontend production build,
- graph-grounded documentation export smoke,
- graph-only Ask smoke for "What depends on CUSTOMER-ID?",
- model privacy smoke for local/cloud mode invariants,
- Rust sidecar `cargo check`,
- Tauri shell `cargo test`.

It also runs JVM parser work as advisory checks:

- mapa analyzer candidate against the strict M6 fixture,
- Rust/ProLeap/mapa candidate comparison on the strict M6 fixture,
- parser-upgrade readiness.

Advisory failures do not fail this current-state verification; the production sidecar remains Rust until the parser decision gate is complete.

```sh
npm run m6:verify
```

The true parser swap remains gated by benchmark-scale comparison and packaging readiness.
