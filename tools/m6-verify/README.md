# M6 Current-State Verification

This runner verifies the completed M6 surface that does not depend on JVM parser tooling:

- strict M6 bake-off fixture,
- benchmark validation helper against the M6 fixture,
- frontend production build,
- Rust sidecar `cargo check`.

It also prints parser-upgrade readiness as an advisory check. A missing JVM toolchain is expected in the current WSL environment and does not fail this current-state verification.

```sh
npm run m6:verify
```

The true ProLeap/mapa parser swap remains gated by `npm run m6:parser-readiness`.

