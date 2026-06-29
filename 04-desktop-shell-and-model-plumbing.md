# Desktop Shell & Multi-Provider Model Plumbing
### Technical stack research for a free, open-source, local COBOL-analysis desktop app
*Research date: June 2026*

---

## Executive Summary

You are building a free, open-source desktop app that points at a COBOL codebase, produces a dependency map + diagrams + summaries, and offers AI chat with bring-your-own-model support (Anthropic key, OpenAI key, OpenRouter key, or a fully local Ollama model). The headline selling point is that it can run **fully local / air-gapped** so code never leaves the machine.

After researching both the desktop shell and the model-abstraction layer, the recommendation is:

- **Desktop shell: Tauri (v2).** It produces dramatically smaller, faster, more memory-efficient apps than Electron, is secure by default, runs on Mac/Windows/Linux, and has a first-class **sidecar** feature for bundling and spawning an external parser binary. This matters because the app needs to ship a COBOL parser and talk to a local Ollama server.
- **Model abstraction: Vercel AI SDK** (TypeScript) if the app frontend is JS/TS, which is the natural choice for a slick UI. It natively/communities-cover all four providers (Anthropic, OpenAI, OpenRouter, Ollama) behind one interface. **LiteLLM** is the equivalent if any Python sidecar does the model calls instead.
- **Local model approach: Ollama.** It exposes a simple local REST API on `localhost:11434`, handles model pulling, runs 7B models on ~16 GB RAM, and provides an embeddings endpoint for the retrieval layer.
- **Token strategy: retrieval/RAG over the dependency graph is the correct pattern.** Sending only the relevant slice of code (selected via the dependency map) rather than dumping whole files reduces cost and improves answer quality. This is well-supported by current RAG literature.

The honest tradeoff: Tauri's smaller footprint comes from using the OS's native WebView, which can introduce minor cross-platform rendering inconsistencies versus Electron's bundled Chromium. For this app (utility tool, not a pixel-perfect design product) that tradeoff strongly favors Tauri.

---

## PART A — Desktop App Shell

### 1. Tauri vs Electron

| Dimension | Tauri (v2) | Electron |
|---|---|---|
| **Installer / bundle size** | Typically **under 10 MB**; Hoppscotch went 165 MB → 8 MB migrating to Tauri | **80–150+ MB** (bundles Chromium + Node) |
| **Idle memory** | ~**30–50 MB** | ~**150–300 MB** |
| **Startup time** | Under ~0.5 s | ~1–2 s |
| **Security** | Secure by default; Rust core (memory-safe); fine-grained API permissions; sandboxed WebView | Full Node API access in renderer is a known attack surface; requires careful hardening |
| **Rendering engine** | OS native WebView (WebView2/Edge on Windows, WebKitGTK on Linux, WebKit on macOS) — small but can vary slightly per-OS | Bundled Chromium — identical rendering everywhere |
| **Maturity / ecosystem** | Younger, fast-growing, smaller plugin ecosystem | Very mature, huge ecosystem, battle-tested (VS Code, Slack, Discord) |
| **Cross-platform** | Mac / Windows / Linux | Mac / Windows / Linux |

