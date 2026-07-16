"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoricalProductionData } from "../lib/historicalCycles";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export default function ProductionPerformanceCharts({
  title,
  description,
  periodLabel,
  production,
  className = "",
}: {
  title: string;
  description: string;
  periodLabel: string;
  production: HistoricalProductionData;
  className?: string;
}) {
  const totalMortality = production.mortality.reduce(
    (total, item) => total + item.count,
    0
  );
  const survivingBirds = Math.max(
    0,
    production.harvestedBirds ?? production.initialBirds - totalMortality
  );
  const mortalityRate = production.initialBirds
    ? (totalMortality / production.initialBirds) * 100
    : 0;
  const totalFeed = production.feedWater.reduce(
    (total, item) => total + item.feedKgPerBird,
    0
  );
  const totalWater = production.feedWater.reduce(
    (total, item) => total + item.waterLPerBird,
    0
  );
  const finalWeight = production.weights.at(-1);
  const hasWeightData = Boolean(finalWeight);
  const finalAverageWeightKg = finalWeight?.actualWeightKg ?? 0;
  const weightVariancePercent = finalWeight?.standardWeightKg
    ? ((finalAverageWeightKg - finalWeight.standardWeightKg) /
        finalWeight.standardWeightKg) *
      100
    : 0;
  const estimatedFcr = finalAverageWeightKg
    ? totalFeed / finalAverageWeightKg
    : 0;

  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {periodLabel}
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          [
            "Mortality",
            `${integer.format(totalMortality)} (${mortalityRate.toFixed(2)}%)`,
          ],
          ["Birds remaining", integer.format(survivingBirds)],
          ["Feed / bird", `${totalFeed.toFixed(3)} kg`],
          ["Water / bird", `${totalWater.toFixed(3)} L`],
          ["Final avg weight", `${finalAverageWeightKg.toFixed(3)} kg`],
          ["Estimated FCR", estimatedFcr.toFixed(2)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 font-semibold text-slate-950">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Daily Mortality</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Total {totalMortality} birds · {mortalityRate.toFixed(2)}% of birds
            placed
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={production.mortality}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" interval={5} />
                <YAxis allowDecimals={false} />
                <Tooltip labelFormatter={(day) => `Cycle day ${day}`} />
                <Bar dataKey="count" name="Mortality" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Daily Feed & Water per Bird</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            Daily consumption recorded for this production cycle
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={production.feedWater}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" interval={5} />
                <YAxis yAxisId="feed" />
                <YAxis yAxisId="water" orientation="right" />
                <Tooltip labelFormatter={(day) => `Cycle day ${day}`} />
                <Legend />
                <Line
                  yAxisId="feed"
                  type="monotone"
                  dataKey="feedKgPerBird"
                  name="Feed / bird (kg)"
                  stroke="#2563eb"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="water"
                  type="monotone"
                  dataKey="waterLPerBird"
                  name="Water / bird (L)"
                  stroke="#06b6d4"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">Body Weight vs Standard</h3>
              <p className="mb-3 mt-1 text-xs text-slate-500">
                {hasWeightData
                  ? `Final variance ${weightVariancePercent >= 0 ? "+" : ""}${weightVariancePercent.toFixed(2)}% against the configured standard`
                  : "Waiting for body-weight records for this cycle"}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                !hasWeightData
                  ? "bg-slate-100 text-slate-600"
                  : weightVariancePercent < -3
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {hasWeightData
                ? `Final ${finalAverageWeightKg.toFixed(3)} kg`
                : "No weight data"}
            </span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={production.weights}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" interval={2} />
                <YAxis />
                <Tooltip labelFormatter={(day) => `Cycle day ${day}`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="actualWeightKg"
                  name="Actual weight (kg)"
                  stroke="#7c3aed"
                  dot={false}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="standardWeightKg"
                  name="Standard weight (kg)"
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
