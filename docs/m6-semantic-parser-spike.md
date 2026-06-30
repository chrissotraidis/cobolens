# M6 Semantic Parser Upgrade Spike

Date: 2026-06-29

## Goal

M6 upgrades the analyzer from the current lightweight Rust/tree-sitter sidecar to a semantic parser path that can support data lineage and impact analysis without rewriting the Tauri/React UI. The app contract should remain `GraphDocument`:

- `nodes[]` are typed portfolio entities with stable ids, names, optional source locations, and optional metadata.
- `edges[]` are typed relationships with optional source sites.
- `meta.parseErrors[]` carries recoverable parser failures.

## Current Baseline

The M5 sidecar already emits programs, paragraphs, copybooks, JCL jobs, JCL steps, and basic relationships. That is enough for navigation, summaries, grounded chat, and export, but not enough for FR-10/FR-11 style lineage and impact because it does not model:

- record/file/table fields as first-class data assets,
- reads vs writes,
- MOVE/COMPUTE/SQL/CICS/IMS data movement,
- DD/dataset/procedure resolution across JCL,
- paragraph-level control flow with reliable data access provenance.

## Primary Sources Reviewed

- ProLeap COBOL parser: ANTLR4 parser that generates AST and ASG, with semantic analysis exposing data/control-flow information and variable access. It is MIT licensed. The README lists `io.github.uwol:proleap-cobol-parser:4.0.0`, but that coordinate did not resolve during the spike; the checked-in candidate uses JitPack coordinate `com.github.uwol:proleap-cobol-parser:2.3.0`. Source: https://github.com/uwol/proleap-cobol-parser
- ProLeap grammar notes: the grammar reports NIST coverage and banking/insurance usage, and depends on its preprocessor for COPY/REPLACE handling. Source: https://github.com/uwol/proleap-cobol-parser/blob/main/src/main/antlr4/io/proleap/cobol/Cobol.g4
- mapa: MIT-licensed mainframe application portfolio analysis repository with ANTLR grammars and Java code for COBOL, CICS, DB2z, SQL/PL, IMS interfaces, and JCL. Its README frames the exact portfolio questions M6 targets: impact analysis, call relationships, inputs/outputs, and JCL analogs. Source: https://github.com/cschneid-the-elder/mapa

## Candidate Path

Use a Java semantic analyzer sidecar behind the existing `analyze_codebase` command and keep the emitted JSON schema compatible. The candidate sidecar should evaluate two adapters:

1. ProLeap adapter for deep COBOL structure:
   - program, paragraph, section, copybook, and data item nodes,
   - variable read/write sites,
   - paragraph and program call relationships,
   - EXEC SQL/CICS text extraction as source-backed edges.

2. mapa adapter for portfolio and job context:
   - JCL job/step/proc/DD extraction,
   - COBOL call tree details including CICS LINK/XCTL and SQL CALL,
   - DB2/IMS/CICS grammar coverage where ProLeap only exposes embedded statements as text.

The bake-off should decide whether M6 uses ProLeap plus mapa together, mapa only, or ProLeap first with mapa reserved for JCL/CICS/DB2 enrichment.

## mapa Candidate Result

`npm run m6:mapa-probe` runs mapa's checked-in `CallTree.jar` and `JCLParser.jar` against the strict M6 fixture. The probe confirms mapa extracts:

- COBOL program, copybook, CICS LINK, DD open-mode, and DB2 table records.
- JCL job, step, and DD dataset records.

The probe requires JDK 21 because mapa's checked-in jars are compiled for class-file version 65. `sidecar/cobolens-analyze-mapa/bin/cobolens-analyze-mapa` wraps those jars, maps the CSV records back into `GraphDocument`, adds the narrow lexical data-item/move enrichment needed by the current fixture, and passes:

```sh
npm run m6:mapa-bakeoff
```

This does not replace the production Rust sidecar yet; it gives M6 a second swappable candidate for benchmark and packaging comparison.

## Contract Extensions

Prefer additive graph types over a schema break:

- New node types: `data-item`, `dataset`, `db2-table`, `sql-statement`, `cics-command`, `jcl-proc`.
- New edge types: `reads`, `writes`, `moves-to`, `defines`, `executes`, `uses-dd`, `calls`, `links`, `xctls`, `queries`, `updates`.
- Source sites remain single-line anchors initially; multi-site evidence can be represented as multiple edges.

The UI can already render unknown node and edge types with fallback colors/labels. M6 UI work should add lineage/impact panels only after the parser sidecar proves it can emit these edges reliably.

## Bake-Off Acceptance

Run both candidates against `samples/mini-bank` plus at least one fixture containing:

- nested copybooks and `COPY ... REPLACING`,
- file `READ`, `WRITE`, `REWRITE`, and `OPEN` modes,
- `MOVE` from input record fields to output record fields,
- `EXEC SQL SELECT/INSERT/UPDATE`,
- `EXEC CICS LINK` or `XCTL`,
- JCL steps with DD datasets and PROC expansion.

For each candidate, record:

- parse success rate and recoverable errors,
- source location fidelity,
- lineage edges produced,
- JCL-to-program edges produced,
- packaging complexity in Tauri,
- license and dependency risk,
- performance on a medium portfolio fixture.

## Decision Gate

Do not replace the current Rust sidecar until a bake-off branch proves:

- the emitted `GraphDocument` works in the existing app,
- lineage and impact edges are source-grounded,
- the sidecar can be packaged or invoked predictably on Windows,
- parser failures degrade into `meta.parseErrors[]` instead of blocking the whole scan.
