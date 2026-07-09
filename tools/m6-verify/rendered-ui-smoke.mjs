#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distRoot = resolve(repoRoot, "dist");

if (!existsSync(resolve(distRoot, "index.html"))) {
  console.error("Rendered UI smoke needs dist/index.html. Run npm run build first.");
  process.exit(1);
}

let cdp;

async function main() {
  const appPort = await freePort();
  const cdpPort = await freePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "cobolens-ui-smoke-profile-"));
  const server = await startStaticServer(distRoot, appPort);
  const browser = await launchBrowser(cdpPort, userDataDir);

  try {
    const appUrl = `http://127.0.0.1:${appPort}/`;
    const pageWs = await createBrowserPage(cdpPort, appUrl);
    cdp = await JsonWebSocket.connect(pageWs);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await setViewport(1365, 900);
    await waitFor(() => evaluate("document.title === 'Cobolens'"), "Cobolens page title");
    await waitFor(() => evaluate("Boolean(document.querySelector('.topbar-import'))"), "top-bar import action");

    const initial = await pageState();
    assertEqual(initial.importProjectButtons, 1, "first run shows one Import Project action");
    assertEqual(initial.sampleButtons, 1, "first run shows one Sample action");
    assertEqual(initial.firstRunGuideLabel, "First run path", "first run guide is labeled in the navigator");
    assertEqual(initial.firstRunStepCount, 3, "first run guide gives a short path");
    assert(initial.firstRunGuideText.includes("Import Project"), "first run guide points to project import");
    assert(initial.firstRunGuideText.includes("Sample"), "first run guide points to the sample graph");
    assert(initial.firstRunGuideText.includes("AI"), "first run guide explains AI is optional");
    assertEqual(initial.graphEmptyStepCount, 3, "empty graph canvas gives a short getting-started path");
    assert(initial.graphEmptyText.includes("Import"), "empty graph canvas points to import");
    assert(initial.graphEmptyText.includes("Sample"), "empty graph canvas points to sample");
    assert(initial.graphEmptyText.includes("AI"), "empty graph canvas explains AI is optional");
    assertEqual(initial.sourceTabDisabled, "true", "Source starts disabled until a source-backed symbol is selected");
    assertEqual(initial.browserImportInputHidden, "true", "browser folder input stays hidden behind Import Project");
    assertEqual(initial.searchLabel, "", "top search has no redundant visible label");
    assertEqual(initial.searchPlaceholder, "Find programs, copybooks, jobs...", "top search keeps a concrete placeholder");
    assertEqual(initial.privacyDotLabel, "Local: no code leaves", "top bar keeps local privacy status as a compact labeled dot");
    assertEqual(
      initial.skipLinks,
      "Skip to navigator=>#navigator-panel|Skip to workspace=>#dependency-graph|Skip to inspector=>#inspector-panel",
      "skip links point at the major work areas",
    );
    assertEqual(
      initial.landmarkTargets,
      "navigator-panel:Navigator:-1|dependency-graph:Workspace:-1|inspector-panel:Inspector:-1",
      "major work areas are named and programmatically focusable",
    );
    await click('.skip-links a[href="#navigator-panel"]');
    await waitFor(() => evaluate("document.activeElement?.id === 'navigator-panel'"), "skip link focuses navigator");
    await click('.skip-links a[href="#dependency-graph"]');
    await waitFor(() => evaluate("document.activeElement?.id === 'dependency-graph'"), "skip link focuses workspace");
    await click('.skip-links a[href="#inspector-panel"]');
    await waitFor(() => evaluate("document.activeElement?.id === 'inspector-panel'"), "skip link focuses inspector");
    assertEqual(initial.navigatorTogglePressed, "false", "navigator toggle starts expanded");
    assertEqual(initial.navigatorToggleLabel, "Hide navigator panel", "navigator toggle names the expanded action");
    assertEqual(initial.inspectorTogglePressed, "true", "inspector toggle starts expanded");
    assertEqual(initial.inspectorToggleLabel, "Hide inspector panel", "inspector toggle names the expanded action");
    assert(initial.navigatorPanelWidth > 200, "navigator starts as a usable side panel");
    assert(initial.inspectorPanelWidth > 300, "inspector starts as a usable side panel");
    assert(!initial.topbarText.includes("Local: no code leaves"), "top bar no longer spends visible space on the local privacy sentence");
    assert(!initial.hasOverlay, "first run has no framework error overlay");
    await focusAndClick('button[aria-label="Open settings"]');
    await waitFor(() => evaluate("Boolean(document.querySelector('.settings-dialog[role=\"dialog\"][aria-modal=\"true\"]'))"), "settings dialog opens");
    await waitFor(() => evaluate("document.activeElement?.classList.contains('settings-dialog')"), "settings dialog receives focus");
    const settingsOpen = await pageState();
    assertEqual(settingsOpen.settingsDialogTitle, "Settings", "settings dialog keeps a named title");
    assertEqual(settingsOpen.settingsDialogFocused, "true", "settings dialog receives focus when opened");
    assertEqual(
      settingsOpen.settingsReadinessLabels,
      "Ollama server|Generation model|Embedding model|Semantic index|Test",
      "settings exposes the local AI readiness steps",
    );
    assertEqual(settingsOpen.settingsUsageLabel, "AI usage and token estimate", "settings keeps AI usage labeled");
    assert(
      settingsOpen.settingsText.includes("Graph answers need no model"),
      "settings states that graph answers do not require AI",
    );
    assert(
      settingsOpen.settingsText.includes("Scan settings apply when Cobolens is running as the desktop app."),
      "browser settings explain that scan controls belong to the desktop app",
    );
    await pressKey(".settings-dialog", "Escape");
    await waitFor(() => evaluate("!document.querySelector('.settings-dialog')"), "settings dialog closes with Escape");
    await waitFor(
      () => evaluate("document.activeElement?.getAttribute('aria-label') === 'Open settings'"),
      "settings dialog restores focus to opener",
    );
    await click(".brand .rail-toggle");
    await waitFor(() => evaluate("document.querySelector('.shell')?.classList.contains('rail-collapsed')"), "navigator panel collapses");
    const navigatorCollapsed = await pageState();
    assertEqual(navigatorCollapsed.navigatorTogglePressed, "true", "navigator toggle reports collapsed state");
    assertEqual(navigatorCollapsed.navigatorToggleLabel, "Show navigator panel", "navigator toggle names the collapsed action");
    assertEqual(navigatorCollapsed.navigatorPanelDisplay, "none", "navigator collapse hides the navigator panel");
    assert(navigatorCollapsed.centerPanelWidth > initial.centerPanelWidth, "navigator collapse gives workspace more room");
    await click(".brand .rail-toggle");
    await waitFor(() => evaluate("!document.querySelector('.shell')?.classList.contains('rail-collapsed')"), "navigator panel restores");
    const navigatorRestored = await pageState();
    assert(navigatorRestored.navigatorPanelWidth > 200, "navigator restore returns the navigator panel");
    assert(navigatorRestored.centerPanelWidth < navigatorCollapsed.centerPanelWidth, "navigator restore returns workspace width");
    await click(".topbar-actions .rail-toggle");
    await waitFor(() => evaluate("document.querySelector('.shell')?.classList.contains('inspector-collapsed')"), "inspector panel collapses");
    const inspectorCollapsed = await pageState();
    assertEqual(inspectorCollapsed.inspectorTogglePressed, "false", "inspector toggle reports collapsed state");
    assertEqual(inspectorCollapsed.inspectorToggleLabel, "Show inspector panel", "inspector toggle names the collapsed action");
    assertEqual(inspectorCollapsed.inspectorPanelDisplay, "none", "inspector collapse hides the inspector panel");
    assert(inspectorCollapsed.centerPanelWidth > navigatorRestored.centerPanelWidth, "inspector collapse gives workspace more room");
    await click(".topbar-actions .rail-toggle");
    await waitFor(() => evaluate("!document.querySelector('.shell')?.classList.contains('inspector-collapsed')"), "inspector panel restores");
    const inspectorRestored = await pageState();
    assert(inspectorRestored.inspectorPanelWidth > 300, "inspector restore returns the inspector panel");
    assert(inspectorRestored.centerPanelWidth < inspectorCollapsed.centerPanelWidth, "inspector restore returns workspace width");

    await setFileInputFiles(".project-import-input", [
      resolve(repoRoot, "fixtures/m6-bakeoff/src/LINEAGE.cbl"),
      resolve(repoRoot, "fixtures/m6-bakeoff/copybook/CUSTOMER.cpy"),
      resolve(repoRoot, "fixtures/m6-bakeoff/copybook/REPORT.cpy"),
      resolve(repoRoot, "fixtures/m6-bakeoff/jcl/DAILYLN.jcl"),
    ]);
    await waitFor(() => evaluate("document.body.innerText.includes('Imported project')"), "browser project import");
    await waitFor(
      () => evaluate("Boolean(document.querySelector('button[aria-label=\"Focus CUSTOMER, Copybook\"]'))"),
      "imported codebase tree",
    );
    const imported = await pageState();
    assert(imported.leftText.includes("Imported project"), "browser import labels the loaded project");
    assert(imported.leftText.includes("LINEAGE"), "browser import discovers the LINEAGE program");
    assert(imported.leftText.includes("CUSTOMER"), "browser import discovers the CUSTOMER copybook");
    await click('button[aria-label="Focus CUSTOMER, Copybook"]');
    await waitFor(() => evaluate("document.querySelector('#dependency-graph')?.innerText.includes('CUSTOMER-RECORD')"), "imported source opens");

    await click(".topbar-sample");
    await waitFor(
      () => evaluate("Boolean(document.querySelector('button[aria-label=\"Focus CUSTOMER, Copybook\"]'))"),
      "sample codebase tree",
    );
    const loaded = await pageState();
    assertEqual(loaded.importProjectButtons, 1, "loaded sample keeps one Import Project action");
    assertEqual(loaded.sampleButtons, 1, "loaded sample keeps one Sample action");
    assert(!loaded.topbarText.includes("Local: no code leaves"), "loaded sample keeps privacy as a compact status dot");
    assert(!loaded.leftText.includes("INGEST"), "left rail no longer shows ingest block");
    assert(!loaded.leftText.includes("Demo mode"), "left rail does not carry browser-mode filler copy");
    assert(!loaded.leftText.includes("SEARCH RESULTS"), "idle left rail hides search results");
    assert(
      loaded.leftText.indexOf("CODEBASE") >= 0 && loaded.leftText.indexOf("CODEBASE") < loaded.leftText.indexOf("LEGEND & FILTERS"),
      "left rail prioritizes Codebase before filters",
    );
    await clickButtonStartingWith(".summary-action-buttons button", "Ask follow-up");
    await waitFor(() => evaluate("document.querySelector('.inspector-tabs button[aria-selected=\"true\"] span')?.textContent?.trim() === 'Chat'"), "Overview Ask follow-up opens Chat");
    await waitFor(() => evaluate("document.activeElement?.matches('.chat-composer textarea')"), "Overview Ask follow-up focuses Chat composer");
    const followUp = await pageState();
    assert(!followUp.shellClass.includes("is-ask-focused"), "Ask tab does not add focused styling to the workspace shell");
    assert(followUp.rightPaneClass.includes("is-ask-focused"), "Ask tab styling is scoped to the inspector pane");
    assert(Math.abs(followUp.centerPanelWidth - loaded.centerPanelWidth) <= 1, "Ask tab does not resize the workspace");
    assert(followUp.chatQuestionValue.startsWith("Explain "), "Overview Ask follow-up drafts an explain question");
    assert(followUp.chatQuestionValue.endsWith(" in plain English."), "Overview Ask follow-up drafts a plain-English prompt");
    await click('button[aria-label="Overview"]');
    await waitFor(() => evaluate("document.querySelector('.inspector-tabs button[aria-selected=\"true\"] span')?.textContent?.trim() === 'Overview'"), "Overview tab restores after follow-up check");
    const overviewRestored = await pageState();
    assert(!overviewRestored.rightPaneClass.includes("is-ask-focused"), "Overview tab removes inspector-only Ask styling");
    assert(Math.abs(overviewRestored.centerPanelWidth - loaded.centerPanelWidth) <= 1, "Overview restore keeps workspace width stable");
    await clickButtonStartingWith(".summary-action-buttons button", "View source");
    await waitFor(() => evaluate("document.querySelector('.view-toggle button:nth-child(2)')?.className.includes('is-active')"), "Overview View source opens Source");
    await waitFor(() => evaluate("document.activeElement?.id === 'code-panel'"), "Overview View source focuses source panel");
    const overviewSource = await pageState();
    assert(overviewSource.workspaceText.includes("LINEAGE") || overviewSource.workspaceText.includes("CUSTOMER"), "Overview View source shows selected source text");
    await click(".view-toggle button:nth-child(1)");
    await waitFor(() => evaluate("document.querySelector('.view-toggle button:nth-child(1)')?.className.includes('is-active')"), "Map toggle restores map after Overview View source");
    assertEqual(loaded.secondaryNavigatorDetails, 4, "left rail groups filters and status into four secondary accordions");
    assertEqual(loaded.closedSecondaryNavigatorDetails, 4, "secondary navigator accordions start collapsed");
    await clickNavigatorSummary("Inventory");
    await waitFor(() => evaluate("Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details[open] > summary')).some((summary) => summary.textContent?.includes('Inventory'))"), "Inventory accordion opens");
    const inventory = await pageState();
    assertEqual(
      inventory.inventoryMetrics,
      "Files:4|Parsed:4|Source programs:1|Copybooks:2|JCL jobs:1|JCL steps:1|External refs:3",
      "Inventory accordion reports source-backed units and external refs",
    );
    await clickNavigatorSummary("Parse Health");
    await waitFor(() => evaluate("Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details[open] > summary')).some((summary) => summary.textContent?.includes('Parse Health'))"), "Parse Health accordion opens");
    const parseHealth = await pageState();
    assert(parseHealth.parseHealthText.includes("4/4 parsed"), "Parse Health reports parsed file count");
    assert(parseHealth.parseHealthText.includes("Dialect: IBM Enterprise COBOL-like + JCL"), "Parse Health reports analyzer dialect");
    assert(parseHealth.parseHealthText.includes("No parse warnings."), "Parse Health reports warning-free sample");
    await clickNavigatorSummary("Graph Hints");
    await waitFor(() => evaluate("Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details[open] > summary')).some((summary) => summary.textContent?.includes('Graph Hints'))"), "Graph Hints accordion opens");
    const graphHints = await pageState();
    assert(graphHints.graphHintsText.includes("Potentially unreferenced"), "Graph Hints reports the source-unit metric");
    assert(graphHints.graphHintsText.includes("No unreferenced source units recorded."), "Graph Hints reports the clean sample state");
    assert(graphHints.graphHintsText.includes("Based on recorded incoming graph edges"), "Graph Hints explains the heuristic");
    await clickNavigatorSummary("Legend & Filters");
    await waitFor(() => evaluate("Boolean(document.querySelector('details.navigator-details[open] .filter-grid'))"), "legend filters accordion opens");
    const legendInitial = await pageState();
    assertEqual(legendInitial.legendFilterStatus, "All types visible", "legend filters start with every node type visible");
    assertEqual(legendInitial.legendResetDisabled, "true", "legend filter Reset starts disabled");
    assertEqual(legendInitial.dataItemsFilterChecked, "true", "data-item filter starts checked");
    await click(".view-toggle button:nth-child(1)");
    await waitFor(() => evaluate("document.querySelector('.view-toggle button:nth-child(1)')?.className.includes('is-active')"), "Map toggle activates before node-list check");
    await waitFor(() => evaluate("Boolean(document.querySelector('.graph-toolbar-actions .toggle-button'))"), "graph node-list toggle appears");
    const nodeListClosed = await pageState();
    assertEqual(nodeListClosed.nodeListTogglePressed, "false", "graph node-list toggle starts unpressed");
    assertEqual(nodeListClosed.nodeListToggleLabel, "List the nodes visible on the map", "graph node-list toggle names the closed action");
    await click(".graph-toolbar-actions .toggle-button");
    await waitFor(() => evaluate("Boolean(document.querySelector('.graph-node-list[aria-label=\"Visible graph nodes\"]'))"), "graph node list opens");
    const nodeListOpen = await pageState();
    assertEqual(nodeListOpen.nodeListTogglePressed, "true", "graph node-list toggle reports the open state");
    assertEqual(nodeListOpen.nodeListToggleLabel, "Hide the list of visible nodes", "graph node-list toggle names the open action");
    assert(nodeListOpen.visibleNodeControlCount > 0, "graph node list exposes keyboard-accessible node controls");
    const allVisibleNodeCount = nodeListOpen.visibleNodeControlCount;
    await clickLegendFilter("Data items");
    await waitFor(async () => (await pageState()).legendFilterStatus === "1 type hidden", "legend filter reports one hidden type");
    await waitFor(
      () => evaluate(`document.querySelectorAll('.graph-node-list[aria-label="Visible graph nodes"] button').length < ${allVisibleNodeCount}`),
      "legend filter reduces visible graph nodes",
    );
    const filteredNodeList = await pageState();
    assertEqual(filteredNodeList.legendFilterStatus, "1 type hidden", "legend filter status reflects hidden node type");
    assertEqual(filteredNodeList.legendResetDisabled, "false", "legend filter Reset enables after hiding a type");
    assertEqual(filteredNodeList.dataItemsFilterChecked, "false", "data-item filter checkbox reflects hidden state");
    assert(
      filteredNodeList.visibleNodeControlCount < allVisibleNodeCount,
      "legend filter changes the visible graph node list",
    );
    await clickLegendReset();
    await waitFor(async () => (await pageState()).legendFilterStatus === "All types visible", "legend filter Reset restores all types");
    await waitFor(
      () => evaluate(`document.querySelectorAll('.graph-node-list[aria-label="Visible graph nodes"] button').length === ${allVisibleNodeCount}`),
      "legend filter Reset restores visible graph nodes",
    );
    const resetNodeList = await pageState();
    assertEqual(resetNodeList.legendFilterStatus, "All types visible", "legend filter status resets cleanly");
    assertEqual(resetNodeList.legendResetDisabled, "true", "legend filter Reset disables after reset");
    assertEqual(resetNodeList.dataItemsFilterChecked, "true", "data-item filter checkbox restores after reset");
    await click(".graph-toolbar-actions .toggle-button");
    await waitFor(() => evaluate("!document.querySelector('.graph-node-list')"), "graph node list closes");

    await click('button[aria-label="Focus CUSTOMER, Copybook"]');
    await waitFor(() => evaluate("document.querySelector('.view-toggle button:nth-child(2)')?.className.includes('is-active')"), "Source tab after tree click");
    await waitFor(() => evaluate("document.querySelector('#dependency-graph')?.innerText.includes('CUSTOMER-RECORD')"), "CUSTOMER source text after tree click");
    const customerSource = await pageState();
    assert(customerSource.workspaceText.includes("CUSTOMER-RECORD"), "CUSTOMER tree click opens source text");
    assertEqual(customerSource.sourceLineChip, "lines 1-6", "source toolbar names the selected symbol range");
    assertEqual(customerSource.sourceInlineHeaderDisplay, "none", "center Source hides duplicate in-snippet header");
    assertEqual(customerSource.sourceLineTextWhiteSpace, "pre", "Source line text preserves COBOL columns");
    assert(["auto", "scroll"].includes(customerSource.sourcePreOverflowX), "Source code block can scroll horizontally");
    assert(customerSource.sourceLineNumberCount >= 6, "Source view renders line numbers with the source text");
    assert(customerSource.selectedSourceRangeRows >= 6, "source view highlights the selected symbol range");
    assertEqual(customerSource.sourceFileValue, "copybook/CUSTOMER.cpy", "source file picker reflects the selected source");
    await selectOption(".source-file-picker select", "copybook/REPORT.cpy");
    await waitFor(() => evaluate("document.querySelector('#dependency-graph')?.innerText.includes('REPORT-RECORD')"), "source picker opens REPORT copybook");
    const reportSource = await pageState();
    assertEqual(reportSource.sourceFileValue, "copybook/REPORT.cpy", "source file picker switches to REPORT");
    assertEqual(reportSource.sourceLineChip, "lines 1-6", "source toolbar names the switched source range");
    assert(reportSource.workspaceText.includes("REPORT-AMOUNT"), "source picker loads the switched file text");
    await selectOption(".source-file-picker select", "copybook/CUSTOMER.cpy");
    await waitFor(() => evaluate("document.querySelector('#dependency-graph')?.innerText.includes('CUSTOMER-RECORD')"), "source picker returns to CUSTOMER copybook");
    await click(".view-toggle button:nth-child(1)");
    await waitFor(() => evaluate("document.querySelector('.view-toggle button:nth-child(1)')?.className.includes('is-active')"), "Map toggle activates");
    const customerMap = await pageState();
    assertEqual(customerMap.graphExpandButtonText, "", "graph toolbar hides Expand when the focus has no hidden neighbors");
    await click(".view-toggle button:nth-child(2)");
    await waitFor(() => evaluate("document.querySelector('.view-toggle button:nth-child(2)')?.className.includes('is-active')"), "Source toggle restores source");
    await verifyResponsiveLayout();

    await click('button[aria-label^="Dependencies"]');
    await click('button[aria-label="Used by: show LINEAGE COPIES CUSTOMER at src/LINEAGE.cbl:11"]');
    await waitFor(() => evaluate("document.querySelector('.source-focus-note')?.innerText.includes('src/LINEAGE.cbl:11')"), "dependency row opens focused source");
    await waitFor(() => evaluate("document.activeElement?.id === 'code-panel'"), "dependency source jump focuses source panel");
    const relationshipDetail = await pageState();
    assert(relationshipDetail.relationshipText.includes("LINEAGE COPIES CUSTOMER"), "relationship detail names the selected relationship");
    assert(relationshipDetail.relationshipText.includes("source") && relationshipDetail.relationshipText.includes("target"), "relationship detail explains source and target roles");
    assertEqual(relationshipDetail.relationshipEndpointsLabel, "Relationship endpoints", "relationship endpoints group is named");
    assertEqual(relationshipDetail.relationshipSourceButtonLabel, "Focus relationship source LINEAGE", "relationship detail can refocus source endpoint");
    assertEqual(relationshipDetail.relationshipTargetButtonLabel, "Focus relationship target CUSTOMER", "relationship detail can refocus target endpoint");
    await click('button[aria-label="Focus relationship target CUSTOMER"]');
    await waitFor(() => evaluate("document.querySelector('.source-file-picker select')?.value === 'copybook/CUSTOMER.cpy'"), "relationship target endpoint refocuses CUSTOMER");
    const relationshipTarget = await pageState();
    assertEqual(relationshipTarget.sourceLineChip, "lines 1-6", "relationship target endpoint restores selected source range");
    await click('button[aria-label="Used by: show LINEAGE COPIES CUSTOMER at src/LINEAGE.cbl:11"]');
    await waitFor(() => evaluate("document.querySelector('.source-focus-note')?.innerText.includes('src/LINEAGE.cbl:11')"), "relationship source citation reopens after endpoint focus");
    await waitFor(() => evaluate("document.activeElement?.id === 'code-panel'"), "relationship source citation refocuses source panel");

    await fill('.global-search input[type="search"]', "PIC");
    await waitFor(() => evaluate("document.body.innerText.includes('No matching graph symbols')"), "honest PIC empty state");
    await pressKey('.global-search input[type="search"]', "Escape");
    await waitFor(() => evaluate("document.querySelector('.global-search input[type=\"search\"]')?.value === ''"), "Escape clears symbol search");
    await fill('.global-search input[type="search"]', "SQLCODE");
    await waitFor(() => evaluate("Boolean(document.querySelector('button[aria-label=\"Search result SQLCODE data-item\"]'))"), "SQLCODE search result");
    await pressKey('.global-search input[type="search"]', "Enter");
    await waitFor(() => evaluate("document.querySelector('.source-line.is-highlighted')?.innerText.includes('SQLCODE')"), "SQLCODE source jump");
    const keyboardSearch = await pageState();
    assertEqual(keyboardSearch.searchValue, "", "Enter clears symbol search after opening the top result");

    await click('button[aria-label="Focus CUSTOMER, Copybook"]');
    await click('button[aria-label="Chat"]');
    await fill(".chat-composer textarea", "What uses CUSTOMER?");
    await click(".chat-send-button");
    await waitFor(() => evaluate("document.querySelector('.chat-answer-bubble')?.innerText.includes('CUSTOMER')"), "plain chat answer");
    const chat = await pageState();
    assertEqual(chat.chatComposerVisible, "true", "Ask composer remains visible after an answer");
    assertEqual(chat.chatComposerAfterAnswer, "true", "Ask composer stays at the bottom after the answer");
    assertEqual(chat.chatComposerInputDisabled, "false", "Ask composer input is ready for another question");
    assert(chat.answerResponseText.includes("What uses CUSTOMER?"), "plain chat keeps the question visible");
    assert(chat.answerResponseText.includes("CUSTOMER"), "plain chat keeps the answer visible");
    assertEqual(chat.visibleEvidenceRows, 0, "Chat answer does not render evidence rows");
    assertEqual(chat.evidenceMoreText, "", "Chat answer does not render evidence controls");
    await fill(".chat-composer textarea", "What is this copybook?");
    await click(".chat-send-button");
    await waitFor(() => evaluate("document.querySelectorAll('.chat-turn').length >= 2"), "second chat turn appears");
    const secondChat = await pageState();
    assert(secondChat.answerResponseText.includes("What uses CUSTOMER?"), "second Ask keeps the previous question visible");
    assert(secondChat.answerResponseText.includes("What is this copybook?"), "second Ask adds the new question");
    assertEqual(secondChat.chatComposerVisible, "true", "Ask composer remains visible after multiple turns");
    assertEqual(secondChat.chatComposerAfterAnswer, "true", "Ask composer stays below multiple turns");

    await loadAskExpansionSmokeGraph();
    await click(".view-toggle button:nth-child(1)");
    await waitFor(() => evaluate("document.querySelector('.graph-toolbar-actions button')?.innerText.startsWith('Expand')"), "synthetic graph exposes expansion control");
    await click(".graph-toolbar-actions .toggle-button");
    await waitFor(() => evaluate("Boolean(document.querySelector('.graph-node-list[aria-label=\"Visible graph nodes\"]'))"), "synthetic graph node list opens before expansion");
    const syntheticBeforeExpand = await pageState();
    assert(syntheticBeforeExpand.visibleNodeControlCount > 0, "synthetic graph exposes visible node controls before expansion");
    assert(syntheticBeforeExpand.graphExpandButtonText.startsWith("Expand +"), "synthetic graph names the hidden-neighbor expansion");
    await clickButtonStartingWith(".graph-toolbar-actions button", "Expand");
    await waitFor(() => evaluate("document.querySelector('.graph-toolbar-actions button')?.innerText.trim() === 'Collapse'"), "synthetic graph expanded");
    await waitFor(
      () => evaluate(`document.querySelectorAll('.graph-node-list[aria-label="Visible graph nodes"] button').length > ${syntheticBeforeExpand.visibleNodeControlCount}`),
      "synthetic graph expansion increases visible node controls",
    );
    const syntheticExpanded = await pageState();
    assertEqual(syntheticExpanded.graphExpandButtonText, "Collapse", "synthetic graph switches expansion control to Collapse");
    assert(
      syntheticExpanded.visibleNodeControlCount > syntheticBeforeExpand.visibleNodeControlCount,
      "synthetic graph expansion reveals additional nodes",
    );
    await click('button[aria-label="Chat"]');
    await fill(".chat-composer textarea", "What uses HUB?");
    await click(".chat-send-button");
    await waitFor(() => evaluate("document.querySelector('.chat-answer-bubble')?.innerText.includes('Matched HUB')"), "synthetic graph Ask answer");
    await waitFor(() => evaluate("document.querySelector('.graph-toolbar-actions button')?.innerText.trim() === 'Collapse'"), "graph Ask preserves expanded context");

    console.log(JSON.stringify({
      checks: {
        "visible import action": true,
        "first-run browser path is visible and honest": true,
        "runtime skip links focus major landmarks": true,
        "settings dialog opens with honest AI, scan setup, and focus": true,
        "top-bar panel toggles reclaim and restore workspace width": true,
        "graph node list toggles with button state": true,
        "legend filters hide and reset node types": true,
        "browser project import": true,
        "single sample action": true,
        "Overview Ask follow-up focuses Chat composer": true,
        "Ask tab styling stays scoped to the inspector": true,
        "Overview View source focuses source reader": true,
        "navigator status sections are secondary accordions": true,
        "Inventory accordion reports loaded counts": true,
        "Parse Health accordion reports loaded status": true,
        "Graph Hints accordion reports loaded status": true,
        "tree selection opens Source": true,
        "source file picker switches files": true,
        "source reader preserves code layout and toolbar context": true,
        "source range highlight is visible": true,
        "Map and Source toggle explicitly": true,
        "responsive stack keeps workspace, Source, and controls usable": true,
        "dependency row opens and focuses source": true,
        "relationship detail names and exposes endpoints": true,
        "relationship endpoint refocuses source target": true,
        "symbol search keyboard flow is honest": true,
        "Ask composer stays available while reading answers": true,
        "Ask preserves previous Q&A turns": true,
        "Chat stays plain without evidence chrome": true,
        "graph expansion reveals hidden visible-node controls": true,
        "graph toolbar hides Expand when complete": true,
        "graph Ask preserves expanded context": true,
      },
    }, null, 2));
  } finally {
    cdp?.close();
    browser.kill();
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 1_000);
      browser.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
}

