# Cobolens

Cobolens is a free, open-source, local desktop app for understanding COBOL
codebases. It is an understanding tool: dependency maps, source navigation,
plain-English summaries, and grounded answers with citations.

The product source of truth is [docs/COBOL-Lens-PRD.md](docs/COBOL-Lens-PRD.md).
Build milestones must follow PRD section 19 in order.

## Development

Install the Tauri desktop prerequisites for your OS, then run:

```sh
npm install
npm run tauri dev
```

M0 contains only the Tauri v2 + React/TypeScript shell and the empty dark
three-pane workspace from PRD section 9.
