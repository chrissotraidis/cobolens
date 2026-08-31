export type InspectorTab = "ask" | "impact";

export function InspectorTabs({
  activeTab,
  dependencyCount,
  selectedRelationship,
  onChange,
}: {
  activeTab: InspectorTab;
  dependencyCount: number;
  selectedRelationship: boolean;
  onChange: (tab: InspectorTab) => void;
}) {
  const tabs: Array<{ id: InspectorTab; label: string; badge?: string }> = [
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
