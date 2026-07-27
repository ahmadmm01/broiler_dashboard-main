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
  const hasFeedWaterData = cycle.production.feedWater.length > 0;
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
      description={
        hasFeedWaterData
          ? `Completed mortality, feed, water, body-weight, and biomass records for ${cycle.label}.`
          : `Completed mortality, body-weight, and biomass records for ${cycle.label}. Feed and water were not included in the source workbook.`
      }
      periodLabel={`${cycle.startDate} – ${cycle.endDate}`}
      series={series}
      className="order-2"
    />
  );
}
