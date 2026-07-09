export type InspectorTab = "ask" | "summary" | "impact";

type SummaryStatus = "idle" | "running" | "ready" | "error";

export function InspectorTabs({
  activeTab,
  summaryStatus,
  dependencyCount,
  selectedRelationship,
  onChange,
}: {
  activeTab: InspectorTab;
  summaryStatus?: SummaryStatus;
  dependencyCount: number;
  selectedRelationship: boolean;
  onChange: (tab: InspectorTab) => void;
}) {
  const tabs: Array<{ id: InspectorTab; label: string; badge?: string }> = [
    { id: "summary", label: "Overview", badge: summaryStatus === "running" ? "..." : undefined },
    { id: "ask", label: "Chat" },
    { id: "impact", label: "Dependencies", badge: selectedRelationship ? "1" : dependencyCount ? String(dependencyCount) : undefined },
  ];

  return (
    <div className="inspector-tabs" role="tablist" aria-label="Inspector views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-label={tab.badge ? `${tab.label} (${tab.badge})` : tab.label}
          className={`${activeTab === tab.id ? "is-active " : ""}inspector-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.badge ? <small>{` ${tab.badge}`}</small> : null}
        </button>
      ))}
    </div>
  );
}
