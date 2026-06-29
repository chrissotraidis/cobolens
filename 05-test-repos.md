# Test COBOL Repositories & Corpora

*Open codebases to develop and benchmark the tool against — so you never need a real bank's production code to build, demo, or test.*

These fall into three buckets: (1) **realistic mainframe estates** with JCL + copybooks + CICS/DB2 (best for testing the dependency-mapping engine), (2) **benchmark/eval datasets** (good for measuring AI answer quality), and (3) **smaller sample programs** (good for first-run demos and unit tests).

---

## 1. Realistic mainframe estates (best for the dependency map)

These have the cross-file wiring — JCL → program → copybook → file/DB2 — that is the whole point of the tool.

- **COBOL Legacy Benchmark Suite** — `sentientsergio/COBOL-Legacy-Benchmark-Suite`. Purpose-built investment-portfolio system that deliberately simulates real legacy complexity: VSAM files, DB2, CICS transactions, error handling. Built specifically to test LLM translation/comprehension tools. *This is your best primary test target.*
  https://github.com/sentientsergio/COBOL-Legacy-Benchmark-Suite
- **IBM Z Open Editor sample** — `IBM/zopeneditor-sample`. COBOL + PL/I + HLASM + REXX with JCL and data files, and copybooks that pass parameters between programs (e.g. SAM1 → SAM2 via SAM2PARM). Realistic IBM Enterprise COBOL dialect — good for testing dialect fidelity.
  https://github.com/IBM/zopeneditor-sample
- **dscobol/Cobol-Projects** — source + copybooks + JCL meant to run on MVS/z/OS. Real-world structure.
  https://github.com/dscobol/Cobol-Projects
- **mapa's own test fixtures** — the `mapa` parser repo (`cschneid-the-elder/mapa`) ships COBOL+CICS+DB2+JCL samples for its static-analysis tests; convenient because they're known to parse.
  https://github.com/cschneid-the-elder/mapa

## 2. Benchmark / evaluation datasets (for measuring AI quality)

- **MainframeBench** — `Fsoft-AIC/MainframeBench` (Hugging Face). The eval set behind XMAiNframe: multiple-choice mainframe knowledge, Q&A, and COBOL code summarization. Use it to score how good the "explain this" feature is across different models.
  https://huggingface.co/datasets/Fsoft-AIC/MainframeBench
- **COBOLEval** (bloop.ai) — 146 problems ported from HumanEval into COBOL; oriented to code *generation* correctness. Relevant if/when you add write features.
  https://bloop.ai/blog/evaluating-llms-on-cobol

## 3. Smaller samples (first-run demo + unit tests)

- **opensource-cobol** — `opensourcecobol/opensource-cobol`. Real compiler + sample programs.
  https://github.com/opensourcecobol/opensource-cobol
- **awesome-cobol** — `loveOSS/awesome-cobol`. Curated index pointing to many more COBOL repos, libraries, and sample apps.
  https://github.com/loveOSS/awesome-cobol
- **writ3it/cobol-examples** — set of COBOL examples, with JCL-aware tooling.
  https://github.com/writ3it/cobol-examples
- **Azure-Samples/Legacy-Modernization-Agents** — Microsoft's open COBOL→Java agent project bundles sample COBOL you can reuse, and is worth studying as a direct "talk to your codebase" comparable.
  https://github.com/Azure-Samples/Legacy-Modernization-Agents

---

## Recommended testing approach

1. **Primary dev target:** COBOL Legacy Benchmark Suite — exercises JCL/copybook/CICS/DB2 resolution, the hard part.
2. **Dialect stress test:** IBM Z Open Editor sample — confirms the bundled parser handles real IBM Enterprise COBOL, not just NIST COBOL-85. (See `02-parser-landscape.md` — dialect coverage is the softest claim; this is how you check it for real.)
3. **First-run demo:** bundle one small, clean sample (a few programs + copybooks + one JCL) **inside the app** so a new user gets the "whoa" in 30 seconds without finding their own COBOL. (Pull a compact subset from opensource-cobol or zopeneditor-sample, license permitting.)
4. **AI quality scoring:** run MainframeBench across each supported model (Anthropic / OpenAI / OpenRouter / local Ollama) so you can publish an honest "which brain is best" comparison — itself good marketing.

---

## Sources
- [COBOL Legacy Benchmark Suite](https://github.com/sentientsergio/COBOL-Legacy-Benchmark-Suite)
- [IBM Z Open Editor sample](https://github.com/IBM/zopeneditor-sample) · [sample files docs](https://ibm.github.io/zopeneditor-about/Docs/samplefiles.html)
- [dscobol/Cobol-Projects](https://github.com/dscobol/Cobol-Projects) · [writ3it/cobol-examples](https://github.com/writ3it/cobol-examples)
- [MainframeBench dataset](https://huggingface.co/datasets/Fsoft-AIC/MainframeBench) · [COBOLEval](https://bloop.ai/blog/evaluating-llms-on-cobol)
- [opensource-cobol](https://github.com/opensourcecobol/opensource-cobol) · [awesome-cobol](https://github.com/loveOSS/awesome-cobol)
- [Azure-Samples/Legacy-Modernization-Agents](https://github.com/Azure-Samples/Legacy-Modernization-Agents)
