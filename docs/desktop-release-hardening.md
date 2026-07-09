# Desktop Release Hardening

Date: 2026-07-09

## Product And Targets

The Tauri desktop app is the v1 product. macOS is the primary hands-on desktop
validation target. Linux, Windows, and macOS bundles are built in GitHub Actions
as unsigned QA artifacts. The browser build is for UI automation and demos; it
does not prove folder access, OS keychain behavior, AppData caches, or packaged
resources.

Unsigned bundles are not public installers. A public release still requires a
chosen distribution channel, Apple signing/notarization, and corresponding
Windows/Linux signing decisions. Signing credentials must live in CI secrets,
not the repository.

## Security Boundary

The production Tauri webview now has an explicit content security policy. It
loads bundled scripts and assets only, blocks objects and framing, and permits
network connections only to:

- Tauri IPC;
- localhost Ollama on port 11434;
- Anthropic, OpenAI, and OpenRouter API origins configured by the app.

Development adds only the local Vite HTTP/WebSocket origins. Tauri keeps its
compile-time CSP nonce/hash injection enabled. The main window capability stays
local and exposes only Tauri core defaults plus the folder dialog.

Reference: [Tauri Content Security Policy](https://v2.tauri.app/security/csp/).

## Repeatable Evidence

```sh
npm run m6:verify
npm run tauri -- build --bundles app --no-sign
npm run desktop:macos-packaged-smoke
npm audit --audit-level=high
```

`.github/workflows/audit.yml` also runs npm audit and RustSec checks against the
Tauri and analyzer lockfiles on pushes, pull requests, manual runs, and a weekly
schedule. `.github/workflows/package.yml` builds all three desktop platforms and
runs the packaged macOS resource/launch smoke.

The 2026-07-09 local audit found no npm vulnerabilities. RustSec initially found
two high-severity `quick-xml 0.39.4` advisories through Tauri's `plist`
dependency; the lockfile now uses `plist 1.10.0` and `quick-xml 0.41.0`, and both
Rust lockfiles pass vulnerability checks. RustSec still reports 17 allowed
maintenance/unsoundness warnings in Linux GTK and other transitive crates; these
are visible audit debt, not silently ignored vulnerabilities.

The macOS smoke verifies the `.app` executable, analyzer sidecar, bundled sample,
a real packaged-sample graph, and a six-second packaged GUI launch. Linux keeps
its AppImage/WebKit/GStreamer smoke. Windows remains build-and-artifact evidence
until a Windows GUI runner is added.
