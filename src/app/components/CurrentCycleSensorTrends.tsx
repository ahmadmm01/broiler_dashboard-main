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
import { aggregateSensorReadings, sampleSensorTrend, summarizeSensorMetric } from "../lib/sensorTrendData";
import SensorTrendCard from "./SensorTrendCard";
import type {
  DataPoint,
  ProductionCycle,
  SensorMetric,
  Zone,
} from "../lib/types";

type AggregationMode = "live" | "raw" | "hourly" | "daily";

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

const LIVE_WINDOW_HOURS = 6;
const LIVE_WINDOW_MS = LIVE_WINDOW_HOURS * 60 * 60 * 1000;

export default function CurrentCycleSensorTrends({
  series,
  disconnected = false,
  replay = false,
}: {
  series: CurrentCycleSensorSeries[];
  disconnected?: boolean;
  replay?: boolean;
}) {
  const [aggregation, setAggregation] =
    useState<AggregationMode>("hourly");
  const isAveraged = aggregation === "hourly" || aggregation === "daily";
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
            ? aggregateSensorReadings(liveWindowData, "raw")
            : aggregation === "raw"
              ? sampleSensorTrend(aggregateSensorReadings(data, "raw"))
            : aggregateSensorReadings(data, aggregation);
        const summaries = Object.fromEntries(
          metricOrder.map((metric) => {
            return [
              metric,
              summarizeSensorMetric(summaryData, chartPoints, metric),
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
            episodeCount: number;
            plottedExceedances: number;
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
          combined[`${metric}Peak${zone}`] = point.peaks[metric];
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
              {replay
                ? "Monitoring data"
                : disconnected
                ? "Environmental data"
                : hasActiveCycle
                ? "Current cycle environment"
                : "Environmental monitoring"}
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              {replay
                ? "Sensor Trends"
                : disconnected
                ? "Last Recorded Sensor Trends"
                : hasActiveCycle
                ? "Current Cycle Sensor Trends"
                : "Environmental Sensor Trends"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {replay
                ? "Environmental readings advance with the selected monitoring timestamp."
                : disconnected
                ? "Sensor connection is inactive. The charts below show the last recorded data and are not realtime."
                : !hasActiveCycle
                ? "Sensor monitoring remains available before a production cycle starts."
                : series.length === 1
                ? `One-minute environmental readings from ${series[0].cycle.startDate} onward for ${zoneLabel}.`
                : "Each zone is filtered from its own active-cycle start date, so zones at different flock ages remain comparable without mixing their timelines."}
              {!disconnected && !replay && (
                <>
                  {" "}Live mode follows the latest six-hour rolling window for
                  every displayed zone.
                </>
              )}
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
                    {replay
                      ? `Zone ${zone} · ${zoneCycle.id} · Day ${cycleDay}`
                      : disconnected
                      ? `Zone ${zone} · Sensor disconnected`
                      : zoneCycle.status === "draft"
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
                  ? "recent raw points"
                  : aggregation === "raw"
                    ? "raw points"
                  : aggregation === "hourly"
                    ? "hourly points"
                    : "daily points"}
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 font-semibold ${
                  disconnected
                    ? "border-slate-300 bg-slate-100 text-slate-700"
                    : replay
                      ? "border-violet-200 bg-violet-50 text-violet-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {replay
                  ? "Selected timestamp active"
                  : disconnected
                    ? "Sensor Disconnected"
                    : "Updates every minute"}
              </span>
            </div>
          </div>
          <div
            className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-200 bg-white p-1"
            aria-label="Current cycle sensor trend aggregation"
          >
            {(
              [
                [
                  "live",
                  replay
                    ? "Recent Window"
                    : disconnected
                      ? "Last Recorded · 6 Hours"
                      : "Live · Last 6 Hours",
                ],
                ["raw", "Raw Readings"],
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

      {disconnected && (
        <div className="border-b border-slate-200 bg-slate-900 px-5 py-3 text-sm font-semibold text-white">
          Sensor Disconnected · Displaying last recorded environmental data
        </div>
      )}
      {totalReadings > 0 && isAveraged && (
        <p className="border-b border-slate-100 px-5 py-3 text-xs leading-5 text-slate-600">
          Solid line: {aggregation === "hourly" ? "hourly" : "daily"} average. Dashed line: recorded peak in the same period. Limit counts use raw readings, so a brief crossing can occur while the average stays below the limit.
        </p>
      )}
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
        <div className="grid grid-cols-1 items-start gap-5 p-5 lg:grid-cols-2 2xl:grid-cols-3">
          {metricOrder.map((metric, index) => {
            const rule = SENSOR_ALERT_RULES[metric];
            return (
              <SensorTrendCard
                key={metric}
                title={rule.label}
                unit={rule.unit}
                valueDigits={metric === "co2" ? 0 : 2}
                emphasized={index === metricOrder.length - 1}
                plottedLabel={!isAveraged ? "Raw points" : aggregation === "hourly" ? "Hourly averages" : "Daily averages"}
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
                      {(preparedSeries.length > 1 || isAveraged) && <Legend />}
                      {preparedSeries.map(({ zone }) => (
                        <Line
                          key={zone}
                          type="monotone"
                          dataKey={`${metric}${zone}`}
                          name={`Zone ${zone} · ${!isAveraged ? "Reading" : aggregation === "hourly" ? "Hourly average" : "Daily average"}`}
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
                      {isAveraged && preparedSeries.map(({ zone }) => (
                        <Line key={`peak-${zone}`} type="linear" dataKey={`${metric}Peak${zone}`} name={`Zone ${zone} · Recorded peak`}
                          stroke={preparedSeries.length > 1 ? zoneColors[zone] : "#ea580c"} strokeDasharray="4 4" strokeWidth={1.5}
                          dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />
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