async function pageState() {
  return evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map((button) => button.innerText.trim());
    const leftText = document.querySelector('.left-pane')?.innerText ?? '';
    const workspaceText = document.querySelector('#dependency-graph')?.innerText ?? '';
    const firstRunGuide = document.querySelector('.first-run-guide');
    const graphEmptySteps = document.querySelector('.graph-empty-steps');
    const skipLinks = Array.from(document.querySelectorAll('.skip-links a'))
      .map((link) => (link.textContent?.trim() ?? '') + '=>' + (link.getAttribute('href') ?? ''))
      .join('|');
    const landmarkTargets = ['navigator-panel', 'dependency-graph', 'inspector-panel']
      .map((id) => {
        const element = document.getElementById(id);
        return id + ':' + (element?.getAttribute('aria-label') ?? '') + ':' + (element?.getAttribute('tabindex') ?? '');
      })
      .join('|');
    const inventoryDetails = Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details'))
      .find((details) => details.querySelector('summary')?.textContent?.includes('Inventory'));
    const inventoryMetrics = Array.from(inventoryDetails?.querySelectorAll('.metric-row') ?? [])
      .map((row) => (row.querySelector('span')?.textContent?.trim() ?? '') + ':' + (row.querySelector('strong')?.textContent?.trim() ?? ''))
      .join('|');
    const parseHealthDetails = Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details'))
      .find((details) => details.querySelector('summary')?.textContent?.includes('Parse Health'));
    const parseHealthText = parseHealthDetails?.innerText ?? '';
    const graphHintsDetails = Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details'))
      .find((details) => details.querySelector('summary')?.textContent?.includes('Graph Hints'));
    const graphHintsText = graphHintsDetails?.innerText ?? '';
    const legendDetails = Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details'))
      .find((details) => details.querySelector('summary')?.textContent?.includes('Legend & Filters'));
    const dataItemsFilter = Array.from(legendDetails?.querySelectorAll('.filter-row') ?? [])
      .find((row) => row.textContent?.includes('Data items'))
      ?.querySelector('input');
    const navigatorPanel = document.querySelector('.left-pane');
    const centerPanel = document.querySelector('.center-pane');
    const inspectorPanel = document.querySelector('.right-pane');
    const chatComposer = document.querySelector('.chat-composer');
    const chatComposerInput = document.querySelector('.chat-composer textarea');
    const answerResponse = document.querySelector('.chat-answer-bubble');
    const navigatorToggle = document.querySelector('.brand .rail-toggle');
    const inspectorToggle = document.querySelector('.topbar-actions .rail-toggle');
    return {
      importProjectButtons: buttons.filter((text) => text === 'Import Project').length,
      sampleButtons: buttons.filter((text) => text === 'Sample').length,
      firstRunGuideLabel: firstRunGuide?.getAttribute('aria-label') ?? '',
      firstRunGuideText: firstRunGuide?.innerText ?? '',
      firstRunStepCount: firstRunGuide?.querySelectorAll('li').length ?? 0,
      graphEmptyText: document.querySelector('.graph-empty-card')?.innerText ?? '',
      graphEmptyStepCount: graphEmptySteps?.querySelectorAll('li').length ?? 0,
      sourceTabDisabled: String(document.querySelector('.view-toggle button:nth-child(2)')?.disabled ?? false),
      browserImportInputHidden: String(document.querySelector('.project-import-input')?.getAttribute('aria-hidden') === 'true'),
      searchLabel: document.querySelector('.global-search span')?.textContent?.trim() ?? '',
      searchValue: document.querySelector('.global-search input')?.value ?? '',
      searchPlaceholder: document.querySelector('.global-search input')?.getAttribute('placeholder') ?? '',
      exportToast: document.querySelector('.export-toast')?.innerText ?? '',
      privacyDotLabel: document.querySelector('.privacy-dot')?.getAttribute('aria-label') ?? '',
      skipLinks,
      landmarkTargets,
      shellClass: document.querySelector('.shell')?.className ?? '',
      rightPaneClass: document.querySelector('.right-pane')?.className ?? '',
      navigatorPanelDisplay: navigatorPanel ? getComputedStyle(navigatorPanel).display : '',
      inspectorPanelDisplay: inspectorPanel ? getComputedStyle(inspectorPanel).display : '',
      navigatorPanelWidth: Math.round(navigatorPanel?.getBoundingClientRect().width ?? 0),
      centerPanelWidth: Math.round(centerPanel?.getBoundingClientRect().width ?? 0),
      inspectorPanelWidth: Math.round(inspectorPanel?.getBoundingClientRect().width ?? 0),
      navigatorTogglePressed: navigatorToggle?.getAttribute('aria-pressed') ?? '',
      navigatorToggleLabel: navigatorToggle?.getAttribute('aria-label') ?? '',
      inspectorTogglePressed: inspectorToggle?.getAttribute('aria-pressed') ?? '',
      inspectorToggleLabel: inspectorToggle?.getAttribute('aria-label') ?? '',
      settingsDialogTitle: document.querySelector('#settings-title')?.textContent?.trim() ?? '',
      settingsDialogFocused: String(document.activeElement?.classList.contains('settings-dialog') ?? false),
      settingsReadinessLabels: Array.from(document.querySelectorAll('.readiness-step strong'))
        .map((element) => element.textContent?.trim() ?? '')
        .join('|'),
      settingsUsageLabel: document.querySelector('.ai-usage')?.getAttribute('aria-label') ?? '',
      settingsText: document.querySelector('.settings-dialog')?.innerText ?? '',
      topbarText: document.querySelector('.topbar')?.innerText ?? '',
      leftText,
      workspaceText,
      secondaryNavigatorDetails: document.querySelectorAll('.navigator-secondary details.navigator-details').length,
      closedSecondaryNavigatorDetails: document.querySelectorAll('.navigator-secondary details.navigator-details:not([open])').length,
      inventoryMetrics,
      parseHealthText,
      graphHintsText,
      legendFilterStatus: legendDetails?.querySelector('.pane-heading-row .settings-footnote')?.textContent?.trim() ?? '',
      legendResetDisabled: String(legendDetails?.querySelector('.pane-heading-row button')?.disabled ?? false),
      dataItemsFilterChecked: String(dataItemsFilter?.checked ?? false),
      sourceLineChip: document.querySelector('.source-line-chip')?.textContent?.trim() ?? '',
      sourceFileValue: document.querySelector('.source-file-picker select')?.value ?? '',
      sourceInlineHeaderDisplay: document.querySelector('.center-source-view .source-header') ? getComputedStyle(document.querySelector('.center-source-view .source-header')).display : '',
      sourceLineTextWhiteSpace: document.querySelector('.source-line-text') ? getComputedStyle(document.querySelector('.source-line-text')).whiteSpace : '',
      sourcePreOverflowX: document.querySelector('.center-source-view pre') ? getComputedStyle(document.querySelector('.center-source-view pre')).overflowX : '',
      sourceLineNumberCount: document.querySelectorAll('.source-line-number').length,
      selectedSourceRangeRows: document.querySelectorAll('.source-line.is-selected-range').length,
      focusedCitationMarker: document.querySelector('.source-line.is-citation-line .source-line-marker')?.textContent?.trim() ?? '',
      relationshipText: document.querySelector('.relationship-card')?.innerText ?? '',
      relationshipEndpointsLabel: document.querySelector('.relationship-flow')?.getAttribute('aria-label') ?? '',
      relationshipSourceButtonLabel: document.querySelector('.relationship-node-button[aria-label^="Focus relationship source"]')?.getAttribute('aria-label') ?? '',
      relationshipTargetButtonLabel: document.querySelector('.relationship-node-button[aria-label^="Focus relationship target"]')?.getAttribute('aria-label') ?? '',
      nodeListTogglePressed: document.querySelector('.graph-toolbar-actions .toggle-button')?.getAttribute('aria-pressed') ?? '',
      nodeListToggleLabel: document.querySelector('.graph-toolbar-actions .toggle-button')?.getAttribute('aria-label') ?? '',
      graphExpandButtonText: Array.from(document.querySelectorAll('.graph-toolbar-actions button:not(.toggle-button)'))
        .map((button) => button.textContent?.trim() ?? '')
        .find(Boolean) ?? '',
      visibleNodeControlCount: document.querySelectorAll('.graph-node-list[aria-label="Visible graph nodes"] button').length,
      visibleEvidenceRows: document.querySelectorAll('.evidence-block .citation-list button').length,
      evidenceMoreText: document.querySelector('.evidence-more-toggle')?.textContent?.trim() ?? '',
      activeElementId: document.activeElement?.id ?? '',
      activeInspectorTab: document.querySelector('.inspector-tabs button[aria-selected="true"] span')?.textContent?.trim() ?? '',
      chatComposerVisible: String(Boolean(chatComposer && getComputedStyle(chatComposer).display !== 'none' && chatComposer.getBoundingClientRect().height > 0)),
      chatComposerBeforeAnswer: String(Boolean(chatComposer && answerResponse && chatComposer.getBoundingClientRect().top < answerResponse.getBoundingClientRect().top)),
      chatComposerAfterAnswer: String(Boolean(chatComposer && answerResponse && chatComposer.getBoundingClientRect().top > answerResponse.getBoundingClientRect().top)),
      chatComposerInputDisabled: String(chatComposerInput?.disabled ?? false),
      chatQuestionValue: document.querySelector('.chat-composer textarea')?.value ?? '',
      chatComposerFocused: String(document.activeElement?.matches('.chat-composer textarea') ?? false),
      answerResponseText: Array.from(document.querySelectorAll('.chat-turn')).map((turn) => turn.innerText ?? '').join('\\n'),
      hasOverlay: document.body.innerText.includes('Internal server error') || document.body.innerText.includes('plugin:vite')
    };
  })()`);
}

async function clickNavigatorSummary(label) {
  await evaluate(`(() => {
    const summary = Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details > summary'))
      .find((element) => element.textContent?.includes(${JSON.stringify(label)}));
    if (!summary) throw new Error('Missing navigator summary: ${label}');
    summary.click();
    return true;
  })()`);
}

async function clickLegendFilter(label) {
  await evaluate(`(() => {
    const row = Array.from(document.querySelectorAll('.navigator-secondary .filter-row'))
      .find((element) => element.textContent?.includes(${JSON.stringify(label)}));
    if (!row) throw new Error('Missing legend filter: ${label}');
    const input = row.querySelector('input');
    if (!input) throw new Error('Missing legend filter input: ${label}');
    input.click();
    return true;
  })()`);
}

async function clickLegendReset() {
  await evaluate(`(() => {
    const details = Array.from(document.querySelectorAll('.navigator-secondary details.navigator-details'))
      .find((element) => element.querySelector('summary')?.textContent?.includes('Legend & Filters'));
    const reset = details?.querySelector('.pane-heading-row button');
    if (!reset) throw new Error('Missing legend filter Reset');
    reset.click();
    return true;
  })()`);
}

async function click(selector) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing element: ${selector}');
    element.click();
    return true;
  })()`);
}

