"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SENSOR_ALERT_RULES } from "../lib/alertRules";
import { dateToDayNumber } from "../lib/dateUtils";
import SensorTrendCard from "./SensorTrendCard";
import type {
  DataPoint,
  ProductionCycle,
  SensorMetric,
  Zone,
} from "../lib/types";

type AggregationMode = "live" | "hourly" | "daily";

type TrendPoint = DataPoint & {
  label: string;
};

type MultiZoneTrendPoint = {
  label: string;
  time: string;
  ts: number;
  [key: string]: string | number;
};

export type CurrentCycleSensorSeries = {
  zone: Zone;
  cycle: ProductionCycle;
  data: DataPoint[];
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

const zoneColors: Record<Zone, string> = {
  A: "#ef4444",
  B: "#2563eb",
  C: "#16a34a",
};

const round = (value: number, digits = 2) =>
  Number(value.toFixed(digits));

const LIVE_WINDOW_HOURS = 6;
const LIVE_WINDOW_MS = LIVE_WINDOW_HOURS * 60 * 60 * 1000;

function aggregateReadings(
  data: DataPoint[],
  mode: "hourly" | "daily"
): TrendPoint[] {
  const groups = new Map<
    number,
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
    const pointDate = new Date(point.ts);
    const periodStart =
      mode === "hourly"
        ? new Date(
            pointDate.getFullYear(),
            pointDate.getMonth(),
            pointDate.getDate(),
            pointDate.getHours()
          )
        : new Date(
            pointDate.getFullYear(),
            pointDate.getMonth(),
            pointDate.getDate()
          );
    const key = periodStart.getTime();
    const current = groups.get(key) ?? {
      count: 0,
      ts: key,
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
    groups.set(key, current);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .map(([periodStart, values]) => {
      const date = new Date(periodStart);
      const dateLabel = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(
        date.getDate()
      ).padStart(2, "0")}`;
      const hourLabel = `${String(date.getHours()).padStart(2, "0")}:00`;

      return {
        time:
          mode === "hourly"
            ? `${date.toISOString().slice(0, 10)} ${hourLabel}`
            : date.toISOString().slice(0, 10),
        dayLabel: dateLabel,
        label: mode === "hourly" ? `${dateLabel} ${hourLabel}` : dateLabel,
        ts: values.ts,
        temp: round(values.temp / values.count),
        humidity: round(values.humidity / values.count),
        co2: Math.round(values.co2 / values.count),
        nh3: round(values.nh3 / values.count),
        pm25: round(values.pm25 / values.count),
      };
    });
}

function formatLive(data: DataPoint[]): TrendPoint[] {
  return data.map((point) => ({
    ...point,
    label: point.time.slice(11, 16),
  }));
}

export default function CurrentCycleSensorTrends({
  series,
}: {
  series: CurrentCycleSensorSeries[];
}) {
  const [aggregation, setAggregation] =
    useState<AggregationMode>("hourly");
  const preparedSeries = useMemo(
    () =>
      series.map(({ zone, cycle, data }) => {
        const latestTimestamp = data.at(-1)?.ts;
        const liveWindowData = latestTimestamp
          ? data.filter((point) => point.ts >= latestTimestamp - LIVE_WINDOW_MS)
          : [];
        const summaryData = aggregation === "live" ? liveWindowData : data;
        const chartPoints =
          aggregation === "live"
            ? formatLive(liveWindowData)
            : aggregateReadings(data, aggregation);
        const summaries = Object.fromEntries(
          metricOrder.map((metric) => {
            const values = summaryData.map((point) => point[metric]);
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
        >;

        return { zone, cycle, data, chartPoints, summaries };
      }),
    [aggregation, series]
  );
  const chartData = useMemo(() => {
    const pointsByTimestamp = new Map<number, MultiZoneTrendPoint>();

    preparedSeries.forEach(({ zone, chartPoints }) => {
      chartPoints.forEach((point) => {
        const combined = pointsByTimestamp.get(point.ts) ?? {
          label: point.label,
          time: point.time,
          ts: point.ts,
        };
        metricOrder.forEach((metric) => {
          combined[`${metric}${zone}`] = point[metric];
        });
        pointsByTimestamp.set(point.ts, combined);
      });
    });

    return Array.from(pointsByTimestamp.values()).sort(
      (left, right) => left.ts - right.ts
    );
  }, [preparedSeries]);
  const totalReadings = series.reduce(
    (total, zoneSeries) => total + zoneSeries.data.length,
    0
  );
  const hasActiveCycle = series.some(
    ({ cycle }) => cycle.status === "active"
  );
  const seriesSignature = preparedSeries.map(({ zone }) => zone).join("-");
  const zoneLabel =
    series.length === 1
      ? `Zone ${series[0].zone}`
      : `all monitored zones (${series.map(({ zone }) => zone).join(", ")})`;

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow">
      <div className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50 via-sky-50 to-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
              {hasActiveCycle
                ? "Current cycle environment"
                : "Environmental monitoring"}
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              {hasActiveCycle
                ? "Current Cycle Sensor Trends"
                : "Environmental Sensor Trends"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {!hasActiveCycle
                ? "Sensor monitoring remains available before a production cycle starts."
                : series.length === 1
                ? `One-minute environmental readings from ${series[0].cycle.startDate} onward for ${zoneLabel}.`
                : "Each zone is filtered from its own active-cycle start date, so zones at different flock ages remain comparable without mixing their timelines."}{" "}
              Live mode follows the latest six-hour rolling window for every
              displayed zone.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {series.map(({ zone, cycle: zoneCycle, data }) => {
                const latestDate = data.at(-1)?.time.slice(0, 10);
                const cycleDay = latestDate
                  ? dateToDayNumber(latestDate, zoneCycle.startDate)
                  : 1;
                return (
                  <span
                    key={zone}
                    className="rounded-full border border-cyan-100 bg-white px-2.5 py-1 text-cyan-800"
                  >
                    {zoneCycle.status === "draft"
                      ? `Zone ${zone} · No active cycle`
                      : `Zone ${zone} · ${zoneCycle.id} · Day ${cycleDay}`}
                  </span>
                );
              })}
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                {totalReadings} readings across {series.length} zone
                {series.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                {chartData.length}{" "}
                {aggregation === "live"
                  ? "live points"
                  : aggregation === "hourly"
                    ? "hourly points"
                    : "daily points"}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                Updates every minute
              </span>
            </div>
          </div>
          <div
            className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1"
            aria-label="Current cycle sensor trend aggregation"
          >
            {(
              [
                ["live", "Live · Last 6 Hours"],
                ["hourly", "Hourly Average"],
                ["daily", "Daily Average"],
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

      {totalReadings === 0 ? (
        <div className="p-8 text-center">
          <h3 className="font-semibold text-slate-800">
            Waiting for sensor readings
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Environmental readings will appear when the sensor connection is
            available.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2 2xl:grid-cols-3">
          {metricOrder.map((metric, index) => {
            const rule = SENSOR_ALERT_RULES[metric];
            return (
              <SensorTrendCard
                key={metric}
                title={rule.label}
                unit={rule.unit}
                valueDigits={metric === "co2" ? 0 : 2}
                emphasized={index === metricOrder.length - 1}
                summaries={preparedSeries.map(({ zone, summaries }) => ({
                  id: zone,
                  label: `Zone ${zone}`,
                  color: zoneColors[zone],
                  ...summaries[metric],
                }))}
              >
                <div className="h-60">
                  <ResponsiveContainer
                    key={`${metric}-${seriesSignature}-${aggregation}`}
                    width="100%"
                    height="100%"
                  >
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 14, bottom: 4, left: 2 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="label"
                        minTickGap={aggregation === "live" ? 48 : 32}
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
                      {preparedSeries.length > 1 && <Legend />}
                      {preparedSeries.map(({ zone }) => (
                        <Line
                          key={zone}
                          type="monotone"
                          dataKey={`${metric}${zone}`}
                          name={`Zone ${zone}`}
                          stroke={
                            preparedSeries.length > 1
                              ? zoneColors[zone]
                              : metricColors[metric]
                          }
                          strokeWidth={2.25}
                          dot={aggregation === "daily" ? { r: 2.5 } : false}
                          activeDot={{ r: 4 }}
                          connectNulls
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SensorTrendCard>
            );
          })}
        </div>
      )}
    </section>
  );
}
