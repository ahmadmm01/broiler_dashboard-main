"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Zone } from "../../lib/types";

export const DASHBOARD_TABS = [
  {
    id: "overview",
    label: "Overview",
    description: "CCTV, latest readings, and system status",
  },
  {
    id: "environment",
    label: "Environment",
    description: "Current-cycle sensor trends",
  },
  {
    id: "production",
    label: "Production",
    description: "Cycle management, records, and forecast",
  },
  {
    id: "history",
    label: "History & Reports",
    description: "Completed cycles and retrospective analysis",
  },
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number]["id"];
export type SelectableZone = "ALL" | Zone;

type DashboardNavigationContextValue = {
  activeTab: DashboardTab;
  selectedZone: SelectableZone;
  selectTab: (tab: DashboardTab) => void;
  selectZone: (zone: SelectableZone) => void;
};

const DashboardNavigationContext =
  createContext<DashboardNavigationContextValue | null>(null);

function isDashboardTab(value: string | null): value is DashboardTab {
  return DASHBOARD_TABS.some((tab) => tab.id === value);
}

function readNavigationFromUrl(
  activeZones: Zone[],
  fallbackZone: SelectableZone
) {
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");
  const requestedZone = params.get("zone")?.toUpperCase() ?? null;
  const zone =
    requestedZone === "ALL" && activeZones.length > 1
      ? "ALL"
      : activeZones.includes(requestedZone as Zone)
        ? (requestedZone as Zone)
        : fallbackZone;

  return {
    tab: isDashboardTab(requestedTab) ? requestedTab : "overview",
    zone,
  } satisfies { tab: DashboardTab; zone: SelectableZone };
}

function updateNavigationUrl(
  tab: DashboardTab,
  zone: SelectableZone,
  mode: "push" | "replace"
) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  url.searchParams.set("zone", zone);
  window.history[mode === "push" ? "pushState" : "replaceState"](
    null,
    "",
    url
  );
}

export default function DashboardNavigationProvider({
  activeZones,
  children,
}: {
  activeZones: Zone[];
  children: ReactNode;
}) {
  const fallbackZone: SelectableZone =
    activeZones.length === 1 ? (activeZones[0] ?? "A") : "ALL";
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [selectedZone, setSelectedZone] =
    useState<SelectableZone>(fallbackZone);

  useEffect(() => {
    const applyUrlState = () => {
      const navigation = readNavigationFromUrl(activeZones, fallbackZone);
      setActiveTab(navigation.tab);
      setSelectedZone(navigation.zone);
      updateNavigationUrl(navigation.tab, navigation.zone, "replace");
    };

    applyUrlState();
    window.addEventListener("popstate", applyUrlState);
    return () => window.removeEventListener("popstate", applyUrlState);
  }, [activeZones, fallbackZone]);

  const selectTab = useCallback(
    (tab: DashboardTab) => {
      setActiveTab(tab);
      updateNavigationUrl(tab, selectedZone, "push");
    },
    [selectedZone]
  );

  const selectZone = useCallback(
    (zone: SelectableZone) => {
      setSelectedZone(zone);
      updateNavigationUrl(activeTab, zone, "replace");
    },
    [activeTab]
  );

  const value = useMemo(
    () => ({ activeTab, selectedZone, selectTab, selectZone }),
    [activeTab, selectTab, selectZone, selectedZone]
  );

  return (
    <DashboardNavigationContext.Provider value={value}>
      {children}
    </DashboardNavigationContext.Provider>
  );
}

export function useDashboardNavigation() {
  const context = useContext(DashboardNavigationContext);
  if (!context) {
    throw new Error(
      "useDashboardNavigation must be used within DashboardNavigationProvider"
    );
  }
  return context;
}