async function focusAndClick(selector) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing element: ${selector}');
    element.focus();
    element.click();
    return true;
  })()`);
}

async function clickButtonStartingWith(selector, prefix) {
  await evaluate(`(() => {
    const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find((button) => button.textContent?.trim().startsWith(${JSON.stringify(prefix)}));
    if (!element) throw new Error('Missing button starting with ${prefix}: ${selector}');
    element.click();
    return true;
  })()`);
}

async function fill(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing input: ${selector}');
    element.focus();
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function pressKey(selector, key) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing keyboard target: ${selector}');
    element.focus();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));
    return true;
  })()`);
}

async function selectOption(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing select: ${selector}');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function setFileInputFiles(selector, files) {
  const root = commonDirectory(files);
  const payload = await Promise.all(files.map(async (filePath) => {
    const rel = relative(root, filePath).split(sep).join("/");
    return {
      name: basename(filePath),
      relativePath: `${basename(root)}/${rel}`,
      text: await readFile(filePath, "utf8"),
    };
  }));
  const fileCount = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing file input: ${selector}');
    const transfer = new DataTransfer();
    for (const item of ${JSON.stringify(payload)}) {
      const file = new File([item.text], item.name, { type: 'text/plain' });
      Object.defineProperty(file, 'webkitRelativePath', { configurable: true, value: item.relativePath });
      transfer.items.add(file);
    }
    Object.defineProperty(element, 'files', {
      configurable: true,
      get() {
        return transfer.files;
      },
    });
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return element.files.length;
  })()`);
  if (fileCount !== files.length) {
    throw new Error(`Expected ${files.length} selected files, got ${fileCount}`);
  }
}

function commonDirectory(files) {
  if (!files.length) return repoRoot;
  let commonParts = dirname(files[0]).split(sep);
  for (const filePath of files.slice(1)) {
    const parts = dirname(filePath).split(sep);
    let index = 0;
    while (index < commonParts.length && index < parts.length && commonParts[index] === parts[index]) {
      index += 1;
    }
    commonParts = commonParts.slice(0, index);
  }
  return commonParts.join(sep) || sep;
}

async function loadAskExpansionSmokeGraph() {
  await evaluate(`(() => {
    const neighbors = Array.from({ length: 20 }, (_, index) => ({
      id: \`data:ITEM-\${String(index + 1).padStart(2, "0")}\`,
      type: "data-item",
      name: \`ITEM-\${String(index + 1).padStart(2, "0")}\`,
    }));
    window.__cobolensLoadGraph({
      schemaVersion: 1,
      meta: {
        scannedAt: "smoke",
        dialectGuess: "rendered Ask expansion smoke",
        fileCount: 0,
        parsedFileCount: 0,
        parseErrors: [],
      },
      nodes: [
        { id: "prog:HUB", type: "program", name: "HUB" },
        ...neighbors,
      ],
      edges: neighbors.map((node) => ({
        from: "prog:HUB",
        to: node.id,
        type: "USES",
      })),
    }, "ask-expansion-smoke");
    return true;
  })()`);
  await waitFor(() => evaluate("document.body.innerText.includes('ask-expansion-smoke')"), "synthetic graph loaded");
}

async function verifyResponsiveLayout() {
  await setViewport(900, 900);
  await waitFor(async () => (await responsiveLayoutState()).singleColumn, "tablet uses workspace-first single-column layout");
  const tablet = await responsiveLayoutState();
  assertEqual(tablet.paneDividerDisplay, "none", "tablet layout hides horizontal resize handle");
  assert(tablet.centerBeforeInspector, "tablet layout puts workspace before inspector");
  assert(tablet.inspectorBeforeNavigator, "tablet layout puts navigator after inspector");
  assert(tablet.majorPanelsUseViewportWidth, "tablet layout gives major panels the single column width");
  assert(tablet.toolbarInsideViewport, "tablet layout keeps the workspace toolbar inside the viewport");
  assertEqual(tablet.sourceLineWhiteSpace, "pre", "tablet Source preserves code line integrity");

  await setViewport(430, 820);
  await waitFor(async () => (await responsiveLayoutState()).phoneBreakpoint, "phone breakpoint applies");
  const phone = await responsiveLayoutState();
  assert(phone.singleColumn, "phone layout stays single-column");
  assertEqual(phone.inspectorToggleDisplay, "none", "phone layout hides the inspector collapse toggle");
  assertEqual(phone.brandNameDisplay, "none", "phone layout hides the brand wordmark");
  assertEqual(phone.sourceSymbolDisplay, "none", "phone Source toolbar hides the symbol label");
  assertEqual(phone.sourceSwatchDisplay, "none", "phone Source toolbar hides the color swatch");
  assert(phone.sourceFilePickerVisible, "phone Source toolbar keeps file navigation visible");
  assert(phone.toolbarInsideViewport, "phone layout keeps the workspace toolbar inside the viewport");
  assert(phone.topbarControlsInsideViewport, "phone layout keeps top-bar controls inside the viewport");
  assert(phone.noPageHorizontalOverflow, "phone layout avoids page-level horizontal overflow");

  await setViewport(1365, 900);
  await waitFor(async () => !(await responsiveLayoutState()).singleColumn, "desktop viewport restores three-pane layout");
}

async function setViewport(width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(
    () => evaluate(`window.innerWidth === ${width} && window.innerHeight === ${height}`),
    `${width}px viewport applies`,
  );
  await evaluate("window.dispatchEvent(new Event('resize'))");
}

async function responsiveLayoutState() {
  return evaluate(`(() => {
    function box(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
      };
    }
    function insideViewport(rect) {
      if (!rect || rect.display === 'none' || rect.visibility === 'hidden') return true;
      return rect.left >= -1 && rect.right <= window.innerWidth + 1;
    }

    const center = box('.center-pane');
    const inspector = box('.right-pane');
    const navigator = box('.left-pane');
    const topbarControls = ['.brand', '.global-search', '.topbar-actions'].map(box);
    const toolbarControls = Array.from(document.querySelectorAll('.center-toolbar > *')).map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
      };
    });
    const majorWidths = [center, inspector, navigator].filter(Boolean).map((rect) => rect.width);
    const widestPanel = Math.max(...majorWidths);
    const narrowestPanel = Math.min(...majorWidths);
    const shellStyle = getComputedStyle(document.querySelector('.shell'));

    return {
      viewportWidth: window.innerWidth,
      phoneBreakpoint: window.innerWidth <= 560,
      singleColumn: shellStyle.gridTemplateColumns.split(' ').length === 1,
      paneDividerDisplay: getComputedStyle(document.querySelector('.pane-divider')).display,
      centerBeforeInspector: Boolean(center && inspector && center.top < inspector.top),
      inspectorBeforeNavigator: Boolean(inspector && navigator && inspector.top < navigator.top),
      majorPanelsUseViewportWidth: widestPanel - narrowestPanel <= 2 && narrowestPanel >= window.innerWidth - 24,
      toolbarInsideViewport: toolbarControls.every(insideViewport),
      topbarControlsInsideViewport: topbarControls.every(insideViewport),
      noPageHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      sourceLineWhiteSpace: getComputedStyle(document.querySelector('.source-line-text')).whiteSpace,
      inspectorToggleDisplay: getComputedStyle(document.querySelector('.topbar-actions .rail-toggle')).display,
      brandNameDisplay: getComputedStyle(document.querySelector('.brand-name')).display,
      sourceSymbolDisplay: getComputedStyle(document.querySelector('.source-meta-symbol')).display,
      sourceSwatchDisplay: getComputedStyle(document.querySelector('.center-toolbar-meta.is-source .swatch')).display,
      sourceFilePickerVisible: Boolean(document.querySelector('.source-file-picker')?.getBoundingClientRect().width > 40),
    };
  })()`);
}

async function evaluate(expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
    throw new Error(description);
  }
  return response.result.value;
}

async function waitFor(check, label, timeoutMs = 5_000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(80);
  }
  let state = "";
  try {
    state = cdp ? `\nCurrent page state:\n${JSON.stringify(await evaluate(`(() => ({
      href: location.href,
      title: document.title,
      text: document.body.textContent?.slice(0, 1200) ?? "",
      html: document.body.innerHTML.slice(0, 1200),
      events: globalThis.__noop ?? null
    }))()`), null, 2)}` : "";
    if (cdp?.events?.length) {
      state += `\nRecent browser events:\n${JSON.stringify(cdp.events.slice(-12), null, 2)}`;
    }
  } catch {
    state = "";
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}${state}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Rendered UI smoke failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function startStaticServer(root, port) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      const filePath = safeResolve(root, url.pathname === "/" ? "/index.html" : url.pathname);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("not a file");
      response.writeHead(200, {
        "content-type": contentType(filePath),
        "cache-control": "no-store",
      });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(port, "127.0.0.1", resolveListen));
  return server;
}

