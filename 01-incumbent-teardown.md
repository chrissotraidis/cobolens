# Incumbent Teardown: Enterprise COBOL / Mainframe Code Comprehension Tools

**Prepared for:** the Cobolens build — a free, open-source, local desktop app for COBOL code comprehension (dependency maps, diagrams, section summaries, BYO-model AI chat).
**Date:** 2026-06-29
**Purpose:** Understand the enterprise incumbents we're positioning against, what they do well, what people hate, and how a free/open/local/slick tool wins against each weakness.

---

## Executive Summary

The enterprise market for COBOL/mainframe "application discovery" and code comprehension is dominated by a handful of heavyweight, on-premises, server-installed, quote-priced products — chiefly **IBM ADDI** and **Rocket Enterprise Analyzer** (formerly Micro Focus, briefly OpenText), with **BMC AMI DevX** (formerly Compuware Topaz), **Broadcom** mainframe tooling, and a long tail of niche players (Phase Change, ASG/becubic, Fujitsu, Raincode, TSRI). Three findings dominate the landscape: (1) **pricing is universally opaque and quote-based** — no vendor publishes list prices, and total cost is typically capacity/MIPS- or named-user-based and enterprise-only; (2) **deployment is heavy** — multi-server architectures, central SQL Server/PostgreSQL/DB2 repositories, and dated Eclipse/Windows thick clients are the norm, with no real SaaS and certainly nothing local-first or free; and (3) **independent user reviews are remarkably thin** for nearly every product, so most "pain point" evidence is architectural and structural rather than a deep corpus of verbatim complaints. That thinness is itself the opportunity: these are sales-led, install-heavy, expensive tools that almost nobody loves, in a market with no beloved free/local alternative.

> **Honesty note on sourcing:** Pricing could not be verified to specific dollar figures for *any* commercial vendor here — every one is quote-based. Where a "complaint" is an inference from architecture or docs rather than a cited user review, it is labeled as such. Several niche vendors (Phase Change, Raincode, TSRI, Fujitsu, ASG/becubic) have essentially **zero** independent reviews online.

---

## 1. IBM ADDI (Application Discovery and Delivery Intelligence)

