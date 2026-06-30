# M6 Parser Upgrade Readiness

Date: 2026-06-30

## Current Decision

Do not replace the Rust sidecar yet. The UI now has lineage and impact inspection on top of the current `GraphDocument`, and the strict M6 fixture passes. A ProLeap-backed JVM candidate and a mapa-backed candidate now both emit the same `GraphDocument` contract and pass the strict M6 fixture, but the final PRD path still needs packaging validation and benchmark-scale comparison before adopting a JVM analyzer.

This is the load-bearing decision gate from the original plan:

- Keep the current Rust sidecar as the working v1 implementation until a JVM candidate proves the same contract.
- Spike ProLeap first for COBOL ASG/data/control-flow and variable access.
- Spike mapa alongside it for JCL/CICS/DB2/IMS portfolio analysis coverage.
- Only swap the production analyzer after the candidate emits `GraphDocument` and passes `tools/m6-bakeoff/run.mjs`.

## Source Refresh

- ProLeap's README describes an ANTLR4 COBOL parser that emits AST and ASG, with semantic analysis for data/control flow and variable access. It also extracts EXEC SQL, EXEC SQLIMS, and EXEC CICS statements as ASG text, and says builds require Maven plus JDK 17. The README's `io.github.uwol:proleap-cobol-parser:4.0.0` coordinate did not resolve in this environment; the checked-in spike uses the JitPack artifact `com.github.uwol:proleap-cobol-parser:2.3.0`. Source: https://github.com/uwol/proleap-cobol-parser
- mapa's README describes ANTLR grammars and Java code for COBOL, CICS APIs/SPIs, DB2z SQL, SQL/PL, IMS interfaces, and JCL. It specifically targets impact-analysis questions, call relationships, program inputs/outputs, and analogous JCL analysis. Source: https://github.com/cschneid-the-elder/mapa
- GraalVM Native Image remains the packaging candidate if a JVM sidecar makes the desktop footprint too heavy. It compiles Java code ahead-of-time into a native executable, supports Maven/Gradle workflows, and has platform toolchain prerequisites. Source: https://www.graalvm.org/latest/reference-manual/native-image/

## Local Readiness

Run:

```sh
npm run m6:parser-readiness
```

Required for the first JVM spike:

- `java`
- `javac`
- `mvn`

Useful before packaging decisions:

- `java21` for mapa's checked-in jars
- `gradle`
- `native-image`

This workspace has a user-local JDK 17 and Maven install under `$HOME/.local/codex-jvm`. `tools/parser-upgrade/readiness.mjs` detects that location automatically, or a different location can be supplied with `COBOLENS_JVM_HOME`.

## JVM Candidate

The ProLeap candidate lives under `sidecar/cobolens-analyze-jvm/`. It is intentionally still a spike, not the production sidecar.

It implements the existing CLI shape exactly:
   `--root`, `--out`, `--format`, `--ext`, `--encoding`.
It emits schema-compatible `GraphDocument` JSON only; there is no UI parser coupling.

Run:

```sh
node tools/m6-bakeoff/run.mjs --candidate jvm=sidecar/cobolens-analyze-jvm/bin/cobolens-analyze-jvm
```

## mapa Probe

The mapa probe runs the upstream `CallTree.jar` and `JCLParser.jar` against `fixtures/m6-bakeoff`:

```sh
npm run m6:mapa-probe
```

The probe validates:

- COBOL `PGM`, `COPY`, CICS `CALL`, program `DD`, and `DB2TABLE` records.
- JCL `JOB`, `JOBSTEP`, and `JOBSTEPDD` records.

It also tightened the M6 fixture to use a legal 8-character JCL job name (`DAILYLN`); mapa rejected the previous 9-character `DAILYLINE` name.

The mapa `GraphDocument` candidate lives at `sidecar/cobolens-analyze-mapa/bin/cobolens-analyze-mapa` and can be run with:

```sh
npm run m6:mapa-bakeoff
```

## Candidate Comparison

Run:

```sh
npm run m6:compare-candidates
npm run m6:compare-candidates -- --root samples/mini-bank
npm run m6:compare-candidates -- --root /path/to/benchmark
```

The first command compares Rust, ProLeap, and mapa on the strict M6 fixture. The second is only a local smoke sample. The third is the real benchmark-scale gate once the official benchmark suite is present on disk.

## Packaging Readiness

Run:

```sh
npm run m6:packaging-readiness
```

The current WSL probe starts all three analyzer candidates and reports sidecar/JDK sizes, but returns `ready: false` because this environment lacks `pkg-config` and the Linux Tauri WebKit/dbus development packages. Do not treat this as Windows packaging validation; Windows/Tauri startup behavior still needs to be checked on a Windows build host before a JVM sidecar is adopted.

Remaining decision work:

1. Run `npm run m6:compare-candidates -- --root /path/to/benchmark` once the official benchmark suite is available locally. The checked-in `samples/mini-bank` directory is only a smoke sample.
2. Resolve packaging readiness findings from `npm run m6:packaging-readiness`, especially missing WSL `pkg-config`/WebKit/dbus development packages and Windows/Tauri startup behavior.
3. Decide whether to keep Rust, use ProLeap only, use mapa only, or use ProLeap + mapa.
