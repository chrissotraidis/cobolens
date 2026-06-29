# COBOL Parser Landscape: What to Bundle in CobolLens v1

*Research brief for a free, open-source, local desktop app that maps a COBOL codebase (dependency graph + diagrams + summaries + AI chat). The founder will bundle an existing parser as a black box rather than write one.*

**Prepared:** 2026-06-29 · **Status:** Decision-ready · **Confidence:** High on licenses & languages, medium on dialect-coverage edge cases (those depend on the actual customer codebases, which we can't see yet).

---

## Executive Summary

You do not need to build a COBOL parser. Several credible open-source parsers exist, but they cluster into three very different shapes, and the choice is dominated by **two constraints you named: license risk and distribution weight.**

1. **The license trap is real and asymmetric.** Two otherwise-tempting options — **GnuCOBOL** (GPL-3.0 compiler) and **jcl-assess** (GPL-3.0) — carry *copyleft* licenses. If you ever link their code into your app, the GPL can require you to release your *entire app* under the GPL too. For a free tool that's survivable but limiting; if you ever want a paid/closed tier it's a landmine. The good news: the best analysis-grade parsers (**ProLeap**, **mapa**, the **tree-sitter** grammars, **Koopa**) are permissive (MIT/BSD), and **cobol-rekt** is MIT but wraps an **EPL-2.0** parser (a mild, file-level copyleft — manageable).

2. **The "weight vs. completeness" tradeoff is the core engineering decision.** Almost every *analysis-grade* parser (ProLeap, mapa, cobol-rekt, Koopa, che4z) is **JVM/Java**. That means bundling a Java runtime (~40-70 MB) and shelling out to it — heavier and slower-to-feel than you'd like for a "slick local app." The only genuinely *light* option is **tree-sitter**, which compiles to a tiny native lib with first-class Node and Rust/Tauri bindings — but tree-sitter grammars for COBOL are **immature, syntax-only** (no semantic graph, no real call graph, no copybook/CICS/SQL resolution).

3. **No single free parser does everything you want** (AST + semantic graph + call graph + JCL + copybook + CICS + DB2/SQL) in a permissive license with a light runtime. You will trade something. The realistic v1 is: **use a JVM parser that already produces the call/dependency graph you need, and accept the Java dependency** — then have your own code build the dependency map and feed summaries to the LLM.

**Recommendation in one line:** Bundle **ProLeap COBOL parser (MIT, JVM)** as the COBOL engine for v1 — it gives you a real AST + Abstract Semantic Graph with data/control-flow info, MIT license, and is the most battle-tested permissive option — and pair it with **mapa (MIT, JVM)** if you need JCL parsing and a ready-made call-tree extractor on day one. Keep **tree-sitter-cobol** as a lightweight fallback / fast-path for syntax highlighting and quick navigation. Full reasoning and a fallback ladder are in the [Recommendation](#recommendation) section.

---

## Comparison Table

| Tool | What it produces | License | Lang / runtime | Dialects | Maturity (stars / activity) | Embed difficulty (Node/Tauri) |
|---|---|---|---|---|---|---|
| **ProLeap COBOL parser** | AST **+ ASG** (semantic graph) with data & control-flow; CICS/SQL/SQLIMS extracted as text; copybook/COPY/REPLACE preprocessor | **MIT** ✅ | Java/JVM (JDK 17, Maven) | COBOL-85 core; "IBM-ish"; passes NIST suite | ~203★, 704 commits; mature but **last release Jan 2018** (grammar still updated) | Medium — shell out to JVM, parse JSON/your own export |
| **mapa** | COBOL **call tree** (CALL, CICS LINK/XCTL, SQL CALL, program I/O) + **JCL** analysis; ANTLR grammars for COBOL/CICS/DB2z/SQL-PL/IMS DLI/SQLIMS/JCL | **MIT** ✅ | Java/JVM + ANTLR (GNU make build) | IBM Z dialect; targets ISO COBOL 202x draft | ~61★, **1,377 commits**, actively maintained | Medium — produces flat files for DB load; shell out |
| **cobol-rekt (SMOJOL)** | Parse tree, **CFG**, flowcharts (SVG/PNG/Mermaid), data-dependency graph, inter-program dependency graph, **Neo4j/GraphML export, LLM summaries/glossaries** | **MIT** (toolkit) but **wraps EPL-2.0 che4z parser** ⚠️ | Java 21 **+ Python** (Neo4j/NetworkX/LLM) | Standard COBOL + **IDMS**; PoC-grade, "not exhaustive" | ~1,000+ commits, **actively maintained**; self-described as time-boxed PoC | Hard — heaviest stack (JVM + Python + optional Neo4j) |
| **tree-sitter-cobol** (yutaro-sakamoto) | **Syntax tree only** (incremental, error-tolerant); no semantic graph | **MIT** ✅ | C (tiny native lib) + **Node & Rust bindings** | COBOL-85 (based on opensource-cobol), NIST-tested | ~38★, 256 commits; last release Feb 2023, commits into late 2024 | **Easy** — native Node/Tauri bindings, no runtime |
| **Koopa** | AST (exportable to XML); island/fuzzy parsing; XPath queries → call/function lists | **BSD** ✅ | Java/JVM | COBOL incl. **CICS/SQL fragments tolerated**, no preprocessing needed | Long-standing (SourceForge + GitHub); low recent activity | Medium — shell out to JVM, parse XML |
| **che4z LSP for COBOL** | LSP analysis (syntax + semantic diagnostics), copybook resolution, **CICS / DB2 SQL / Datacom** aware; dialect add-ons (IDMS) | **EPL-2.0** ⚠️ | Java + ANTLR (+ TS/VS Code shell) | **IBM Enterprise COBOL** (explicitly), IDMS add-on | Eclipse Foundation project, **very active**, IBM/Broadcom-backed | Hard-ish — it's an LSP server, not a library; but mature |
| **GnuCOBOL** (`cobc`) | A real compiler (COBOL→C); not designed to emit an analysis AST | **GPL-3.0** (compiler) ❌ / LGPL (runtime) | C (Bison/Flex) | GnuCOBOL dialects, broad standards support | Mature, FSF/GNU project, active | Hard + license risk — not an analysis API |
| **jcl-assess** | JCL assessment + call-tree graph; bundled custom COBOL parser | **GPL-3.0** ❌ | Perl | Custom/limited | ~2★, 9 commits — **essentially a personal tool** | Easy to run, but GPL + thin |

Legend: ✅ permissive / safe · ⚠️ weak copyleft (manageable) · ❌ strong copyleft (risk for a tool you may close-source later)

---

## Per-Tool Detail

### 1. ProLeap COBOL parser — *the permissive analysis workhorse*
Repo: https://github.com/uwol/proleap-cobol-parser · Related analyzer: https://github.com/proleap/proleap-cobol

- **What it produces:** An **AST** representing the source tree, *and* an **Abstract Semantic Graph (ASG)** produced by semantic analysis that carries **data- and control-flow information** (e.g. variable access resolution). This is the single most important differentiator: it's not just syntax, it understands what symbols refer to. `EXEC SQL`, `EXEC SQLIMS` and `EXEC CICS` statements are **extracted as text** by the preprocessor (so you get them, but they aren't deeply parsed into SQL/CICS sub-ASTs). The bundled preprocessor executes `COPY`, `REPLACE`, `CBL`, `PROCESS` — i.e. **copybook expansion works.** (Source: repo README.)
- **License:** **MIT** — ideal. No copyleft obligations; you can bundle it in a closed-source paid tier later with no friction. (Source: repo LICENSE / README badge.)
- **Language / runtime:** **Java**, built with **Maven, requires JDK 17**, ships as a JAR. For a desktop app this means bundling a JRE and invoking it as a subprocess (or via a tiny Java service). (Source: repo "Build process".)
- **Dialect coverage:** ANTLR4 COBOL-85-based grammar; **passes the NIST COBOL-85 test suite** and the author states it's been "applied to numerous COBOL files from banking and insurance." It's not branded as full IBM Enterprise COBOL, so very modern IBM-specific syntax may need testing against real customer code. (Source: repo README.)
- **Maturity / activity:** ~**203 stars**, **704 commits**, 5 releases. Caveat: the **latest tagged release is v2.4.0 from Jan 2018** even though the README references v4.0.0 via JitPack and the grammar is still updated — so "use the latest main / JitPack build," not the old tag. Healthy fork ecosystem (106 forks; the ANTLR `grammars-v4` repo carries milestones). (Source: repo sidebar / releases.)
- **Embedding in Node/Tauri:** Medium. There are no native JS bindings — you run the JAR. Cleanest pattern: write a thin Java wrapper that parses a file/dir and **emits JSON** (AST/ASG slices you care about), spawn it from Node/Rust, read stdout. The JVM dependency is the real cost.

### 2. mapa — *batteries-included call-tree + JCL, permissive*
Repo: https://github.com/cschneid-the-elder/mapa · Author write-up: https://medium.com/@craig.schneiderwent/mainframe-application-portfolio-analysis-3ee859c62225

- **What it produces:** Purpose-built for exactly your headline feature. The COBOL tool extracts **CALLs, EXEC CICS LINK/XCTL, EXEC SQL CALL, program inputs/outputs** to reveal the "shape" of a portfolio — i.e. a **call/dependency graph**. The JCL directory does the analogous thing for **JCL**. Output is a **flat file meant to be loaded into a DBMS** (you'd load it into your own graph store instead). It ships **ANTLR grammars for COBOL, CICS APIs/SPIs, DB2z SQL, SQL/PL, EXEC DLI / EXEC SQLIMS (IMS), and JCL** — the broadest mainframe-language coverage of any single repo here. (Source: repo README.)
- **License:** **MIT** — excellent. (Source: repo LICENSE / README badge.)
- **Language / runtime:** **Java + ANTLR**, built with **GNU make** (per-subdirectory Makefiles). Same JVM-bundling implications as ProLeap. (Source: repo README "Building".)
- **Dialect coverage:** Targets the **IBM Z dialect** and explicitly tries to conform to the **ISO COBOL 202x draft (N1207, 2020-11-23)**. This is the most "IBM-mainframe-honest" of the permissive options, and the only one that ships a real **JCL** grammar. (Source: repo README.)
- **Maturity / activity:** ~**61 stars** but **1,377 commits** and clearly actively maintained by a former mainframe tools professional. Honest about static-analysis limits ("what *could* happen, not what *does*"). No tagged releases — build from source. (Source: repo sidebar / README.)
- **Embedding:** Medium. It's CLI/file-oriented (flat-file output), which is actually convenient: run it over a directory, ingest the flat files. Still JVM. Pairs naturally with ProLeap (ProLeap for deep per-program ASG, mapa for cross-program call tree + JCL).

### 3. cobol-rekt (a.k.a. SMOJOL) — *the most ambitious; closest to your end vision, heaviest*
Repo: https://github.com/avishek-sen-gupta/cobol-rekt

- **What it produces:** The richest feature set by far — **parse tree (JSON export), control-flow graph, program/section/paragraph flowcharts (SVG/PNG + Mermaid), data-dependency graph, inter-program dependency graph, Neo4j ingestion, GraphML "supergraph" export**, and — notably for you — **LLM-assisted "depth-first" summarisation, glossary building, and capability maps "à la GraphRAG."** It even has an experimental COBOL interpreter and transpilation IR. This is essentially a research prototype of the app you're describing. (Source: repo README, verified by reading the full page.)
- **License:** **MIT for the toolkit**, *but* it parses using the **Eclipse Che4z COBOL grammar, which is EPL-2.0**, and the README states: *"all modifications to the parser fall under the EPL v2 license, while the toolkit proper falls under the MIT License."* EPL-2.0 is a **weak/file-level copyleft** — you must share changes *to the EPL files*, but it does **not** force your whole app open like GPL would. Manageable, but note it. Also bundles gSpan (MIT) and Google's RuntimeTypeAdapterFactory (Apache-2.0). (Source: repo README copyright section.)
- **Language / runtime:** **Java 21 + Python.** Java does parsing/ingestion/control-flow; **Python does the dynamic analyses and LLM summaries** (via Neo4j or NetworkX). So a full deployment is **JVM + Python + optionally a Neo4j instance** — the heaviest stack here by a wide margin. (Source: repo README.)
- **Dialect coverage:** Standard COBOL **+ IDMS** only (`--dialect=COBOL|IDMS`). Self-described limits: *"built based on a time-boxed PoC… not well-covered by tests yet"*; *"the interpreter's capabilities are not exhaustive"*; PICTURE-clause visual indicators (`-`, `,`, `Z`) ignored; some special-register references resolve only one level. Tested against the AWS CardDemo codebase. **No JCL/DB2/CICS deep support** mentioned. **Copybooks supported** (`--copyBooksDir`). (Source: repo README caveats/known-issues.)
- **Maturity / activity:** Very **active** (1,000+ commits, ongoing), but officially a **PoC**. No UI yet ("one is in the works").
- **Embedding:** **Hard.** Multi-runtime (JVM + Python + Neo4j) is the opposite of a slick single-binary local app. **However**, it's an invaluable *reference implementation* — you can copy its architecture (parse → graph → LLM summarise) and even reuse its grammar choice, while building a lighter pipeline yourself.

### 4. tree-sitter-cobol — *the only lightweight option*
Primary: https://github.com/yutaro-sakamoto/tree-sitter-cobol · Others: https://github.com/Neppord/tree-sitter-cobol · https://github.com/BloopAI/tree-sitter-cobol · https://github.com/raresdolga/tree-sitter-cobol · tree-sitter parser list: https://github.com/tree-sitter/tree-sitter/wiki/List-of-parsers

- **What it produces:** A **concrete syntax tree only** — fast, incremental, error-tolerant. **No ASG, no semantic resolution, no call graph, no copybook expansion, no CICS/SQL understanding** out of the box. You'd build call-graph extraction yourself by walking the tree and pattern-matching `CALL`/`COPY` nodes (doable but you reinvent the semantic layer). (Source: tree-sitter docs + repo.)
- **License:** **MIT** (yutaro-sakamoto). Other community grammars vary — check each. (Source: repo LICENSE.)
- **Language / runtime:** Generated **C** parser (tiny `.so`/`.dll`/`.dylib`), with **official Node bindings and Rust bindings** (Cargo.toml present). This is the dream for a **Tauri/Rust** or **Node/Electron** app: no JVM, no subprocess, microsecond parses, embeds directly. (Source: repo file listing — `bindings/`, `Cargo.toml`, `binding.gyp`, `package.json`.)
- **Dialect coverage:** COBOL-85, rules **based on opensource-cobol**, **tested against the NIST COBOL-85 suite** (with a `skip_tests.txt` for known gaps). Expect failures on heavy IBM Enterprise COBOL, CICS/SQL-embedded code, and unusual column formats. The author of the Neppord grammar openly notes COBOL's many dialects make full support hard. (Source: yutaro-sakamoto README.)
- **Maturity / activity:** yutaro-sakamoto is the most maintained: ~**38 stars**, **256 commits**, last release Feb 2023 but commits continuing into late 2024 (listed in the official tree-sitter parser registry, ABI 14). Still **young and incomplete** relative to the ANTLR-based parsers. (Source: tree-sitter wiki parser list + repo.)
- **Embedding:** **Easy — best in class.** This is the only option that fits "slick fast local app" with zero runtime overhead.

### 5. Koopa — *permissive, robust "island" parser*
Repo: https://github.com/krisds/koopa · Open Hub: https://openhub.net/p/koopa

- **What it produces:** A COBOL **parser generator** that builds an **AST (exportable to XML** via `java -cp koopa.jar koopa.app.cli.ToXml`). Notable strength: it **parses source files in isolation with no preprocessing** and **tolerates CICS/SQL fragments** without choking. Call/function lists can be pulled via **XPath queries** over the AST (e.g. custom "Function Calls" columns). No built-in ASG/data-flow like ProLeap, but a clean, queryable tree. (Source: repo + SourceForge discussion.)
- **License:** **BSD** ("Everything in Koopa is covered by a BSD license, unless noted differently"). Permissive — safe. (Source: repo notes.)
- **Language / runtime:** **Java/JVM** (Ant build). Same bundling cost as ProLeap/mapa. (Source: repo.)
- **Dialect coverage:** Designed to be **dialect-tolerant and grammar-extensible**; its fuzzy/island approach makes it resilient to messy real-world code, which is a real advantage on uncooperative customer codebases. (Source: repo description.)
- **Maturity / activity:** Long-standing and well-regarded (it's the source of the NIST test files ProLeap reuses), but **lower recent activity** than mapa/ProLeap. Solid, stable, a bit quiet.
- **Embedding:** Medium — shell out to JAR, consume XML. A reasonable alternative/fallback to ProLeap if you want maximum robustness on garbage input over deep semantics.

### 6. che4z LSP for COBOL — *the most "IBM-real," but it's an LSP not a library*
Repo: https://github.com/eclipse-che4z/che-che4z-lsp-for-cobol

- **What it produces:** A full **Language Server** — syntax + semantic diagnostics, copybook resolution (incl. mainframe retrieval via Zowe), and **awareness of CICS, DB2 SQL, and Datacom** keywords/variables, with **dialect add-ons (IDMS)**. It targets **IBM Enterprise COBOL specifically** — the most production-grade dialect fidelity of anything here. This is the grammar **cobol-rekt wraps.** (Source: repo README + Eclipse project pages.)
- **License:** **EPL-2.0** — weak/file-level copyleft (same caveat as via cobol-rekt). Safe for a free tool; share modifications to EPL files only. (Source: repo README/NOTICE.)
- **Language / runtime:** **Java + ANTLR** under a TypeScript/VS Code extension shell. Backed by **Broadcom/IBM** under the Eclipse Foundation — by far the **best-funded and most active** project on this list.
- **Dialect coverage:** **IBM Enterprise COBOL** (explicit), plus CICS/DB2/Datacom and an IDMS dialect add-on. If your target customers are classic IBM-mainframe shops, this is the most accurate grammar available for free.
- **Embedding:** **Harder** — it's architected as an LSP server (great if your app speaks LSP), not as a clean "parse → give me an AST" library. You'd either run it as an LSP and consume diagnostics/symbols, or extract its ANTLR grammar (EPL) and drive it yourself (which is essentially what cobol-rekt did).

### 7. GnuCOBOL (`cobc`) — *a compiler, not an analyzer; license risk*
Repo: https://github.com/OCamlPro/gnucobol · Home: https://gnucobol.sourceforge.io/ · Wikipedia: https://en.wikipedia.org/wiki/GnuCOBOL

- **What it produces:** A **compiler** (COBOL → C, via **Bison/Flex**). It builds an internal parse tree to *compile*, but it does **not** expose a clean analysis AST/ASG/call-graph API for tooling. Wrong tool for codebase mapping. (Source: GnuCOBOL site / Wikipedia.)
- **License:** **GPL-3.0** for the `cobc` compiler ❌ (runtime libs LGPL). **Strong copyleft** — linking compiler code into your app would likely force your app under the GPL. For a free *open-source* tool that may be acceptable, but it forecloses a future closed/paid tier and complicates redistribution. (Source: GnuCOBOL FAQ / Wikipedia.)
- **Why it's still worth knowing:** It's the de-facto open COBOL *runtime/dialect reference*. You might use it to *validate/compile* sample code, or support a "GnuCOBOL dialect" mode — just don't try to make it your analysis parser.

### 8. jcl-assess — *thin personal tool; GPL; not a serious bundle candidate*
Repo: https://github.com/ykhwong/jcl-assess

- **What it produces:** JCL assessment + a **call-tree graph**, with a **bundled custom COBOL parser** so COBOL referenced by the JCL is analyzed too. Config-file driven; outputs to a `result/` dir. (Source: repo README.)
- **License:** **GPL-3.0** ❌ — copyleft. (Source: repo sidebar.)
- **Language / runtime:** **Perl 5** (92% Perl, 7% shell). Easy to run on macOS/Linux, awkward to bundle cleanly into a Tauri/Node app, and Perl is an unusual runtime dependency to ship.
- **Maturity:** ~**2 stars, 9 commits, v0.1** — effectively a one-person utility. Useful as *inspiration* for JCL call-tree extraction, **not** as a production dependency. mapa's JCL grammar is the better permissive choice for JCL.

---

## Notes on the broader field (honest uncertainty)

- **ProLeap "cobol85parser" forks** (mgh87, daniellansun, sebdei, stawi, ulfloe, etc.) are mostly **mirrors/forks of ProLeap** — don't treat them as independent options. Use upstream `uwol/proleap-cobol-parser`.
- **Dialect coverage claims are the softest part of this report.** Every project "passes NIST COBOL-85," but real customer codebases use IBM Enterprise COBOL extensions, vendor preprocessors, and embedded CICS/SQL/DLI. **You will not know true coverage until you run candidates against actual target codebases.** Budget a spike: take 2-3 real (or representative) programs and run them through ProLeap, mapa, Koopa, and tree-sitter, and compare what each successfully resolves.
- **Star counts are popularity, not quality.** mapa (61★) is more actively maintained and more mainframe-faithful than its star count suggests; cobol-rekt is the most feature-complete despite being a self-described PoC.
- **"Last commit" figures** above are as observed on GitHub in mid-2026; treat them as approximate and re-check before committing.

---

## Recommendation

### Primary (v1): ProLeap (+ mapa for JCL/call-tree)
**Bundle ProLeap COBOL parser (MIT) as the COBOL analysis engine, and add mapa (MIT) for JCL parsing and ready-made cross-program call-tree extraction.**

Why this combination:
- **License is clean (MIT + MIT).** Zero copyleft risk now or if you ever monetize. This alone rules out GnuCOBOL and jcl-assess as core dependencies.
- **ProLeap gives you semantics, not just syntax** — the ASG with data/control-flow and copybook expansion is what makes good summaries and accurate dependency maps possible. tree-sitter can't do this.
- **mapa fills ProLeap's two gaps for your use case:** it has a **JCL grammar** (ProLeap doesn't) and an out-of-the-box **call/dependency extractor** (CALL / CICS LINK/XCTL / SQL CALL), which is literally your headline feature, with flat-file output that's trivial to ingest.
- Both are **JVM** — so you bundle one runtime (a JRE) and reuse it for both. Architect it as a **local "analysis sidecar"**: a small Java service your Tauri/Node front end spawns, that parses a directory and returns JSON/flat files. The UI stays slick; the heavy lifting is out of process.

**The cost you're accepting:** a bundled JRE (~40-70 MB) and subprocess IPC. For a *local* desktop tool this is fine — it's a one-time download, not a per-action latency hit, and parsing happens once per codebase (then you cache the graph).

### Lightweight companion / fast path: tree-sitter-cobol
Even if ProLeap is the analysis brain, **embed `tree-sitter-cobol` (MIT) directly in the app** for what it's great at: **instant syntax highlighting, in-editor navigation, and quick file-level structure** without spinning up the JVM. It's a native lib with Node/Rust bindings — perfect for the interactive UI layer. Use the JVM sidecar only for the deep one-time analysis pass.

### Fallback ladder (if ProLeap struggles on real codebases)
1. **Koopa (BSD, JVM)** — if ProLeap chokes on messy/garbage real-world input, Koopa's island/fuzzy parsing is more forgiving (and you can run it with no preprocessing). Swap it in behind the same sidecar interface.
2. **che4z grammar (EPL-2.0, JVM)** — if your customers are hard-core IBM Enterprise COBOL shops and you need the most faithful dialect + CICS/DB2 awareness, this is the highest-fidelity free grammar. Accept the weak EPL copyleft and the fact that you're wrapping an LSP-oriented codebase (cobol-rekt proves it's doable).
3. **cobol-rekt** — don't bundle it, but **mine it.** It's the closest existing thing to CobolLens (parse → graph → flowcharts → LLM summaries). Study its pipeline and grammar choice; it will save you weeks of design even if you ship a lighter stack.

### What to avoid as a core dependency
- **GnuCOBOL** as your parser — it's a compiler, not an analysis API, and **GPL-3.0** risk.
- **jcl-assess** — GPL-3.0, Perl, and effectively a one-person v0.1; use **mapa** for JCL instead.

### The one thing to do before locking this in
Run a **half-day bake-off**: feed 2-3 representative target programs (with copybooks, and ideally some CICS/SQL and a JCL job) through **ProLeap, mapa, Koopa, and tree-sitter**, and score each on: did it parse without error, did it resolve copybooks, did it surface the CALL/dependency edges, did it choke on dialect quirks. The winner of *that* test on *real* code should override anything in this document — dialect reality beats README claims.

---

## Sources

- ProLeap COBOL parser — https://github.com/uwol/proleap-cobol-parser
- ProLeap analyzer/interpreter/transformer — https://github.com/proleap/proleap-cobol
- ProLeap on JitPack — https://jitpack.io/p/uwol/proleap-cobol-parser
- mapa (cschneid-the-elder) — https://github.com/cschneid-the-elder/mapa
- mapa author write-up — https://medium.com/@craig.schneiderwent/mainframe-application-portfolio-analysis-3ee859c62225
- cobol-rekt / SMOJOL (avishek-sen-gupta) — https://github.com/avishek-sen-gupta/cobol-rekt
- tree-sitter-cobol (yutaro-sakamoto, primary) — https://github.com/yutaro-sakamoto/tree-sitter-cobol
- tree-sitter-cobol (Neppord) — https://github.com/Neppord/tree-sitter-cobol
- tree-sitter-cobol (BloopAI) — https://github.com/BloopAI/tree-sitter-cobol
- tree-sitter-cobol (raresdolga) — https://github.com/raresdolga/tree-sitter-cobol
- tree-sitter official parser list — https://github.com/tree-sitter/tree-sitter/wiki/List-of-parsers
- tree-sitter docs (using parsers) — https://tree-sitter.github.io/tree-sitter/using-parsers/
- Koopa (krisds) — https://github.com/krisds/koopa
- Koopa on Open Hub — https://openhub.net/p/koopa
- Koopa on SourceForge — https://sourceforge.net/projects/koopa/
- che4z LSP for COBOL (Eclipse) — https://github.com/eclipse-che4z/che-che4z-lsp-for-cobol
- che4z README — https://github.com/eclipse-che4z/che-che4z-lsp-for-cobol/blob/development/README.md
- che4z NOTICE (licensing) — https://github.com/eclipse-che4z/che-che4z-lsp-for-cobol/blob/development/NOTICE.md
- GnuCOBOL home — https://gnucobol.sourceforge.io/
- GnuCOBOL on Wikipedia (licensing) — https://en.wikipedia.org/wiki/GnuCOBOL
- GnuCOBOL clone (OCamlPro) — https://github.com/OCamlPro/gnucobol
- jcl-assess (ykhwong) — https://github.com/ykhwong/jcl-assess
- ANTLR / mainframe languages background — https://medium.com/codex/antlr-magic-developing-mainframe-language-applications-using-language-recognizer-5262726e1e93