### What it is
IBM ADDI is a static-analysis / application-understanding platform for **z/OS mainframe applications** (COBOL, PL/I, JCL, and other legacy languages). IBM positions it to "visualize z/OS applications, data and jobs," "uncover dependencies, implement changes confidently and modernize systems" (https://www.ibm.com/products/app-discovery-and-delivery-intelligence). IBM's Quick Start Guide calls it "an analytical platform for z/OS application modernization... to rapidly discover and analyze relationships between application components, data, and jobs" (https://www.ibm.com/docs/en/SSRR9Q_6.1.3/pdf/addi_613_qsg.pdf).

**Mid-rebrand alert (important):** As of 2025, IBM has folded ADDI's analysis client into **watsonx Code Assistant for Z**. IBM's current docs literally state the Eclipse client "is still named IBM Application Discovery and Delivery Intelligence for IBM Z (IBM ADDI) in the interface... This is the reason why this name is also still used in the documentation" (https://www.ibm.com/docs/en/watsonx/watsonx-code-assistant-4z/2.x?topic=understand-analyzing-applications-z-eclipse-client-formerly-addi). A standalone ADDI 6.1.x line still exists (https://www.ibm.com/docs/en/addi/6.1.4?topic=addi-user-guide), but the product's identity is blurring into IBM's genAI mainframe stack — a sign of churn worth exploiting in positioning.

ADDI is a bundle, principally **IBM Application Discovery for IBM Z (IBM AD)** — "an Eclipse-based static code analysis solution" — plus **IBM Wazi Analyze**, a containerized web-UI component (https://brucedkyle.github.io/ibmcloud_for_partners/mainframe/addi/).

### Core features
- **Dependency analysis** — maps dependencies between applications, data, and jobs; auto-scans source, metadata, databases, and runtime relationships (https://www.royalcyber.com/blogs/enterprise-modernization/application-modernization-with-ibm-application-discovery-delivery-intelligence/; https://vrnexgen1.com/blog/ibm-addi-cobol-application-analysis-guide/).
- **Call graphs / diagrams** — including an "Advanced Java Call Graph" bridging mainframe calls and Java resources (https://www.ibm.com/docs/en/addi/6.1.3?topic=graphs-advanced-java-call-graph), plus program control flow, transaction flow, and data flow views.
- **Impact analysis** — "understanding capabilities, impact analysis, control and data flow analysis, and graphical and alphanumeric reports along with a database repository" (https://www.ibm.com/docs/en/addi/6.1.2?topic=configuring-ad-analyze-client).
- **Business rule discovery/extraction** — a dedicated Business Rule Discovery data provider (https://www.ibm.com/docs/en/addi/6.1.0?topic=setup-hardware-software-requirements), marketed as "Uncover Buried Treasure with Business Rule Discovery and ADDI" (https://mediacenter.ibm.com/media/Uncover+Buried+Treasure+with+Business+Rule+Discovery+and+ADDI/1_pgrx1qls).
- **Cross-application analysis** — spans mainframe and non-mainframe (Build Client for z/OS projects, Analyze Client for non-z/OS) and bridges to Java (https://www.share.org/Events/Past-Events/Proceedings/Proceeding-Details/user-experience-with-the-installation-and-configuration-plus-rollout-to-developers-of-ibm-application-discovery-and-delivery-intelligence-tool).
- **AI** — the AI story has shifted to **watsonx Code Assistant for Z**, which does code explanation in natural language for COBOL/JCL/PL-I/REXX (https://www.ibm.com/products/watsonx-code-assistant-z; https://www.ibm.com/new/announcements/ibm-watsonx-code-assistant-for-z-adds-ai-code-generation-and-assembler-support). ADDI itself is the discovery layer feeding that stack.

### Deployment
**On-premises / self-hosted, not SaaS.** Installed and configured by the customer via an installer wizard (https://www.ibm.com/docs/en/SSRR9Q_6.1.3/pdf/addi_613_qsg.pdf). A named customer's SHARE session describes ADDI spanning "Windows, SQL server, Linux, DB2, and z/OS," with **Analyze, Audit, Catalog, Batch, Configuration and Data Collector servers** plus the Build and Analyze thick clients (https://www.share.org/Events/Past-Events/Proceedings/Proceeding-Details/user-experience-with-the-installation-and-configuration-plus-rollout-to-developers-of-ibm-application-discovery-and-delivery-intelligence-tool). It embeds **WebSphere Liberty 8.5.5** and uses **Apache Derby (10-user limit) or DB2** for some components but a **dedicated Microsoft SQL Server** for production AD deployments (https://www.ibm.com/docs/en/addi/6.1.0?topic=setup-hardware-software-requirements; https://www.ibm.com/docs/en/addi/6.1.4?topic=prerequisites-cpu-ram-storage-requirements). Clients are **Eclipse/IDz-based** (https://www.ibm.com/docs/en/addi/6.1.2?topic=configuring-ad-analyze-client).

**Production hardware IBM specifies** (ADDI 6.1.4): a dedicated DB server with **64 GB RAM + 2 TB data disk**, an all-components server with **32 GB+ RAM + 2 TB disk**, and per-developer clients needing **8–16 GB RAM** (https://www.ibm.com/docs/en/addi/6.1.4?topic=prerequisites-cpu-ram-storage-requirements). This is a serious, multi-machine footprint.

### Pricing / licensing
**No public price.** Quote-based via IBM Passport Advantage; license keys obtained through IBM licensing (https://www.ibm.com/docs/en/SSRR9Q_6.1.3/pdf/addi_613_qsg.pdf). TrustRadius confirms: "does not currently have any pricing plans listed... No free version or trial is available" (https://www.trustradius.com/products/ibm-application-discovery-and-delivery-intelligence/pricing). One third-party blog claims a "per-core, per-year subscription model," which **could not be independently verified** (https://vrnexgen1.com/blog/mainframe-application-analyzer-tools/). IBM Z software generally uses MSU/MIPS-based metrics, and institutions report mainframe software spend rising 5–8% annually (https://www.ibm.com/it-infrastructure/z/software/pricing-licensing; https://redresscompliance.com/ibm-mainframe-msu-mips-licensing-reduction.html). **Treat ADDI pricing as: quote-only, enterprise-only, no free tier, likely capacity/core-based — no verifiable dollar figure.**

### Pain points
> **Honesty caveat:** Genuine first-person ADDI reviews are almost nonexistent. TrustRadius shows 1 rating and effectively no written reviews (https://www.trustradius.com/products/ibm-application-discovery-and-delivery-intelligence/reviews/all); no Gartner/G2 corpus and no Reddit/Stack Overflow threads surfaced. The pain-point narrative is therefore **architecture-driven and structurally evidenced**, not review-driven.

- **Install/config complexity** — the strongest real-world signal is the existence of a SHARE practitioner session built entirely around install "gotchas," a list of issues and resolutions, and how to build the Eclipse IDE for an end-to-end multi-server install (https://www.share.org/Events/Past-Events/Proceedings/Proceeding-Details/user-experience-with-the-installation-and-configuration-plus-rollout-to-developers-of-ibm-application-discovery-and-delivery-intelligence-tool). The multi-database, multi-server, Liberty-plus-thick-client architecture corroborates a heavy setup.
- **Eclipse-based clients** — Eclipse/IDz clients needing 8–16 GB RAM each (https://www.ibm.com/docs/en/addi/6.1.4?topic=prerequisites-cpu-ram-storage-requirements); IBM even maintains Eclipse slow-startup troubleshooting guidance for its mainframe tooling (https://developer.ibm.com/mainframe/2017/09/20/troubleshooting-guide-eclipse-slow-startup/).
- **Cost / lock-in** — quote-only, no free tier, enterprise-only purchasing, plus documented annual IBM Z cost escalation (https://redresscompliance.com/ibm-mainframe-msu-mips-licensing-reduction.html).
- **Scan/build time** — the compile-like "build" step plus 64 GB/2 TB sysreqs imply heavy processing on large portfolios (https://brucedkyle.github.io/ibmcloud_for_partners/mainframe/addi/) — an *inference*, not a cited user complaint.
- **Identity confusion** — being mid-rebrand into watsonx Code Assistant for Z (above) is a real source of customer uncertainty.

---

## 2. Rocket Enterprise Analyzer (formerly Micro Focus / OpenText)

### Critical ownership note (correct this internally)
The product commonly called "OpenText Enterprise Analyzer" is **no longer an OpenText product.** Lineage: **Relativity Technologies → Micro Focus Enterprise Analyzer → (OpenText acquired Micro Focus, 2023) → Rocket Software acquired OpenText's Application Modernization & Connectivity (AMC) business for ~$2.275B, closed 2024.** It is now **Rocket Enterprise Analyzer** (https://www.rocketsoftware.com/en-us/news/rocket-software-closes-2275b-acquisition-opentexts-application-modernization-and-connectivity; https://futurumgroup.com/insights/rocket-buying-opentexts-application-modernization-unit-for-2-billion/; https://itassetmanagement.net/2023/12/07/rocket-software-is-buying-opentexts-application-modernization-and-connectivity-business-formerly-part-of-micro-focus/). AWS docs now say "Rocket Enterprise Analyzer (formerly Micro Focus Enterprise Analyzer)" (https://docs.aws.amazon.com/m2/latest/userguide/set-up-ea.html). **Three corporate owners in ~2 years** is itself a positioning angle (vendor instability).

### What it is
Enterprise Analyzer (EA) is a **static code analysis and application-understanding suite** for large legacy/mainframe portfolios. It parses source without executing it, builds a centralized metadata repository, and powers visualizations, impact analysis, reports, and business-rule mining. Use cases: portfolio management, modernization assessment, M&A due diligence, code quality, documentation, business rule mining (https://cabs.microfocus.com/media/data-sheet/enterprise_analyzer_ds.pdf; https://www.rocketsoftware.com/sites/default/files/resource_files/enterprise-analyzer.pdf). Supports COBOL dialects, PL/I, JCL, HLASM, Natural/Adabas, Java, CICS, IMS, VSAM/QSAM/RDBMS. The bundle is **EA + Enterprise View (CIO dashboards) + Business Rule Manager**, now plus GenAI code explanation.

**Companion product — Enterprise Developer (ED):** a separate COBOL/mainframe IDE (Eclipse- or Visual Studio-based) for editing, compiling, debugging, and rehosting COBOL/PL-I/JCL/CICS/IMS off the mainframe via Enterprise Server (https://www.microfocus.com/documentation/server-cobol/51/cbintr.htm). **EA = understand/plan; ED = develop/migrate/run**, with built-in integration between them (https://cabs.microfocus.com/media/data-sheet/enterprise_analyzer_ds.pdf).

### Core features
- **Application understanding / visualization** — "rich, synchronized, always-current, interactive" views of dependencies; "interactive programs call and data dependency view between programs, files, and tables" (https://cabs.microfocus.com/media/data-sheet/enterprise_analyzer_ds.pdf; https://aws.amazon.com/blogs/mt/nalyzing-legacy-applications-on-demand-with-aws-mainframe-modernization-and-micro-focus/).
- **Diagrams** — call hierarchies, control-flow, data-flow, flow charts, an "animator" to walk through code (https://www.g2.com/products/rocket-enterprise-analyzer-formerly-a-micro-focus-product/reviews).
- **Impact analysis** — Change Analyzer traces impacts through code, data, reports, and interfaces (https://aws.amazon.com/blogs/mt/nalyzing-legacy-applications-on-demand-with-aws-mainframe-modernization-and-micro-focus/).
- **Business rule extraction** — Business Rule Manager + a code-slicing facility to separate business logic into callable objects (https://cabs.microfocus.com/media/data-sheet/enterprise_analyzer_ds.pdf).
- **Complexity metrics** — McCabe cyclomatic complexity + effort estimation; dead-code, CRUD, CICS/IMS reports (https://www.microfocus.com/documentation/enterprise-analyzer/ea405/EA/ID096AI0U0MRO.html).

### Deployment
**Windows-only thick client + central RDBMS repository.** Runs on Windows 10/11 / Server 2016–2025; the web portal's supported-browser matrix still lists **IE 6+ and Firefox 3.6+** — a tell about how dated it is (https://cabs.microfocus.com/media/data-sheet/enterprise_analyzer_ds.pdf). Repository lives in **Microsoft SQL Server or PostgreSQL** (Oracle/Db2 support phased out). Multi-user with a shared repository, a **master user** with `db_owner`, and a heavy **workspace "verification" build** that the docs admit is "the most time-consuming and hardware-intensive" step, defaulting to slow serial processing (https://www.microfocus.com/documentation/enterprise-analyzer/ea100/EA_Installation_Guide_10.0.pdf). Available on-prem or on AWS (streamed via AppStream, repository on RDS PostgreSQL); a Linux Docker deployment exists only as a **technical preview** (https://docs.aws.amazon.com/m2/latest/userguide/set-up-ea.html; https://aws.amazon.com/marketplace/pp/prodview-qpaywlo5vffa2).

### Pricing / licensing
**Quote-based, per-named-user annual subscription** (corroborated by an independent comparison: "Per-user, annual subscription," https://vrnexgen1.com/blog/mainframe-application-analysis-tools/). On AWS Marketplace it's **BYOL** with no listed price — "Contact Rocket Software for licensing and pricing details" (https://aws.amazon.com/marketplace/pp/prodview-qpaywlo5vffa2). A G2 reviewer flags "Little higher licensing costs" (https://www.g2.com/products/rocket-enterprise-analyzer-formerly-a-micro-focus-product/reviews). **No verifiable per-seat dollar amount exists.**

### Pain points (G2 is the only real first-party source — 6 reviews, ~4.5/5)
- **Slow ingestion** — "It takes too much time to upload the codebase. The Interactive Analysis feature should be easier to use" (https://www.g2.com/products/rocket-enterprise-analyzer-formerly-a-micro-focus-product/reviews).
- **Weak large-project scoping / dependency depth** — "the scoping of bigger projects and related options to get dependency, and diagrams are not that great. We do have to rely on a lot of manual analysis"; limited scheduler support; weak backtracing; missing integration for some object types (e.g., REXX), with support cases closed as "product limitations" (https://www.g2.com/products/rocket-enterprise-analyzer-formerly-a-micro-focus-product/reviews). **Notable because this is a core selling point.**
- **Setup complexity / overwhelming UI** — "Requires significant setup and configuration"; "Interface can be overwhelming for casual users" (https://www.in-com.com/blog/top-cobol-static-code-analysis-solutions-for-mission-critical-systems/).
- **Cost & vendor stability** — "Little higher licensing costs. Stability of the company" (https://www.g2.com/products/rocket-enterprise-analyzer-formerly-a-micro-focus-product/reviews) — pointed, given the triple ownership change.
- **Dated Windows UI** — a reasonable inference from the Windows-only thick client and IE6/Firefox-3.6 browser matrix, but **not** backed by a verbatim "clunky UI" review.

---

## 3. BMC AMI DevX (formerly Compuware Topaz)

### What it is
Compuware's Topaz suite (File-AID, Abend-AID, Xpediter, and Topaz for Program Analysis) was acquired by BMC and rebranded **BMC AMI DevX**. The comprehension piece — **Code Analysis / Code Insights** (ex-Topaz for Program Analysis) — provides automated program analysis/understanding for z/OS COBOL and PL/I (https://www.bmc.com/it-solutions/bmc-ami-devx-code-analysis.html; https://www.bmc.com/it-solutions/bmc-ami-devx-code-insights.html).

### Core features
- **Dependency & impact analysis** across COBOL/PL-I, including runtime dependency mapping.
- **Diagrams** — program-flow diagrams, data-flow analysis, "intuitive visualizations" of dependencies; can break apps into smaller callable subprograms.
- **GenAI (BMC AMI Assistant)** — right-click code explanation → business-logic summary + logic flow, insertable as comments; COBOL in 2024, PL/I/JCL/Assembler added 2025; won a 2025 AI Breakthrough Award (https://www.bmc.com/blogs/genai-mainframe-development-code-explanation-documentation/).

### Deployment
On-prem z/OS backend + developer workbench as **Eclipse and VS Code** plugins. No fully SaaS offering — mainframe-attached (https://www.bmc.com/it-solutions/bmc-ami-devx.html).

### Pricing
Quote-based; subscription scaled by capacity/users/bundles; visualization licensed by **concurrent users**. No verifiable figures.

### Pain points (PeerSpot has the best corpus)
- Stale Eclipse support pinned to old releases; steep learning curve; "doesn't play well with other plugins"; REXX conversion gap; confusing concurrent-user licensing; "hit or miss" installation (https://www.peerspot.com/products/bmc-compuware-topaz-workbench-reviews; https://www.peerspot.com/questions/what-needs-improvement-with-bmc-compuware-topaz-workbench).
- Counterpoint (don't overclaim): a 2025 Forrester TEI cited 50% faster onboarding, and it was a 2025 TrustRadius Top Rated product (https://www.trustradius.com/products/bmc-ami-devx/reviews).

---

## 4. Broadcom (formerly CA Technologies)

### What it is
No single "code comprehension" product — capabilities are spread across mainframe DevOps tools acquired with CA (2018) plus the newer WatchTower observability platform.

- **Endevor (Software Change Manager)** — flagship mainframe SCM; impact analysis is **change-control oriented** (cross-referencing component relationships, change-impact analysis, version recreation), not deep semantic/business-rule extraction (https://www.broadcom.com/products/mainframe/application-development-testing-devops/endevor).
- **InterTest** (CICS/Batch debugger) and **Mainframe Application Tuner** — runtime understanding of single programs, not static analysis.
- **WatchTower Platform** — closest to discovery + visualization: **Application Profiler (AP4z)** discovers apps via **runtime flow/observability** (not static source analysis); **Topology** visualizes dependencies; v24.0 added a GenAI natural-language filter assistant (https://www.broadcom.com/products/mainframe/watchtower-observability).
- **Code4z** — free VS Code extension bundling COBOL support, Endevor, and a debugger (https://marketplace.visualstudio.com/items?itemName=broadcomMFD.cobol-language-support).

### Deployment / pricing
On-prem / z/OS; workstation extensions against the host; no SaaS. Quote-based, MIPS/MSU capacity licensing; enterprise contracts commonly run six- to seven-figures/yr (exact rates unverifiable) (https://broadcomnegotiations.com/understanding-mips-msu-based-licensing-in-broadcom-ca-mainframe-deals/).

### Pain points
Outdated UX / "not appealing" interface, steep Endevor learning curve, inconsistent support, and well-documented **30–80% Broadcom renewal price hikes** post-CA-acquisition (https://www.g2.com/products/ca-endevor/reviews?qs=pros-and-cons; https://redresscompliance.com/broadcom-software-ca-mainframe-licensing-cio-playbook.html). **Takeaway:** strength is change management/debugging/tuning/observability — *not* deep static comprehension or business-rule extraction.

---

## 5. Niche & Adjacent Players (brief)

- **Phase Change Software — COBOL Colleague.** Tiny (~11–50 staff) Colorado vendor. Differentiator: **symbolic/deterministic AI** (knowledge graph + causal reasoning), explicitly positioned against statistical LLMs, claiming "100% verified understanding — no hallucinations." Strong impact-analysis and business-rule-extraction claims. Deployment model unconfirmed; no public pricing; **zero independent reviews** anywhere. Publishes blog posts attacking the idea that LLMs (e.g., Claude) truly understand COBOL — signaling they view general-purpose code LLMs as the main threat (https://phasechange.ai/; https://phasechange.ai/blog/anthropic-says-claude-code-can-analyze-cobol-heres-why-analysis-isnt-proof).
- **ASG-becubic (now Rocket).** Application discovery/portfolio tool; knowledge-base repository, complexity assessment, fine-grained parsing across 100+ technologies. On-prem server + web/rich client. Rocket acquired ASG (2021); becubic persists in docs but marketing momentum shifted to Rocket COBOL Analyzer. Quote-based; no verified becubic-specific complaints (https://www.asg.com/en/Smart-Catalog/ASG-Data-Intelligence-Application-Understanding.aspx).
- **Fujitsu.** **NetCOBOL** (compiler/IDE, a dev tool) and **PROGRESSION** (services-led automated COBOL→Java/C# modernization with embedded analysis + GenAI). No discrete interactive dependency-graph product — analysis lives inside migration engagements. Quote-based; no verifiable reviews (https://www.fujitsu.com/us/services/application-services/application-transformation/mainframe/).
- **Raincode.** Belgian "recompile, don't rewrite" compiler vendor; targets **.NET** (JVM/Java target unverified). Analysis tool **Raincode Insight** builds call graphs and dashboards but is **built on Microsoft Power BI** and is a **by-product of compilation** (must compile first), with **no business-rule extraction**. Notably, the **COBOL compiler and Insight are marketed as free**; everything else quote-based. No public review corpus (https://www.raincode.com/raincode-insight/; https://www.raincode.com/cobol-compiler/).
- **TSRI — JANUS Studio.** Model-based, highly automated assess/transform/refactor toolset (COBOL/assembler/FORTRAN → Java/C#/C++). Auto-generated HTML/UML blueprints, control/data-flow diagrams, business-rule extraction, dependency/impact analysis. **Services-led, not self-serve.** Quote/project-based. No direct user reviews; the substantive critique is category-level — the **"JOBOL" problem** (automated COBOL→Java yields non-idiomatic procedural Java) (https://tsri.com/technology/; https://intellyx.com/2022/07/16/modernizing-your-mainframe-cobol-beware-the-jobol-pitfall/).

### Free / open-source COBOL tooling (the adjacent space we'd join)
- **GnuCOBOL** — free GNU COBOL compiler; foundation of the OSS ecosystem (a compiler, not an analyzer) (https://gnucobol.sourceforge.io/).
- **SuperBOL Studio (OCamlPro)** — modern OSS VS Code environment with an **LSP code-analysis server** (navigation, completion, diagnostics, coverage) — the most active free comprehension layer (https://superbol.eu/en/).
- **ProLeap COBOL parser** — ANTLR4-based; AST + abstract semantic graph with data/control flow (https://github.com/uwol/proleap-cobol-parser).
- **Koopa** — COBOL parser tolerant of embedded CICS/SQL (https://github.com/krisds/koopa).
- **cb2xml** — COBOL copybooks → Java item tree/XML (https://github.com/bmTas/cb2xml).
- **ANTLR Cobol85 grammar** — canonical COBOL 85 grammar + preprocessor (https://github.com/antlr/grammars-v4/blob/master/cobol85/Cobol85.g4).
- **VS Code "COBOL" by bitlang (spgennard)** — popular free extension: IntelliSense, highlighting, browsing (https://marketplace.visualstudio.com/items?itemName=bitlang.cobol).

**Key gap in the free space:** these are parsers, grammars, and editor extensions. **None deliver an interactive, project-wide dependency map + diagrams + section summaries + BYO-model AI chat in a polished local desktop app.** That is open territory.

---

## 6. Synthesis: What They Do Well, What People Hate, and How We Win

### What the incumbents genuinely do well
- **Deep, mature static analysis** of huge multi-language portfolios (COBOL/PL-I/JCL/Natural/CICS/IMS), built over decades.
- **Comprehensive impact analysis** across code, data, jobs, and interfaces — the killer enterprise feature for "what breaks if I change this?"
- **Business-rule extraction** as a marketed capability (ADDI, Rocket EA's Business Rule Manager, TSRI, Phase Change).
- **Cross-platform reach** (mainframe-to-Java/.NET), enterprise governance, role-based dashboards, and CI/CD integration.
- **Trust/inertia** — they're the "nobody got fired for buying IBM" default in regulated mainframe shops.

### What people hate (the recurring, evidenced grievances)
1. **Heavy, painful deployment.** Multi-server architectures, central SQL Server/PostgreSQL/DB2 repositories, master-user/db_owner setup, 64 GB/2 TB server specs, install "gotcha" sessions (ADDI, Rocket EA).
2. **Dated, clunky clients.** Eclipse/IDz and Windows thick clients, IE6/Firefox-3.6 browser matrices, "overwhelming" interfaces, stale plugin support (Rocket EA, BMC, Broadcom, ADDI by inference).
3. **Opaque, high, escalating cost.** Universally quote-based; no free tier; capacity/MIPS or named-user licensing; documented 30–80% renewal hikes (Broadcom); "higher licensing costs" (Rocket EA).
4. **Slowness.** Slow codebase ingestion / heavy "verification" builds; serial-by-default processing (Rocket EA explicitly; ADDI by inference).
5. **Steep learning curves & manual fallback.** Big ramp-up; weak large-project scoping forces manual analysis even in tools that sell scoping as a feature (Rocket EA).
6. **Vendor churn & lock-in.** Rocket EA changed owners three times in ~2 years; ADDI is mid-rebrand into watsonx; proprietary repositories and IP-heavy services create lock-in.
7. **Sales-led, no try-before-buy.** No free version, no self-serve trial, demo-gated — friction for individual developers and small teams.

### Positioning angles for the README/pitch (free / open / local / slick wins)

| Incumbent weakness | Our winning angle |
|---|---|
| Multi-server install, DB2/SQL Server repos, 64 GB/2 TB specs, install "gotcha" sessions | **Zero-install, single desktop app.** Point it at a folder of COBOL and go. No server, no database admin, no `db_owner`. Runs on a normal laptop. |
| Dated Eclipse/Windows thick clients, IE6-era UIs | **Modern, slick, fast native desktop UX.** Built for 2026, not 2008. Interactive dependency maps and diagrams that are pleasant to use. |
| Quote-only, enterprise pricing, no free tier, 30–80% renewal hikes | **Free and open-source. $0, forever, no quote, no sales call.** No renewal trap, no capacity metering, no procurement cycle. |
| Sales-gated, demo-only, no trial | **Download and run in minutes.** Try-before-... there is no "buy." Adopt bottom-up, dev by dev. |
| Slow ingestion, heavy serial "verification" builds | **Fast local scanning** with no central repository round-trips; analysis happens on your machine. |
| Proprietary repositories, vendor lock-in, ownership churn | **Open formats, open source, your data stays local.** No lock-in, no acquisition roulette deciding your tool's future. |
| AI bolted on, cloud-tied, single-vendor (watsonx, AMI Assistant) | **Bring-your-own-model AI chat** — Anthropic, OpenAI, OpenRouter, or fully local Ollama. Your keys, your choice, including air-gapped/local for sensitive mainframe code. |
| Code never leaves... actually it often must traverse vendor infra | **Local-first = data sovereignty.** Critical for banks/insurers/government where COBOL source can't leave the building. Local Ollama option means *nothing* leaves the machine. |
| Steep learning curve, manual analysis fallback | **Approachable for any developer**, not just mainframe veterans — diagrams + plain-language section summaries + chat lower the barrier to understanding legacy code. |
| Business-rule extraction gated behind expensive modules | **Section summaries and AI chat surface business logic** for free, conversationally. |

**One-line positioning:** *The beloved, free, local, open-source alternative to the expensive, clunky, server-bound enterprise tools (IBM ADDI, Rocket Enterprise Analyzer, BMC AMI DevX) that mainframe teams are stuck with — point it at your COBOL and understand it in minutes, with the AI model of your choice, and nothing leaving your machine.*

---

## Sources

**IBM ADDI**
- https://www.ibm.com/products/app-discovery-and-delivery-intelligence
- https://www.ibm.com/docs/en/addi/6.1.4?topic=addi-user-guide
- https://www.ibm.com/docs/en/SSRR9Q_6.1.3/pdf/addi_613_qsg.pdf
- https://www.ibm.com/docs/en/watsonx/watsonx-code-assistant-4z/2.x?topic=understand-analyzing-applications-z-eclipse-client-formerly-addi
- https://brucedkyle.github.io/ibmcloud_for_partners/mainframe/addi/
- https://www.ibm.com/docs/en/addi/6.1.3?topic=graphs-advanced-java-call-graph
- https://www.ibm.com/docs/en/addi/6.1.2?topic=configuring-ad-analyze-client
- https://www.ibm.com/docs/en/addi/6.1.0?topic=setup-hardware-software-requirements
- https://www.ibm.com/docs/en/addi/6.1.4?topic=prerequisites-cpu-ram-storage-requirements
- https://mediacenter.ibm.com/media/Uncover+Buried+Treasure+with+Business+Rule+Discovery+and+ADDI/1_pgrx1qls
- https://www.share.org/Events/Past-Events/Proceedings/Proceeding-Details/user-experience-with-the-installation-and-configuration-plus-rollout-to-developers-of-ibm-application-discovery-and-delivery-intelligence-tool
- https://www.ibm.com/products/watsonx-code-assistant-z
- https://www.ibm.com/new/announcements/ibm-watsonx-code-assistant-for-z-adds-ai-code-generation-and-assembler-support
- https://www.royalcyber.com/blogs/enterprise-modernization/application-modernization-with-ibm-application-discovery-delivery-intelligence/
- https://vrnexgen1.com/blog/ibm-addi-cobol-application-analysis-guide/
- https://vrnexgen1.com/blog/mainframe-application-analyzer-tools/
- https://www.trustradius.com/products/ibm-application-discovery-and-delivery-intelligence/pricing
- https://www.trustradius.com/products/ibm-application-discovery-and-delivery-intelligence/reviews/all
- https://www.ibm.com/it-infrastructure/z/software/pricing-licensing
- https://redresscompliance.com/ibm-mainframe-msu-mips-licensing-reduction.html
- https://developer.ibm.com/mainframe/2017/09/20/troubleshooting-guide-eclipse-slow-startup/

**Rocket / Micro Focus / OpenText Enterprise Analyzer & Enterprise Developer**
- https://www.rocketsoftware.com/en-us/news/rocket-software-closes-2275b-acquisition-opentexts-application-modernization-and-connectivity
- https://futurumgroup.com/insights/rocket-buying-opentexts-application-modernization-unit-for-2-billion/
- https://itassetmanagement.net/2023/12/07/rocket-software-is-buying-opentexts-application-modernization-and-connectivity-business-formerly-part-of-micro-focus/
- https://cabs.microfocus.com/media/data-sheet/enterprise_analyzer_ds.pdf
- https://www.rocketsoftware.com/sites/default/files/resource_files/enterprise-analyzer.pdf
- https://www.microfocus.com/documentation/enterprise-analyzer/ea100/EA_Installation_Guide_10.0.pdf
- https://www.microfocus.com/documentation/enterprise-analyzer/ea405/EA/ID096AI0U0MRO.html
- https://aws.amazon.com/blogs/mt/nalyzing-legacy-applications-on-demand-with-aws-mainframe-modernization-and-micro-focus/
- https://docs.aws.amazon.com/m2/latest/userguide/set-up-ea.html
- https://aws.amazon.com/marketplace/pp/prodview-qpaywlo5vffa2
- https://www.g2.com/products/rocket-enterprise-analyzer-formerly-a-micro-focus-product/reviews
- https://www.in-com.com/blog/top-cobol-static-code-analysis-solutions-for-mission-critical-systems/
- https://vrnexgen1.com/blog/mainframe-application-analysis-tools/
- https://www.microfocus.com/documentation/server-cobol/51/cbintr.htm

**BMC AMI DevX (Compuware Topaz)**
- https://www.bmc.com/it-solutions/bmc-ami-devx-code-analysis.html
- https://www.bmc.com/it-solutions/bmc-ami-devx.html
- https://www.bmc.com/it-solutions/bmc-ami-devx-code-insights.html
- https://www.bmc.com/blogs/genai-mainframe-development-code-explanation-documentation/
- https://www.peerspot.com/products/bmc-compuware-topaz-workbench-reviews
- https://www.peerspot.com/questions/what-needs-improvement-with-bmc-compuware-topaz-workbench
- https://www.g2.com/products/bmc-ami-devx/reviews
- https://www.trustradius.com/products/bmc-ami-devx/reviews

**Broadcom (CA)**
- https://www.broadcom.com/products/mainframe/application-development-testing-devops/endevor
- https://www.broadcom.com/products/mainframe/watchtower-observability
- https://www.broadcom.com/products/mainframe/watchtower-observability/ap4z
- https://www.broadcom.com/products/mainframe/watchtower-observability/topology
- https://broadcomnegotiations.com/understanding-mips-msu-based-licensing-in-broadcom-ca-mainframe-deals/
- https://redresscompliance.com/broadcom-software-ca-mainframe-licensing-cio-playbook.html
- https://www.g2.com/products/ca-endevor/reviews?qs=pros-and-cons
- https://marketplace.visualstudio.com/items?itemName=broadcomMFD.cobol-language-support

**Niche players**
- https://phasechange.ai/
- https://phasechange.ai/technology
- https://phasechange.ai/business-functions
- https://phasechange.ai/blog/anthropic-says-claude-code-can-analyze-cobol-heres-why-analysis-isnt-proof
- https://www.asg.com/en/Smart-Catalog/ASG-Data-Intelligence-Application-Understanding.aspx
- https://docs.rocketsoftware.com/bundle/becubic_Installation_and_Implementation_Guide_V8.8.0/resource/becubic_Installation_and_Implementation_Guide_V8.8.0.pdf
- https://www.rocketsoftware.com/en-us/news/rocket-software-extends-its-technology-and-global-reach-agreement-acquire-asg-technologies
- https://archives.global.fujitsu/global/products/software/developer-tool/netcobol/
- https://www.fujitsu.com/us/services/application-services/application-transformation/mainframe/
- https://www.raincode.com/cobol/
- https://www.raincode.com/cobol-compiler/
- https://www.raincode.com/raincode-insight/
- https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/app-modernization/raincode-reference-architecture
- https://tsri.com/technology/
- https://tsri.com/cobol-modernization/
- https://intellyx.com/2022/07/16/modernizing-your-mainframe-cobol-beware-the-jobol-pitfall/
- https://cmfirstgroup.com/overcoming-the-jobol-problem-when-converting-cobol-to-java/

**Free / open-source COBOL tooling**
- https://gnucobol.sourceforge.io/
- https://superbol.eu/en/
- https://github.com/uwol/proleap-cobol-parser
- https://github.com/krisds/koopa
- https://github.com/bmTas/cb2xml
- https://github.com/antlr/grammars-v4/blob/master/cobol85/Cobol85.g4
- https://marketplace.visualstudio.com/items?itemName=bitlang.cobol
