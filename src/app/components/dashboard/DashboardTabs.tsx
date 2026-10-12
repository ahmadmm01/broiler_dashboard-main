"use client";

import {
  DASHBOARD_TABS,
  useDashboardNavigation,
} from "./DashboardNavigationProvider";

export default function DashboardTabs() {
  const { activeTab, selectTab } = useDashboardNavigation();

  const focusTab = (index: number) => {
    const tab = DASHBOARD_TABS[index];
    if (!tab) return;
    selectTab(tab.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`dashboard-tab-${tab.id}`)?.focus();
    });
  };

  return (
    <nav aria-label="Dashboard sections">
      <div
        role="tablist"
        aria-label="Dashboard views"
        className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-3 xl:grid-cols-5"
      >
        {DASHBOARD_TABS.map((tab, index) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`dashboard-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-label={tab.label}
              aria-selected={isActive}
              aria-controls={`dashboard-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                let nextIndex: number | null = null;
                if (event.key === "ArrowRight") {
                  nextIndex = (index + 1) % DASHBOARD_TABS.length;
                } else if (event.key === "ArrowLeft") {
                  nextIndex =
                    (index - 1 + DASHBOARD_TABS.length) %
                    DASHBOARD_TABS.length;
                } else if (event.key === "Home") {
                  nextIndex = 0;
                } else if (event.key === "End") {
                  nextIndex = DASHBOARD_TABS.length - 1;
                }

                if (nextIndex !== null) {
                  event.preventDefault();
                  focusTab(nextIndex);
                }
              }}
              className={`min-h-14 rounded-xl px-3 py-2 text-left transition ${
                isActive
                  ? "bg-slate-900 text-white shadow"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span
                className={`mt-0.5 hidden text-[11px] leading-4 lg:block ${
                  isActive ? "text-slate-300" : "text-slate-400"
                }`}
              >
                {tab.description}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
