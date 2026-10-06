export type InspectorTab = "ask" | "impact";

export function InspectorTabs({
  activeTab,
  dependencyCount,
  onChange,
}: {
  activeTab: InspectorTab;
  dependencyCount: number;
  onChange: (tab: InspectorTab) => void;
}) {
  const tabs: Array<{ id: InspectorTab; label: string; badge?: string }> = [
    { id: "ask", label: "Chat" },
    // The badge is always the dependency count; a "1" for an open relationship
    // read as a count and contradicted the list shown below it.
    { id: "impact", label: "Dependencies", badge: dependencyCount ? String(dependencyCount) : undefined },
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