Sources: [gethopp.app/blog/tauri-vs-electron](https://www.gethopp.app/blog/tauri-vs-electron), [peerlist.io deep technical comparison](https://peerlist.io/jagss/articles/tauri-vs-electron-a-deep-technical-comparison), [pkgpulse.com/guides/electron-vs-tauri-2026](https://www.pkgpulse.com/guides/electron-vs-tauri-2026), [blog.openreplay.com](https://blog.openreplay.com/comparing-electron-tauri-desktop-applications/).

**Recommendation: Tauri.**

For this specific use case — *fast, slick, local-first, ships a bundled parser, talks to local Ollama* — Tauri wins on nearly every axis that matters:

- **"Fast and slick"**: sub-half-second startup and 30–50 MB memory make the app feel native, not like a heavyweight browser.
- **"Free and open-source"**: a tiny installer is a real distribution advantage and signals quality.
- **"Fully local / air-gapped"**: Tauri's secure-by-default, permission-scoped model is a better story for a privacy-focused tool than Electron's full-Node-access default.
- **"May run a bundled parser + talk to Ollama"**: Tauri's sidecar feature (below) is purpose-built for exactly this.

The main reason teams still pick Electron — guaranteed identical Chromium rendering and the deepest plugin ecosystem — is far less important for a developer utility than for a consumer design app. Choose Electron only if the team is already deeply JS/Node-skilled and wants to avoid any Rust at all; even then, the model-calling code can live in the WebView regardless of shell.

### 2. Implications for Bundling a Parser

The COBOL parser is the deciding architectural detail. Three scenarios:

#### If the parser is **Java / JVM** (e.g., a parser built on ANTLR, ProLeap COBOL parser, or similar — common in the COBOL tooling world)

- **Tauri**: Use the **sidecar** mechanism. You declare `externalBin` in `tauri.conf.json`, place a platform-suffixed binary (e.g. `my-sidecar-aarch64-apple-darwin`) in `src-tauri/binaries/`, and spawn it from Rust (`app.shell().sidecar()`) or JS (`Command.sidecar("my-sidecar")`). Arguments and access are scoped via capabilities/permissions. ([v2.tauri.app/develop/sidecar](https://v2.tauri.app/develop/sidecar/)) Tauri even documents a **Node.js-as-a-sidecar** pattern, and the same approach applies to any executable. ([v2.tauri.app/learn/sidecar-nodejs](https://v2.tauri.app/learn/sidecar-nodejs/))
  - The catch with a JVM parser: you cannot ship a `.jar` and assume Java is installed on the user's machine. You either (a) bundle a JRE alongside the sidecar, or (b) compile the Java parser to a self-contained native image (e.g., GraalVM native-image) so the sidecar is a single platform binary with no JVM dependency. Option (b) keeps installs small and keeps the "just works offline" promise.
- **Electron**: Bundle the JRE/JDK via electron-builder's `extraResources` (it can populate per-OS/per-arch JDK folders), then spawn the Java process as a child process. Note that in bundled Electron apps `process.execPath` is not the system Java, so the JRE must be shipped and referenced explicitly via `extraFiles`/`extraResources`. There is also an `electron-java` npm helper. ([dev.to/krud/spring-boot-electron](https://dev.to/krud/spring-boot-electron-a-case-study-2p75), [npmjs.com/package/electron-java](https://www.npmjs.com/package/electron-java))

**Net:** Both shells can ship a JVM parser, but both pay the same "you must bundle a runtime" tax. Bundling a ~40–60 MB JRE into a Tauri app partially erodes Tauri's size advantage — which is a strong argument for compiling the parser to a **native binary** (GraalVM native-image, or a parser written in Rust/Go) so the sidecar is a single small executable.

#### If the parser is **native** (Rust, Go, C, or GraalVM native-image)

- Best fit for Tauri. A native COBOL parser written in Rust could even be compiled directly into the Tauri Rust backend (no separate process needed), giving the smallest, fastest, most secure result. A Go/C binary ships cleanly as a sidecar with no runtime to bundle.

#### If the parser is **WASM**

- Tauri serves a frontend (HTML/CSS/JS and optionally WASM) to its WebView, so a WASM parser can run **inside the WebView** with no separate process. The documented pattern is to "put deterministic data handling in WebAssembly, keep privileged file/system access behind Tauri." ([techbytes.app WebAssembly + Tauri](https://techbytes.app/posts/webassembly-tauri-3-secure-desktop-apps-2026/), [v2.tauri.app/start/frontend](https://v2.tauri.app/start/frontend/)) WASM is sandboxed, portable across all OSes with zero platform-specific binaries, and needs no bundled runtime — the cleanest distribution story of all, at the cost of WASM's performance ceiling and ecosystem maturity for COBOL parsing specifically.

**Parser recommendation:** prefer a **native or WASM** parser to preserve Tauri's small/fast/offline advantages. If the only mature COBOL parser available is JVM-based (e.g., ProLeap/ANTLR), compile it to a GraalVM native image and ship it as a Tauri sidecar rather than bundling a full JRE.

---

## PART B — Multi-Provider Model Plumbing

The goal: don't hand-roll four separate integrations. Use one abstraction that already speaks Anthropic, OpenAI, OpenRouter, and Ollama.

### 1. Libraries That Unify the Four Providers

| Library | Language | Anthropic | OpenAI | OpenRouter | Ollama (local) | Notes |
|---|---|---|---|---|---|---|
| **Vercel AI SDK** | TypeScript/JS | Native | Native | Community provider (`@openrouter/ai-sdk-provider`, 300+ models) | Community provider (`ollama-ai-provider`) | Best fit for a JS/TS Tauri frontend; streaming + tool-calling built in |
| **LiteLLM** | Python | Yes | Yes | Yes | Yes | Unifies 100+ providers in OpenAI format; usable as SDK or as a local proxy/gateway |
| **LangChain.js** | TypeScript/JS | Yes | Yes | via OpenAI-compatible base URL | Yes (`ChatOllama`) | Heavier abstraction; good if you want chains/agents/retrievers out of the box |

Sources: [ai-sdk.dev providers-and-models](https://ai-sdk.dev/docs/foundations/providers-and-models), [ai-sdk.dev OpenRouter community provider](https://ai-sdk.dev/providers/community-providers/openrouter), [github.com/OpenRouterTeam/ai-sdk-provider](https://github.com/OpenRouterTeam/ai-sdk-provider), [npmjs.com/package/@openrouter/ai-sdk-provider](https://www.npmjs.com/package/@openrouter/ai-sdk-provider), [github.com/BerriAI/litellm](https://github.com/BerriAI/litellm), [docs.litellm.ai/docs/providers](https://docs.litellm.ai/docs/providers).

**Key insight:** All three cover all four providers, but the cleanest path depends on where your model-calling code lives:

- **If model calls happen in the Tauri WebView (TypeScript): use the Vercel AI SDK.** Anthropic and OpenAI are first-party providers; OpenRouter and Ollama are well-maintained community providers. You write one set of calls and swap providers by config. This keeps the whole app in one language and avoids shipping Python.
- **If you already plan a Python sidecar (e.g., for parsing/embeddings): LiteLLM** gives the same unification in Python and can also run as a tiny local gateway so the WebView talks to a single OpenAI-compatible endpoint regardless of the chosen backend.

A useful architectural trick: because **OpenRouter and Ollama are both OpenAI-compatible** at the API level, even a thin custom layer can target them by just swapping the base URL and key. But using the AI SDK / LiteLLM saves you from re-implementing streaming, retries, tool-calling, and per-provider quirks. Recommendation: don't build it from scratch — use the AI SDK.

### 2. How Ollama Local Integration Works

- **REST API:** Ollama runs a local server at `http://localhost:11434` exposing chat, text generation, embeddings, and model-management endpoints — no authentication, because it's local. ([localaimaster.com/blog/ollama-system-requirements](https://localaimaster.com/blog/ollama-system-requirements))
- **Model pulling:** Users run `ollama pull <model>` (e.g., a 7B model) which downloads a ~4–5 GB quantized model file. The app can trigger/monitor pulls via the API. ([sitepoint.com/ollama-setup-guide-2026](https://www.sitepoint.com/ollama-setup-guide-2026/))
- **Hardware for ~7B models:**
  - Absolute baseline: **8 GB RAM**, ~10 GB free disk, 64-bit CPU with AVX2, **no GPU required**.
  - A 7B model at Q4_K_M needs ~4–6 GB (model + KV cache + overhead). **16 GB system RAM** is the realistic minimum to run a 7B model alongside normal dev tools.
  - Performance: CPU-only on a modern 8-core chip (Apple M2 / Ryzen 7) ≈ **5–15 tokens/sec**; with a 16 GB Apple Silicon Mac or an 8–12 GB NVIDIA GPU, ≈ **30–60 tokens/sec** for 7B–14B.
  - Sources: [localaimaster.com RAM requirements](https://localaimaster.com/blog/ram-requirements-local-ai), [localllm.in VRAM requirements](https://localllm.in/blog/ollama-vram-requirements-for-local-llms).
- **Embeddings:** Ollama exposes an embeddings endpoint; pairing it with a vector store (e.g., ChromaDB) is the standard way to build local RAG. Embedding models are lightweight and run on modest hardware. ([sitepoint.com](https://www.sitepoint.com/ollama-setup-guide-2026/)) This means **the entire retrieval pipeline — embeddings + generation — can run fully offline through Ollama.**

### 3. How OpenRouter Works (and Why It Helps Here)

OpenRouter is a hosted aggregator: **one OpenAI-compatible endpoint** (`https://openrouter.ai/api/v1/chat/completions`) and **one API key** reach **300–400+ models from 60+ providers** (OpenAI, Anthropic, Google, Meta, Mistral, etc.). You POST with a `Bearer` key and a `model` name; existing OpenAI client code works after changing the base URL. It adds intelligent routing, automatic failover, and consolidated billing. ([techjacksolutions.com what-is-openrouter](https://techjacksolutions.com/ai-tools/llm-gateways/what-is-openrouter/), [openrouter.ai/docs/quickstart](https://openrouter.ai/docs/quickstart), [datastudios.org OpenRouter explained](https://www.datastudios.org/post/openrouter-explained-how-one-api-connects-developers-to-many-ai-models-through-unified-requests-pr))

**Why it's valuable for this app:** for users who don't want to manage separate Anthropic and OpenAI keys, OpenRouter gives them **one key that unlocks dozens of models**, including the ability to try cheaper or newer models without code changes. It's the "easy cloud" tier between "fully local Ollama" and "bring your own single-vendor key."

### 4. Cost & Privacy: Local Mode vs Cloud-Key Mode

This distinction is the core of the product's value proposition and should be surfaced explicitly in the UI.

| | **Local mode (Ollama)** | **Cloud-key mode (Anthropic / OpenAI / OpenRouter)** |
|---|---|---|
| **What leaves the machine** | **Nothing.** Inference runs on `localhost`; code, prompts, and embeddings never traverse the network. True air-gap capable. | The prompt — i.e., the **retrieved code slices + the question** — is sent to the provider's servers over the network. |
| **Cost** | Free after model download; cost is local compute/electricity. | Per-token API cost billed by the provider (OpenRouter consolidates billing across vendors). |
| **Privacy posture** | Maximum; suitable for regulated/classified COBOL (banking, government, insurance — the typical COBOL audience). | Depends on the vendor's data-handling terms; code is exposed to a third party. |
| **Quality ceiling** | Bounded by local 7B–14B models and user hardware. | Access to frontier models (Claude, GPT, etc.). |

For a COBOL audience (banks, insurers, government) the **fully-local option is often a hard requirement**, which makes Ollama support a differentiator, not a nice-to-have. The UI should make it unmistakable when data will leave the machine.

### 5. Token Efficiency: Retrieval Over the Dependency Graph

**Confirmed: retrieval/RAG over the code graph is the correct pattern**, not dumping whole files.

The RAG literature is consistent that retrieval acts as a *focus mechanism* — selecting a small relevant subset produces better answers than a giant text dump, because sprawling context makes the model "waste tokens and attention on content that isn't actually needed." ([gpt-trainer.com RAG chunking strategy](https://gpt-trainer.com/blog/rag+chunking+strategy)) For code specifically, the standard approach treats the repository as retrievable segments (functions, files, doc blocks) and pulls relevant chunks via lexical or semantic similarity. ([arxiv.org/pdf/2510.04905 — repository-level code RAG survey](https://arxiv.org/pdf/2510.04905))

The app already builds a **dependency map**, which is a structural advantage over generic text RAG. Two complementary techniques apply:

- **Graph-guided retrieval:** Use the dependency graph to decide *which* program/copybook/paragraph slices are relevant to a question, then send only those. This is more precise than blind embedding similarity because COBOL dependencies (CALL, COPY, PERFORM) are explicit and parseable.
- **Parent-child chunking:** Retrieve small precise "child" chunks (a paragraph), but swap in the larger "parent" block (the program/section) when many children from the same unit are hit — preserving enough connective context while staying token-efficient. ([weaviate.io/blog/chunking-strategies-for-rag](https://weaviate.io/blog/chunking-strategies-for-rag), [neo4j.com advanced RAG techniques](https://neo4j.com/blog/genai/advanced-rag-techniques/))

**Practical payoff:** sending a 2–5 KB relevant slice instead of a 200 KB file directly cuts cloud token cost by orders of magnitude, fits inside the smaller context windows of local 7B models, and improves answer quality. The dependency map *is* the retrieval index — this is the right architecture.

---

## RECOMMENDED STACK

| Layer | Recommendation | Why |
|---|---|---|
| **Desktop shell** | **Tauri v2** | Tiny (<10 MB) installer, 30–50 MB RAM, sub-0.5 s startup, secure-by-default, cross-platform, first-class sidecar support for the parser and clean local-Ollama communication. |
| **Parser packaging** | **Native or WASM parser** via Tauri sidecar / WebView; if forced to use a JVM parser, compile to a **GraalVM native image** rather than bundling a JRE | Preserves Tauri's small/fast/offline advantages; avoids shipping a heavy runtime. |
| **Model abstraction** | **Vercel AI SDK** (TypeScript, in the WebView) — Anthropic + OpenAI native, OpenRouter + Ollama via community providers; **LiteLLM** if a Python sidecar does model calls instead | One interface for all four providers; don't build it from scratch. Provider swap is config, not code. |
| **Local model** | **Ollama** (`localhost:11434`) for chat + embeddings | Simple local REST API, model pulling, runs 7B on ~16 GB RAM, fully offline/air-gapped, free. |
| **Easy cloud tier** | **OpenRouter** (one key, 300+ models) plus optional direct Anthropic/OpenAI keys | Lowers friction for users who don't want to manage multiple vendor keys. |
| **Context strategy** | **Graph-guided RAG** over the dependency map + parent-child chunking | Sends only relevant code slices — cheaper, higher quality, fits small local context windows. |

### Honest Tradeoffs

- **Tauri's native WebView** can render slightly differently across Mac/Windows/Linux versus Electron's bundled Chromium. For a developer utility this is acceptable; for a pixel-perfect design product it would not be. Budget some cross-platform UI QA.
- **Tauri is younger** than Electron with a smaller plugin ecosystem; if the team is purely JS/Node and wants zero Rust, there will be a small learning curve (most app logic can still stay in TypeScript in the WebView).
- **A JVM parser undercuts Tauri's size win** unless compiled to a native image — make the parser choice deliberately, early.
- **Local 7B models are weaker** than frontier cloud models. The bring-your-own-model design correctly lets users trade privacy for quality; graph-guided retrieval narrows that gap by feeding the local model only what it needs.
- **Vercel AI SDK's OpenRouter/Ollama providers are community-maintained**, not first-party — stable and widely used, but worth pinning versions and monitoring.

---

## Sources

**Part A — Desktop shell:**
- https://www.gethopp.app/blog/tauri-vs-electron
- https://peerlist.io/jagss/articles/tauri-vs-electron-a-deep-technical-comparison
- https://www.pkgpulse.com/guides/electron-vs-tauri-2026
- https://blog.openreplay.com/comparing-electron-tauri-desktop-applications/
- https://v2.tauri.app/develop/sidecar/
- https://v2.tauri.app/learn/sidecar-nodejs/
- https://v2.tauri.app/start/frontend/
- https://techbytes.app/posts/webassembly-tauri-3-secure-desktop-apps-2026/
- https://dev.to/krud/spring-boot-electron-a-case-study-2p75
- https://www.npmjs.com/package/electron-java

**Part B — Model plumbing:**
- https://ai-sdk.dev/docs/foundations/providers-and-models
- https://ai-sdk.dev/providers/community-providers/openrouter
- https://github.com/OpenRouterTeam/ai-sdk-provider
- https://www.npmjs.com/package/@openrouter/ai-sdk-provider
- https://github.com/BerriAI/litellm
- https://docs.litellm.ai/docs/providers
- https://docs.litellm.ai/docs/
- https://localaimaster.com/blog/ollama-system-requirements
- https://localaimaster.com/blog/ram-requirements-local-ai
- https://localllm.in/blog/ollama-vram-requirements-for-local-llms
- https://www.sitepoint.com/ollama-setup-guide-2026/
- https://techjacksolutions.com/ai-tools/llm-gateways/what-is-openrouter/
- https://openrouter.ai/docs/quickstart
- https://www.datastudios.org/post/openrouter-explained-how-one-api-connects-developers-to-many-ai-models-through-unified-requests-pr
- https://gpt-trainer.com/blog/rag+chunking+strategy
- https://arxiv.org/pdf/2510.04905
- https://weaviate.io/blog/chunking-strategies-for-rag
- https://neo4j.com/blog/genai/advanced-rag-techniques/
