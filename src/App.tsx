import { AppShell } from "./AppShell";
import { useDocumentationExport } from "./export/useDocumentationExport";
import { canUseTauri } from "./lib/tauri";
import { useGraphDerivedData } from "./graph/useGraphDerivedData";
import { useGraphViewState } from "./graph/useGraphViewState";
import { useAnalysisProgress } from "./scan/useAnalysisProgress";
import { useProjectActions } from "./scan/useProjectActions";
import { useProjectState } from "./scan/useProjectState";
import { useSymbolSearch } from "./navigator/useSymbolSearch";
import { useAskGeneration } from "./inspector/useAskGeneration";
import { useChatState } from "./inspector/useChatState";
import { useInspectorRouting, useInspectorTabState } from "./inspector/useInspectorRouting";
import { useSummaryGeneration } from "./inspector/useSummaryGeneration";
import { useAppSettingsState } from "./settings/useAppSettingsState";
import { useWorkspaceLayout } from "./workspace/useWorkspaceLayout";
import { useWorkspaceNavigation } from "./workspace/useWorkspaceNavigation";
import { useSourceExcerptReader } from "./source/useSourceExcerptReader";
import { useSourceSnippet } from "./source/useSourceSnippet";
import "./App.css";

function App() {
  const desktopAvailable = canUseTauri();
  const project = useProjectState();
  const { inspectorTab, setInspectorTab, showInspectorImpact } = useInspectorTabState();
  const {
    chatQuestion,
    setChatQuestion,
    chatStatus,
    setChatStatus,
    chatAnswer,
    setChatAnswer,
    chatHistory,
    chatError,
    setChatError,
    rememberChatAnswer,
    restoreChatAnswer,
    clearChatHistory,
    resetChatDraftForNavigation,
    resetChatForHome,
    resetChatForProjectLoad,
  } = useChatState({ onTabChange: setInspectorTab });
  const {
    railCollapsed,
    toggleRailCollapsed,
    inspectorCollapsed,
    toggleInspectorCollapsed,
    rightWidthPx,
    startInspectorResize,
    resetInspectorWidth,
  } = useWorkspaceLayout();
  const {
    scanSettings,
    setScanSettings,
    modelSettings,
    setModelSettings,
    settingsOpen,
    openSettings,
    closeSettings,
    modelCallCount,
    noteModelCallComplete,
    keyDraft,
    setKeyDraft,
    hasProviderKey,
    settingsMessage,
    saveKey,
    clearKey,
    modelReadiness,
    chooseProvider,
    checkModelReadiness,
    refreshInstalledModels,
    prepareModelCall,
    aiConfigured,
  } = useAppSettingsState();
  const {
    expandedNodeIds,
    hiddenNodeTypes,
    showGraphNodeList,
    focusExpansion,
    focusExpanded,
    expandButtonTitle,
    clearGraphExpansion,
    resetGraphViewState,
    toggleExpandFocus,
    expandNode,
    toggleNodeTypeFilter,
    resetNodeTypeFilters,
    toggleGraphNodeList,
  } = useGraphViewState({ graph: project.graph, focusNodeId: project.focusNodeId });
  const {
    inspectorBodyRef,
    preserveInspectorTabForNextEdge,
  } = useInspectorRouting({
    selectedNodeId: project.selectedNodeId,
    selectedEdge: project.selectedEdge,
    chatStatus,
    chatAnswerQuestion: chatAnswer?.question,
    onTabChange: setInspectorTab,
  });
  const { scanProgress, resetScanProgress } = useAnalysisProgress(desktopAvailable);

  const {
    nodeById,
    focusedNode,
    focusedNodeTypeLabel,
    selectedNode,
    counts,
    codebaseGroups,
    sourceFiles,
    unreferencedSourceUnits,
  } = useGraphDerivedData({
    graph: project.graph,
    focusNodeId: project.focusNodeId,
    selectedNodeId: project.selectedNodeId,
  });
  const {
    centerView,
    setCenterView,
    focusOnNode,
    syncAskFocusNode,
    goHome,
    readNodeSource,
    selectNode,
    selectEdge,
    showSourcePanel,
    openRelationshipEdge,
    jumpToCitation,
    openAskCitation,
  } = useWorkspaceNavigation({
    graph: project.graph,
    nodeById,
    clearGraphExpansion,
    preserveInspectorTabForNextEdge,
    onStandardFocusReset: resetChatDraftForNavigation,
    onHomeReset: resetChatForHome,
    onSetInspectorImpact: showInspectorImpact,
    setFocusNodeId: project.setFocusNodeId,
    setSelectedNodeId: project.setSelectedNodeId,
    setSelectedEdge: project.setSelectedEdge,
    setSourceFocus: project.setSourceFocus,
  });
  const { snippet, snippetLoading } = useSourceSnippet({
    root: project.root,
    sourceBase: project.sourceBase,
    browserSourceFiles: project.browserSourceFiles,
    selectedNode,
    sourceFocus: project.sourceFocus,
    encoding: scanSettings.encoding,
  });
  const { sourceExcerptForNode } = useSourceExcerptReader({
    root: project.root,
    sourceBase: project.sourceBase,
    browserSourceFiles: project.browserSourceFiles,
    encoding: scanSettings.encoding,
  });
  const {
    summaries,
    selectedSummaryState,
    summaryNodes,
    bulkTokenEstimate,
    bulkSummaryStatus,
    resetSummaries,
    explainSelectedNode,
    generateSelectedSummary,
    generateAllSummaries,
    cancelSummary,
  } = useSummaryGeneration({
    graph: project.graph,
    selectedNode,
    modelSettings,
    readExcerptForNode: sourceExcerptForNode,
    prepareModelCall,
    onModelCallComplete: noteModelCallComplete,
    onTabChange: setInspectorTab,
    onFocusNode: focusOnNode,
  });
  const {
    askCurrentQuestion,
    askAboutSelectedNode,
    askPresetQuestion,
    cancelAsk,
  } = useAskGeneration({
    graph: project.graph,
    selectedNode,
    modelSettings,
    chatQuestion,
    setChatQuestion,
    setChatStatus,
    setChatAnswer,
    setChatError,
    rememberChatAnswer,
    readExcerptForNode: sourceExcerptForNode,
    prepareModelCall,
    onModelCallComplete: noteModelCallComplete,
    onSyncFocusNode: syncAskFocusNode,
    onExplainSelectedNode: explainSelectedNode,
    onTabChange: setInspectorTab,
  });
  const {
    exportStatus,
    showExportStatus,
    clearExportStatus,
    exportDocs,
  } = useDocumentationExport({
    graph: project.graph,
    summaries,
    focusNodeId: project.focusNodeId,
    desktopAvailable,
  });
  const {
    browserImportInputRef,
    chooseFolder,
    importBrowserProject,
    openSample,
    rescanCurrent,
  } = useProjectActions({
    desktopAvailable,
    scanSettings,
    project,
    resetScanProgress,
    resetGraphViewState,
    resetSummaries,
    resetChatForProjectLoad,
    clearExportStatus,
    showExportStatus,
  });

  const {
    query,
    setQuery,
    searchResults,
    clearSearch,
    focusOnSearchResult,
    handleSearchKeyDown,
  } = useSymbolSearch({
    graph: project.graph,
    onOpenSource: readNodeSource,
  });
  return (
    <AppShell
      topBar={{
        railCollapsed,
        inspectorCollapsed,
        status: project.status,
        desktopAvailable,
        graphLoaded: Boolean(project.graph),
        focusedNode,
        focusedNodeTypeLabel,
        modelSettings,
        query,
        scanSettings,
        browserImportInputRef,
        onToggleRail: toggleRailCollapsed,
        onQueryChange: setQuery,
        onSearchKeyDown: handleSearchKeyDown,
        onHome: () => goHome(clearSearch),
        onChooseFolder: chooseFolder,
        onBrowserImport: importBrowserProject,
        onOpenSample: openSample,
        onToggleInspector: toggleInspectorCollapsed,
        onExport: exportDocs,
        onOpenSettings: openSettings,
      }}
      exportToast={exportStatus ? { status: exportStatus, onDismiss: clearExportStatus } : null}
      settings={{
        open: settingsOpen,
        desktopAvailable,
        scanSettings,
        scanDisabled: project.status === "running",
        onScanSettingsChange: setScanSettings,
        modelSettings,
        keyDraft,
        hasProviderKey,
        settingsMessage,
        onProviderChange: chooseProvider,
        onModelSettingsChange: setModelSettings,
        onKeyDraftChange: setKeyDraft,
        onSaveKey: saveKey,
        onClearKey: clearKey,
        onCheckModel: checkModelReadiness,
        onRefreshModels: refreshInstalledModels,
        modelReadiness,
        modelCallCount,
        bulkTokenEstimate,
        onClose: closeSettings,
      }}
      workspace={{
        railCollapsed,
        inspectorCollapsed,
        rightWidthPx,
        navigator: {
          root: project.root,
          status: project.status,
          graph: project.graph,
          desktopAvailable,
          scanProgress,
          error: project.error,
          query,
          searchResults,
          codebaseGroups,
          selectedNodeId: project.focusNodeId,
          hiddenNodeTypes,
          counts,
          unreferencedSourceUnits,
          onRescan: rescanCurrent,
          onFocusSearchResult: focusOnSearchResult,
          onSelectSourceNode: readNodeSource,
          onResetNodeTypeFilters: resetNodeTypeFilters,
          onToggleNodeTypeFilter: toggleNodeTypeFilter,
          onOpenWarning: jumpToCitation,
          onFocusNode: focusOnNode,
        },
        workspace: {
          centerView,
          graph: project.graph,
          focusNodeId: project.focusNodeId,
          focusedNode,
          selectedNode,
          selectedEdge: project.selectedEdge,
          expandedNodeIds,
          hiddenNodeTypes,
          sourceFiles,
          snippet,
          snippetLoading,
          sourceFocus: project.sourceFocus,
          focusExpanded,
          focusExpansion,
          expandButtonTitle,
          showGraphNodeList,
          onCenterViewChange: setCenterView,
          onSelectNode: selectNode,
          onSelectEdge: selectEdge,
          onExpandNode: expandNode,
          onToggleExpandFocus: toggleExpandFocus,
          onToggleGraphNodeList: toggleGraphNodeList,
          onFocusNode: focusOnNode,
        },
        inspector: {
          activeTab: inspectorTab,
          graph: project.graph,
          desktopAvailable,
          selectedNode,
          selectedEdge: project.selectedEdge,
          summaryState: selectedSummaryState,
          bodyRef: inspectorBodyRef,
          chatStatus,
          chatAnswer,
          chatHistory,
          chatError,
          modelSettings,
          modelReadiness,
          chatQuestion,
          summaryUnitCount: summaryNodes.length,
          bulkSummaryStatus,
          aiConfigured,
          onStartResize: startInspectorResize,
          onResetWidth: resetInspectorWidth,
          onTabChange: setInspectorTab,
          onOpenSettings: openSettings,
          onQuestionChange: setChatQuestion,
          onAsk: askCurrentQuestion,
          onCancelAsk: cancelAsk,
          onAskPreset: askPresetQuestion,
          onRestoreAnswer: restoreChatAnswer,
          onClearHistory: clearChatHistory,
          onOpenCitation: openAskCitation,
          onGenerateSelected: generateSelectedSummary,
          onGenerateAll: generateAllSummaries,
          onCancelSummary: cancelSummary,
          onExplainNode: explainSelectedNode,
          onAskFollowUp: askAboutSelectedNode,
          onViewSource: showSourcePanel,
          onOpenSummaryCitation: jumpToCitation,
          onFocusNode: focusOnNode,
          onOpenEdge: openRelationshipEdge,
        },
      }}
    />
  );
}

export default App;
