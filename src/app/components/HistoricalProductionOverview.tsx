"use client";

import type { HistoricalCycle } from "../lib/historicalCycles";
import ProductionPerformanceCharts from "./ProductionPerformanceCharts";

export default function HistoricalProductionOverview({
  cycle,
}: {
  cycle: HistoricalCycle;
}) {
  return (
    <ProductionPerformanceCharts
      title="Historical Production Performance"
      description={`Completed mortality, feed, water, and body-weight records for ${cycle.label}.`}
      periodLabel={`${cycle.startDate} – ${cycle.endDate}`}
      production={cycle.production}
      className="order-2"
    />
  );
}
