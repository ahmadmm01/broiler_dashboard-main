"use client";

import type { HistoricalCycle } from "../lib/historicalCycles";
import type { Zone } from "../lib/types";
import ProductionPerformanceCharts, {
  type ProductionPerformanceSeries,
} from "./ProductionPerformanceCharts";

const zoneColors: Record<Zone, string> = {
  A: "#f97316",
  B: "#3b82f6",
  C: "#10b981",
};

export default function HistoricalProductionOverview({
  cycle,
}: {
  cycle: HistoricalCycle;
}) {
  const series: ProductionPerformanceSeries[] = [
    {
      key: cycle.zone,
      label: `Zone ${cycle.zone}`,
      color: zoneColors[cycle.zone],
      production: cycle.production,
    },
  ];

  return (
    <ProductionPerformanceCharts
      title="Historical Production Performance"
      description={`Completed mortality, feed, water, and body-weight records for ${cycle.label}.`}
      periodLabel={`${cycle.startDate} – ${cycle.endDate}`}
      series={series}
      className="order-2"
    />
  );
}
