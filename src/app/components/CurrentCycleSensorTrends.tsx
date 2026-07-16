"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SENSOR_ALERT_RULES } from "../lib/alertRules";
import type {
  DataPoint,
  ProductionCycle,
  SensorMetric,
  Zone,
} from "../lib/types";

type AggregationMode = "daily" | "raw";

type TrendPoint = DataPoint & {
  label: string;
};

const metricOrder: SensorMetric[] = [
  "temp",
  "humidity",
  "co2",
  "nh3",
  "pm25",
];

const metricColors: Record<SensorMetric, string> = {
  temp: "#ef4444",
  humidity: "#2563eb",
  co2: "#7c3aed",
  nh3: "#d97706",
  pm25: "#475569",
};

const round = (value: number, digits = 2) =>
  Number(value.toFixed(digits));

function aggregateDaily(data: DataPoint[]): TrendPoint[] {
  const days = new Map<
    string,
    {
      count: number;
      ts: number;
      temp: number;
      humidity: number;
      co2: number;
      nh3: number;
      pm25: number;
    }
  >();

  data.forEach((point) => {
    const date = point.time.slice(0, 10);
    const current = days.get(date) ?? {
      count: 0,
      ts: point.ts,
      temp: 0,
      humidity: 0,
      co2: 0,
      nh3: 0,
      pm25: 0,
    };
    current.count += 1;
    current.ts = Math.max(current.ts, point.ts);
    metricOrder.forEach((metric) => {
      current[metric] += point[metric];
    });
    days.set(date, current);
  });

  return Array.from(days.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      time: date,
      dayLabel: date,
      label: date.slice(5).replace("-", "/"),
      ts: values.ts,
      temp: round(values.temp / values.count),
      humidity: round(values.humidity / values.count),
      co2: Math.round(values.co2 / values.count),
      nh3: round(values.nh3 / values.count),
      pm25: round(values.pm25 / values.count),
    }));
}

function formatRaw(data: DataPoint[]): TrendPoint[] {
  return data.map((point) => ({
    ...point,
    label: `${point.time.slice(5, 10).replace("-", "/")} ${point.time.slice(11, 16)}`,
  }));
}

export default function CurrentCycleSensorTrends({
  cycle,
  data,
  zone,
}: {
  cycle: ProductionCycle;
  data: DataPoint[];
  zone: Zone;
}) {
  const [aggregation, setAggregation] =
    useState<AggregationMode>("daily");
  const chartData = useMemo(
    () => (aggregation === "daily" ? aggregateDaily(data) : formatRaw(data)),
    [aggregation, data]
  );
  const metricSummaries = useMemo(
    () =>
      Object.fromEntries(
        metricOrder.map((metric) => {
          const values = data.map((point) => point[metric]);
          const rule = SENSOR_ALERT_RULES[metric];
          return [
            metric,
            {
              average: values.length
                ? values.reduce((total, value) => total + value, 0) /
                  values.length
                : 0,
              minimum: values.length ? Math.min(...values) : 0,
              maximum: values.length ? Math.max(...values) : 0,
              latest: values.at(-1) ?? 0,
              exceedances: values.filter((value) => value > rule.threshold)
                .length,
            },
          ];
        })
      ) as Record<
        SensorMetric,
        {
          average: number;
          minimum: number;
          maximum: number;
          latest: number;
          exceedances: number;
        }
      >,
    [data]
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow">
      <div className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-sky-50 to-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
              Current cycle environment
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              Current Cycle Sensor Trends
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Environmental readings from {cycle.startDate} onward for Zone {zone}.
              Previous-cycle sensor records are excluded.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-cyan-100 bg-white px-2.5 py-1 text-cyan-800">
                {cycle.id}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                {data.length} readings
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                {chartData.length} {aggregation === "daily" ? "daily points" : "raw points"}
              </span>
            </div>
          </div>
          <div
            className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1"
            aria-label="Current cycle sensor trend aggregation"
          >
            {(
              [
                ["daily", "Daily Average"],
                ["raw", "Raw Readings"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAggregation(value)}
                aria-pressed={aggregation === value}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  aggregation === value
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="p-8 text-center">
          <h3 className="font-semibold text-slate-800">
            Waiting for current-cycle sensor readings
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Readings will appear here when their date is on or after the cycle
            start date.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
          {metricOrder.map((metric, index) => {
            const rule = SENSOR_ALERT_RULES[metric];
            const summary = metricSummaries[metric];
            return (
              <article
                key={metric}
                className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-4 ${
                  index === metricOrder.length - 1 ? "lg:col-span-2" : ""
                }`}
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">
                      {rule.label} ({rule.unit})
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Avg {summary.average.toFixed(2)} · Range{" "}
                      {summary.minimum.toFixed(2)}–{summary.maximum.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-slate-950">
                      {summary.latest.toFixed(metric === "co2" ? 0 : 2)} {rule.unit}
                    </div>
                    <div
                      className={`text-xs ${
                        summary.exceedances
                          ? "font-semibold text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {summary.exceedances
                        ? `${summary.exceedances} readings above limit`
                        : "No reading above limit"}
                    </div>
                  </div>
                </div>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 14, bottom: 4, left: 2 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="label"
                        minTickGap={aggregation === "daily" ? 28 : 46}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        width={56}
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <ReferenceLine
                        y={rule.threshold}
                        stroke="#f59e0b"
                        strokeDasharray="5 4"
                        ifOverflow="extendDomain"
                        label={{
                          value: `Limit ${rule.threshold}`,
                          position: "insideTopRight",
                          fill: "#b45309",
                          fontSize: 10,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey={metric}
                        name={rule.label}
                        stroke={metricColors[metric]}
                        strokeWidth={2.25}
                        dot={aggregation === "daily" ? { r: 2.5 } : false}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