function safeResolve(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  const target = resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`refusing to serve ${pathname}`);
  }
  return target;
}

function contentType(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  return types[extname(filePath)] ?? "application/octet-stream";
}

async function launchBrowser(cdpPort, userDataDir) {
  const browserPath = findBrowserPath();
  if (!browserPath) {
    throw new Error("Rendered UI smoke needs Chrome, Chromium, or Edge. Set CHROME_BIN to the browser executable.");
  }
  const child = spawn(browserPath, [
    "--headless=new",
    "--ignore-gpu-blocklist",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-background-networking",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-sandbox",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) stderr += `\nBrowser exited with ${code}`;
  });
  await waitFor(() => httpJson(`http://127.0.0.1:${cdpPort}/json/version`), "browser debugging port", 10_000).catch((error) => {
    child.kill();
    throw new Error(`${error.message}\n${stderr.slice(-1000)}`);
  });
  return child;
}

function findBrowserPath() {
  const envPath = process.env.CHROME_BIN || process.env.CHROMIUM_BIN;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ]
    : process.platform === "win32"
      ? [
          join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/microsoft-edge",
        ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function createBrowserPage(cdpPort, url) {
  const encoded = encodeURIComponent(url);
  let target;
  try {
    target = await httpJson(`http://127.0.0.1:${cdpPort}/json/new?${encoded}`, "PUT");
  } catch {
    target = await httpJson(`http://127.0.0.1:${cdpPort}/json/new?${encoded}`);
  }
  if (target.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
  const targets = await httpJson(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!page) throw new Error("Could not create a browser page for UI smoke.");
  return page.webSocketDebuggerUrl;
}

function httpJson(url, method = "GET") {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = http.request(url, { method }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if ((response.statusCode ?? 500) >= 400) {
          rejectRequest(new Error(`${method} ${url} returned ${response.statusCode}: ${body}`));
          return;
        }
        try {
          resolveRequest(JSON.parse(body));
        } catch (error) {
          rejectRequest(error);
        }
      });
    });
    request.on("error", rejectRequest);
    request.end();
  });
}

