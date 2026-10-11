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
  const sourceSummary = cycle.production.sourceSummary;
  const unavailableLabel = "Not provided in source";

  return (
    <div className="order-2 space-y-6">
      {sourceSummary && (
        <section className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm">
          <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Source farm performance summary
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              {sourceSummary.farmName} · Batch {sourceSummary.batch}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Farm code {sourceSummary.farmCode}. Performance summary for{" "}
              {sourceSummary.normalizedIntakeBirds.toLocaleString()} birds in one zone.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3 xl:grid-cols-5">
            {[
              ["DOC intake", sourceSummary.normalizedIntakeBirds.toLocaleString()],
              ["Birds sold", sourceSummary.birdsSold.toLocaleString()],
              [
                "Mortality",
                `${sourceSummary.mortality.toLocaleString()} (${sourceSummary.mortalityRatePercent.toFixed(2)}%)`,
              ],
              ["Reported FCR", sourceSummary.fcr.toFixed(2)],
              [
                "Feed intake",
                `${sourceSummary.feedBagsPerThousandBirds.toFixed(2)} bags / 1,000 birds`,
              ],
              ["Average weight", `${sourceSummary.averageWeightKg.toFixed(2)} kg/bird`],
              ["Average age", `${sourceSummary.averageAgeDays} days`],
              [
                "Catch window",
                typeof sourceSummary.startCatchDay === "number" &&
                typeof sourceSummary.endCatchDay === "number"
                  ? `Day ${sourceSummary.startCatchDay}–${sourceSummary.endCatchDay}`
                  : unavailableLabel,
              ],
              ["Efficiency index", sourceSummary.efficiencyIndex.toFixed(2)],
              ["House type", sourceSummary.houseType],
              [
                "Intake dates",
                sourceSummary.intakeDates.length > 0
                  ? sourceSummary.intakeDates.join(", ")
                  : unavailableLabel,
              ],
              [
                "Medication cost",
                `RM ${sourceSummary.medicationCostRmPerBird.toFixed(2)} / bird`,
              ],
              [
                "Production cost",
                `RM ${sourceSummary.grossCostRmPerBird.toFixed(2)} / bird`,
              ],
              [
                "Selling price",
                `RM ${sourceSummary.sellingPriceRmPerBird.toFixed(2)} / bird`,
              ],
              ["Profit", `RM ${sourceSummary.profitRmPerBird.toFixed(2)} / bird`],
              [
                "Catching dates",
                sourceSummary.catchingDateRange
                  ? sourceSummary.catchingDateRange
                  : unavailableLabel,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="text-xs text-slate-500">{label}</div>
                <div className="mt-1 font-semibold text-slate-900">{value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <ProductionPerformanceCharts
        title="Historical Production Performance"
        description={
          hasFeedWaterData
            ? `Completed mortality, feed, water, body-weight, and biomass records for ${cycle.label}.`
            : `Completed mortality and body-weight profile for ${cycle.label}. FCR comes from the farm summary; daily feed and water values were not provided.`
        }
        periodLabel={`${cycle.startDate} – ${cycle.endDate}`}
        series={series}
      />
    </div>
  );
}
