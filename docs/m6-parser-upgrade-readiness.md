# M6 Parser Upgrade Readiness

Date: 2026-06-30

## Current Decision

Do not replace the Rust sidecar yet. The UI now has lineage and impact inspection on top of the current `GraphDocument`, and the strict M6 fixture passes, but the final PRD path still needs a JVM parser bake-off before adopting ProLeap + mapa.

This is the load-bearing decision gate from the original plan:

- Keep the current Rust sidecar as the working v1 implementation until a JVM candidate proves the same contract.
- Spike ProLeap first for COBOL ASG/data/control-flow and variable access.
- Spike mapa alongside it for JCL/CICS/DB2/IMS portfolio analysis coverage.
- Only swap the production analyzer after the candidate emits `GraphDocument` and passes `tools/m6-bakeoff/run.mjs`.

## Source Refresh

- ProLeap's README describes an ANTLR4 COBOL parser that emits AST and ASG, with semantic analysis for data/control flow and variable access. It also extracts EXEC SQL, EXEC SQLIMS, and EXEC CICS statements as ASG text, exposes Maven coordinates `io.github.uwol:proleap-cobol-parser:4.0.0`, and says builds require Maven plus JDK 17. Source: https://github.com/uwol/proleap-cobol-parser
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

- `gradle`
- `native-image`

As of this note, the current WSL environment does not have Java, Maven, Gradle, or GraalVM Native Image available. That blocks compiling a ProLeap/mapa sidecar here, but it does not block further UI work or validation against the current Rust sidecar.

## Next Spike Once Ready

1. Create a temporary JVM analyzer under `sidecar/cobolens-analyze-jvm/`.
2. Implement the existing CLI shape exactly:
   `--root`, `--out`, `--format`, `--ext`, `--encoding`.
3. Emit schema-compatible `GraphDocument` JSON only; do not add UI parser coupling.
4. Run `node tools/m6-bakeoff/run.mjs --candidate jvm=sidecar/cobolens-analyze-jvm/...`.
5. Compare output against the current Rust sidecar and the M6 strict fixture.
6. Decide whether to keep Rust, use ProLeap only, use mapa only, or use ProLeap + mapa.