function freePort() {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

class JsonWebSocket {
  static connect(wsUrl) {
    return new Promise((resolveConnect, rejectConnect) => {
      const url = new URL(wsUrl);
      const socket = net.connect(Number(url.port), url.hostname);
      const key = randomBytes(16).toString("base64");
      let handshake = Buffer.alloc(0);
      const client = new JsonWebSocket(socket);
      socket.once("connect", () => {
        socket.write([
          `GET ${url.pathname}${url.search} HTTP/1.1`,
          `Host: ${url.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"));
      });
      socket.on("data", function onHandshake(chunk) {
        handshake = Buffer.concat([handshake, chunk]);
        const headerEnd = handshake.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const header = handshake.slice(0, headerEnd).toString();
        if (!header.startsWith("HTTP/1.1 101")) {
          rejectConnect(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
          socket.destroy();
          return;
        }
        const expected = createHash("sha1")
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");
        if (!header.toLowerCase().includes(`sec-websocket-accept: ${expected.toLowerCase()}`)) {
          rejectConnect(new Error("WebSocket accept key mismatch"));
          socket.destroy();
          return;
        }
        socket.off("data", onHandshake);
        const rest = handshake.slice(headerEnd + 4);
        socket.on("data", (data) => client.receive(data));
        if (rest.length) client.receive(rest);
        resolveConnect(client);
      });
      socket.once("error", rejectConnect);
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(encodeWebSocketFrame(payload));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        rejectSend(new Error(`CDP call timed out: ${method}`));
      }, 10_000).unref?.();
    });
  }

  receive(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      const frame = decodeWebSocketFrame(this.buffer);
      if (!frame) return;
      this.buffer = this.buffer.slice(frame.consumed);
      if (frame.opcode === 8) {
        this.close();
        return;
      }
      if (frame.opcode !== 1) continue;
      const message = JSON.parse(frame.payload.toString());
      if (!message.id) {
        this.events.push(message);
        if (this.events.length > 50) this.events.shift();
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    }
  }

  close() {
    this.socket.destroy();
  }
}

function encodeWebSocketFrame(text) {
  const payload = Buffer.from(text);
  const headerLength = payload.length < 126 ? 2 : payload.length <= 0xffff ? 4 : 10;
  const frame = Buffer.alloc(headerLength + 4 + payload.length);
  frame[0] = 0x81;
  if (payload.length < 126) {
    frame[1] = 0x80 | payload.length;
  } else if (payload.length <= 0xffff) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(payload.length, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  const maskOffset = headerLength;
  const mask = randomBytes(4);
  mask.copy(frame, maskOffset);
  for (let index = 0; index < payload.length; index += 1) {
    frame[maskOffset + 4 + index] = payload[index] ^ mask[index % 4];
  }
  return frame;
}

function decodeWebSocketFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = Boolean(buffer[1] & 0x80);
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  const maskOffset = masked ? offset : -1;
  if (masked) offset += 4;
  if (buffer.length < offset + length) return null;
  const payload = Buffer.from(buffer.slice(offset, offset + length));
  if (masked) {
    const mask = buffer.slice(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }
  return { opcode, payload, consumed: offset + length };
}

await main();
