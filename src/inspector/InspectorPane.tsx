import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { GraphDocument, GraphEdge, GraphNode } from "../lib/graph";
import { nodeColor } from "../lib/graph";
import { dependencyCounts } from "../lib/graphSelectors";
import type { ModelSettings } from "../model/config";
import type { Citation } from "../retrieval/context";
import type { SemanticIndexState } from "../retrieval/useSemanticIndex";
import type { ModelReadiness } from "../settings/SettingsDialog";
import { ChatAnswerPanel, type ChatAnswer, type ChatMode, type ChatStatus } from "./ChatAnswerPanel";
import { LineageImpactPanel, RelationshipDetails } from "./DependencyPanels";
import { InspectorTabs, type InspectorTab } from "./InspectorTabs";
import { SummaryDock, type SummaryState } from "./SummaryDock";

export function InspectorPane({
  activeTab,
  graph,
  desktopAvailable,
  selectedNode,
  selectedEdge,
  summaryState,
  bodyRef,
  chatStatus,
  chatAnswer,
  chatHistory,
  chatError,
  modelSettings,
  modelReadiness,
  semanticIndex,
  chatQuestion,
  summaryUnitCount,
  bulkSummaryStatus,
  aiConfigured,
  onStartResize,
  onResetWidth,
  onClose,
  onTabChange,
  onOpenSettings,
  onQuestionChange,
  onAsk,
  onAskSuggestion,
  onCancelAsk,
  onGenerateSelected,
  onGenerateAll,
  onCancelSummary,
  onExplainNode,
  onViewSource,
  onOpenSummaryCitation,
  onFocusNode,
  onOpenEdge,
}: {
  activeTab: InspectorTab;
  graph: GraphDocument | null;
  desktopAvailable: boolean;
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  summaryState?: SummaryState;
  bodyRef: RefObject<HTMLDivElement | null>;
  chatStatus: ChatStatus;
  chatAnswer: ChatAnswer | null;
  chatHistory: ChatAnswer[];
  chatError: string;
  modelSettings: ModelSettings;
  modelReadiness: ModelReadiness;
  semanticIndex: SemanticIndexState;
  chatQuestion: string;
  summaryUnitCount: number;
  bulkSummaryStatus: string;
  aiConfigured: boolean;
  onStartResize: (event: ReactPointerEvent) => void;
  onResetWidth: () => void;
  onClose: () => void;
  onTabChange: (tab: InspectorTab) => void;
  onOpenSettings: () => void;
  onQuestionChange: (question: string) => void;
  onAsk: (mode?: ChatMode) => void;
  onAskSuggestion: (question: string) => void;
  onCancelAsk: () => void;
  onGenerateSelected: () => void;
  onGenerateAll: () => void;
  onCancelSummary: () => void;
  onExplainNode: () => void;
  onViewSource: () => void;
  onOpenSummaryCitation: (citation: Citation) => void;
  onFocusNode: (nodeId: string) => void;
  onOpenEdge: (edge: GraphEdge) => void;
}) {
  const dependencyCount = selectedNode ? dependencyCounts(selectedNode, graph).total : 0;

  return (
    <aside className={`right-pane${activeTab === "ask" ? " is-ask-focused" : ""}`} aria-label="Inspector and chat">
      <div
        className="pane-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector panel"
        title="Drag to resize"
        onPointerDown={onStartResize}
        onDoubleClick={onResetWidth}
      />
      <section id="inspector-panel" className="chat-panel" aria-label="Inspector" tabIndex={-1}>
        <div className="panel-title panel-title-row inspector-title">
          {selectedNode ? (
            <>
              <span className="inspector-title-name">
                <span className="swatch" style={{ background: nodeColor(selectedNode.type) }} aria-hidden="true" />
                {selectedNode.name}
              </span>
            </>
          ) : (
            <>
              <span>Inspector</span>
              <small>No selection</small>
            </>
          )}
          <button type="button" className="inspector-close" onClick={onClose} aria-label="Close inspector">Close</button>
        </div>
        {!graph ? (
          <div className="inspector-empty inspector-welcome">
            <span>How an investigation works</span>
            <ol>
              <li><strong>Trace</strong><small>Select a symbol and follow its direct relationships.</small></li>
              <li><strong>Prove</strong><small>Open the exact source line behind an edge or claim.</small></li>
              <li><strong>Explain</strong><small>Chat in context; every useful answer stays tied to evidence.</small></li>
            </ol>
            <p>{desktopAvailable ? "Import a project or open the sample to begin." : "Open the sample to begin."}</p>
          </div>
        ) : (
          <>
            <InspectorTabs
              activeTab={activeTab}
              dependencyCount={dependencyCount}
              selectedRelationship={Boolean(selectedEdge)}
              onChange={onTabChange}
            />
            <div className="summary-stack" ref={bodyRef}>
              {activeTab === "ask" ? (
                <ChatAnswerPanel
                  status={chatStatus}
                  answer={chatAnswer}
                  history={chatHistory}
                  error={chatError}
                  node={selectedNode}
                  settings={modelSettings}
                  modelReadiness={modelReadiness}
                  semanticIndex={semanticIndex}
                  question={chatQuestion}
                  aiConfigured={aiConfigured}
                  canAsk={Boolean(graph)}
                  overview={(
                    <SummaryDock
                      node={selectedNode}
                      graph={graph}
                      state={summaryState}
                      settings={modelSettings}
                      modelReadiness={modelReadiness}
                      summaryUnitCount={summaryUnitCount}
                      bulkStatus={bulkSummaryStatus}
                      aiConfigured={aiConfigured}
                      onGenerateSelected={onGenerateSelected}
                      onGenerateAll={onGenerateAll}
                      onCancelSummary={onCancelSummary}
                      onExplainNode={onExplainNode}
                      onAskSuggestion={onAskSuggestion}
                      onOpenSettings={onOpenSettings}
                      onViewSource={onViewSource}
                      onOpenCitation={onOpenSummaryCitation}
                    />
                  )}
                  onOpenSettings={onOpenSettings}
                  onQuestionChange={onQuestionChange}
                  onAsk={onAsk}
                  onCancel={onCancelAsk}
                  onOpenCitation={onOpenSummaryCitation}
                />
              ) : null}
              {activeTab === "impact" ? (
                <>
                  {selectedEdge ? (
                    <RelationshipDetails
                      selectedEdge={selectedEdge}
                      node={selectedNode}
                      graph={graph}
                      onFocusNode={onFocusNode}
                      onOpenEdge={onOpenEdge}
                    />
                  ) : null}
                  <LineageImpactPanel
                    node={selectedNode}
                    graph={graph}
                    onFocusNode={onFocusNode}
                    onOpenEdge={onOpenEdge}
                  />
                </>
              ) : null}
            </div>
          </>
        )}
      </section>
    </aside>
  );
}
