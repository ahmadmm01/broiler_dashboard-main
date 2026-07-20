"use client";

import { useState, type MouseEvent } from "react";
import {
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

export type ProductionPerformanceSeries = {
  key: string;
  label: string;
  color: string;
  production: HistoricalProductionData;
};

type ChartRecord = {
  day: number;
  date?: string;
  [key: string]: string | number | undefined;
};

function summarizeProduction(production: HistoricalProductionData) {
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
  const finalAverageWeightKg = finalWeight?.actualWeightKg ?? 0;
  const weightVariancePercent = finalWeight?.standardWeightKg
    ? ((finalAverageWeightKg - finalWeight.standardWeightKg) /
        finalWeight.standardWeightKg) *
      100
    : 0;
  const estimatedFcr = finalAverageWeightKg
    ? totalFeed / finalAverageWeightKg
    : 0;

  return {
    totalMortality,
    survivingBirds,
    mortalityRate,
    totalFeed,
    totalWater,
    finalWeight,
    finalAverageWeightKg,
    weightVariancePercent,
    estimatedFcr,
  };
}

function sortedChartRecords(records: Map<number, ChartRecord>) {
  return Array.from(records.values()).sort((left, right) => left.day - right.day);
}

function MortalityBars({
  data,
  series,
}: {
  data: ChartRecord[];
  series: ProductionPerformanceSeries[];
}) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    record: ChartRecord;
  } | null>(null);
  const width = 520;
  const height = 248;
  const margin = { top: 12, right: 12, bottom: 30, left: 38 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(
    1,
    ...data.flatMap((record) =>
      series.map((item) => Number(record[`mortality_${item.key}`] ?? 0))
    )
  );
  const yMax = Math.max(4, Math.ceil(maxValue / 2) * 2);
  const groupWidth = data.length > 0 ? plotWidth / data.length : plotWidth;
  const barWidth = Math.max(
    2,
    Math.min(10, (groupWidth * 0.78) / Math.max(1, series.length))
  );
  const tickIndexes = new Set(
    data
      .map((_, index) => index)
      .filter(
        (index) =>
          index === 0 || index === data.length - 1 || index % 6 === 0
      )
  );
  const updateTooltip = (
    event: MouseEvent<SVGRectElement>,
    record: ChartRecord
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    const host = svg?.parentElement;
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    setTooltip({
      x: Math.max(95, Math.min(width - 95, event.clientX - bounds.left)),
      y: Math.max(72, event.clientY - bounds.top - 8),
      record,
    });
  };

  return (
    <>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="relative mx-auto w-[520px]">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={
              series.length > 1
                ? `Daily mortality for ${series.map((item) => item.label).join(", ")}`
                : `Daily mortality for ${series[0]?.label ?? "the selected zone"}`
            }
            className="block"
            onMouseLeave={() => setTooltip(null)}
          >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = margin.top + plotHeight * (1 - ratio);
            const value = Math.round(yMax * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={margin.left}
                  x2={width - margin.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                />
                <text
                  x={margin.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#64748b"
                >
                  {value}
                </text>
              </g>
            );
          })}

          {data.flatMap((record, dataIndex) => {
            const groupCenter = margin.left + groupWidth * (dataIndex + 0.5);
            return series.map((item, seriesIndex) => {
              const rawValue = record[`mortality_${item.key}`];
              if (typeof rawValue !== "number") return null;
              const value = rawValue;
              const barHeight = (value / yMax) * plotHeight;
              const groupBarsWidth = barWidth * series.length;
              const x =
                groupCenter - groupBarsWidth / 2 + seriesIndex * barWidth;
              return (
                <rect
                  key={`${record.day}-${item.key}`}
                  x={x}
                  y={margin.top + plotHeight - barHeight}
                  width={Math.max(1, barWidth - 0.7)}
                  height={barHeight}
                  rx="1"
                  fill={series.length > 1 ? item.color : "#ef4444"}
                  aria-label={`${item.label} · cycle day ${record.day}: ${value} birds`}
                  tabIndex={0}
                  onMouseEnter={(event) => updateTooltip(event, record)}
                  onMouseMove={(event) => updateTooltip(event, record)}
                  onFocus={() =>
                    setTooltip({
                      x: groupCenter,
                      y: Math.max(72, margin.top + plotHeight - barHeight),
                      record,
                    })
                  }
                  onClick={() =>
                    setTooltip({
                      x: groupCenter,
                      y: Math.max(72, margin.top + plotHeight - barHeight),
                      record,
                    })
                  }
                  onBlur={() => setTooltip(null)}
                />
              );
            });
          })}

          {data.map((record, index) =>
            tickIndexes.has(index) ? (
              <text
                key={record.day}
                x={margin.left + groupWidth * (index + 0.5)}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#64748b"
              >
                {record.day}
              </text>
            ) : null
          )}
          </svg>

          {tooltip && (
            <div
              className="pointer-events-none absolute z-20 min-w-40 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg"
              style={{ left: tooltip.x, top: tooltip.y }}
              role="status"
            >
              <div className="font-semibold text-slate-900">
                Cycle day {tooltip.record.day}
              </div>
              {tooltip.record.date && (
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {tooltip.record.date}
                </div>
              )}
              <div className="mt-2 space-y-1">
                {series.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.label}
                    </span>
                    <span className="font-medium text-slate-900">
                      {typeof tooltip.record[`mortality_${item.key}`] ===
                      "number"
                        ? `${tooltip.record[`mortality_${item.key}`]} birds`
                        : "No record"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function ProductionPerformanceCharts({
  title,
  description,
  periodLabel,
  production,
  series,
  className = "",
}: {
  title: string;
  description: string;
  periodLabel: string;
  production?: HistoricalProductionData;
  series?: ProductionPerformanceSeries[];
  className?: string;
}) {
  const displayedSeries: ProductionPerformanceSeries[] =
    series && series.length > 0
      ? series
      : production
        ? [
            {
              key: "current",
              label: title,
              color: "#2563eb",
              production,
            },
          ]
        : [];
  const isMultiZone = displayedSeries.length > 1;
  const seriesSignature = displayedSeries.map((item) => item.key).join("-");
  const summaries = displayedSeries.map((item) => ({
    ...item,
    summary: summarizeProduction(item.production),
  }));
  const mortalityRecords = new Map<number, ChartRecord>();
  const feedWaterRecords = new Map<number, ChartRecord>();
  const weightRecords = new Map<number, ChartRecord>();

  displayedSeries.forEach((item) => {
    item.production.mortality.forEach((record) => {
      const combined = mortalityRecords.get(record.day) ?? {
        day: record.day,
        date: record.date,
      };
      combined[`mortality_${item.key}`] = record.count;
      mortalityRecords.set(record.day, combined);
    });
    item.production.feedWater.forEach((record) => {
      const combined = feedWaterRecords.get(record.day) ?? {
        day: record.day,
        date: record.date,
      };
      combined[`feed_${item.key}`] = record.feedKgPerBird;
      combined[`water_${item.key}`] = record.waterLPerBird;
      feedWaterRecords.set(record.day, combined);
    });
    item.production.weights.forEach((record) => {
      const combined = weightRecords.get(record.day) ?? { day: record.day };
      combined[`weight_${item.key}`] = record.actualWeightKg;
      combined.standardWeightKg ??= record.standardWeightKg;
      weightRecords.set(record.day, combined);
    });
  });

  const mortalityData = sortedChartRecords(mortalityRecords);
  const feedWaterData = sortedChartRecords(feedWaterRecords);
  const weightData = sortedChartRecords(weightRecords);
  const firstSummary = summaries[0]?.summary;

  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMultiZone && (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {displayedSeries.length} active zones
            </span>
          )}
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {periodLabel}
          </span>
        </div>
      </div>

      {isMultiZone ? (
        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {summaries.map(({ key, label, color, summary }) => (
            <article
              key={key}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              style={{ borderTopColor: color, borderTopWidth: 4 }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <h3 className="font-semibold text-slate-950">{label}</h3>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  [
                    "Mortality",
                    `${integer.format(summary.totalMortality)} (${summary.mortalityRate.toFixed(2)}%)`,
                  ],
                  ["Birds remaining", integer.format(summary.survivingBirds)],
                  ["Feed / bird", `${summary.totalFeed.toFixed(3)} kg`],
                  ["Water / bird", `${summary.totalWater.toFixed(3)} L`],
                  [
                    "Final avg weight",
                    `${summary.finalAverageWeightKg.toFixed(3)} kg`,
                  ],
                  ["Estimated FCR", summary.estimatedFcr.toFixed(2)],
                ].map(([metricLabel, value]) => (
                  <div key={metricLabel}>
                    <div className="text-xs text-slate-500">{metricLabel}</div>
                    <div className="mt-0.5 font-semibold text-slate-900">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : firstSummary ? (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            [
              "Mortality",
              `${integer.format(firstSummary.totalMortality)} (${firstSummary.mortalityRate.toFixed(2)}%)`,
            ],
            ["Birds remaining", integer.format(firstSummary.survivingBirds)],
            ["Feed / bird", `${firstSummary.totalFeed.toFixed(3)} kg`],
            ["Water / bird", `${firstSummary.totalWater.toFixed(3)} L`],
            [
              "Final avg weight",
              `${firstSummary.finalAverageWeightKg.toFixed(3)} kg`,
            ],
            ["Estimated FCR", firstSummary.estimatedFcr.toFixed(2)],
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
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Daily Mortality</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            {isMultiZone
              ? "Daily mortality compared across all active zones"
              : `Total ${firstSummary?.totalMortality ?? 0} birds · ${(firstSummary?.mortalityRate ?? 0).toFixed(2)}% of birds placed`}
          </p>
          <div className="h-72">
            <MortalityBars data={mortalityData} series={displayedSeries} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="font-semibold">Daily Feed & Water per Bird</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">
            {isMultiZone
              ? "Feed and water consumption for each active zone"
              : "Daily consumption recorded for this production cycle"}
          </p>
          <div className="h-72">
            <ResponsiveContainer
              key={`feed-water-${seriesSignature}`}
              width="100%"
              height="100%"
            >
              <LineChart data={feedWaterData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" interval={5} />
                <YAxis yAxisId="feed" />
                <YAxis yAxisId="water" orientation="right" />
                <Tooltip labelFormatter={(day) => `Cycle day ${day}`} />
                <Legend />
                {displayedSeries.map((item) => (
                  <Line
                    key={`feed-${item.key}`}
                    yAxisId="feed"
                    type="monotone"
                    dataKey={`feed_${item.key}`}
                    name={isMultiZone ? `${item.label} feed` : "Feed / bird (kg)"}
                    stroke={isMultiZone ? item.color : "#2563eb"}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
                {displayedSeries.map((item) => (
                  <Line
                    key={`water-${item.key}`}
                    yAxisId="water"
                    type="monotone"
                    dataKey={`water_${item.key}`}
                    name={isMultiZone ? `${item.label} water` : "Water / bird (L)"}
                    stroke={isMultiZone ? item.color : "#06b6d4"}
                    strokeDasharray={isMultiZone ? "5 4" : undefined}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm xl:col-span-2 2xl:col-span-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">Body Weight vs Standard</h3>
              <p className="mb-3 mt-1 text-xs text-slate-500">
                {isMultiZone
                  ? "Actual body weight by zone against one shared standard"
                  : firstSummary?.finalWeight
                    ? `Final variance ${firstSummary.weightVariancePercent >= 0 ? "+" : ""}${firstSummary.weightVariancePercent.toFixed(2)}% against the configured standard`
                    : "Waiting for body-weight records for this cycle"}
              </p>
            </div>
            {!isMultiZone && firstSummary && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  !firstSummary.finalWeight
                    ? "bg-slate-100 text-slate-600"
                    : firstSummary.weightVariancePercent < -3
                      ? "bg-amber-100 text-amber-700"
                      : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {firstSummary.finalWeight
                  ? `Final ${firstSummary.finalAverageWeightKg.toFixed(3)} kg`
                  : "No weight data"}
              </span>
            )}
          </div>
          <div className="h-80">
            <ResponsiveContainer
              key={`weight-${seriesSignature}`}
              width="100%"
              height="100%"
            >
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" interval={2} />
                <YAxis />
                <Tooltip labelFormatter={(day) => `Cycle day ${day}`} />
                <Legend />
                {displayedSeries.map((item) => (
                  <Line
                    key={item.key}
                    type="monotone"
                    dataKey={`weight_${item.key}`}
                    name={isMultiZone ? `${item.label} actual` : "Actual weight (kg)"}
                    stroke={isMultiZone ? item.color : "#7c3aed"}
                    dot={false}
                    strokeWidth={2.5}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="standardWeightKg"
                  name="Standard weight (kg)"
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
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
