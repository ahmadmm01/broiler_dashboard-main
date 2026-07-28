"use client";

import type { ReactNode } from "react";
import { useDashboardNavigation } from "./DashboardNavigationProvider";

export default function DashboardTabPanel({
  children,
}: {
  children: ReactNode;
}) {
  const { activeTab } = useDashboardNavigation();

  return (
    <div
      id={`dashboard-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`dashboard-tab-${activeTab}`}
      className="flex flex-col gap-8"
    >
      {children}
    </div>
  );
}
