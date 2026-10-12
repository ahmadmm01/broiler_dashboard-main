"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SENSOR_ALERT_RULES } from "../lib/alertRules";
import {
  getCorrelationMatrix,
  getCycleMetricSummary,
  getDailyThresholdMap,
  getDatasetCoverage,
  getEpisodeSummary,
  getOutcomeAssociations,
  RESEARCH_CYCLES,
  RESEARCH_METRIC_META,
  RESEARCH_METRICS,
} from "../lib/researchAnalysis";
import type { SensorMetric } from "../lib/types";

const cycleColors = ["#0f766e", "#7c3aed"];

function formatValue(value: number, metric: SensorMetric) {
  return value.toFixed(RESEARCH_METRIC_META[metric].decimals);
}

function correlationTone(value: number | null) {
  if (value === null) return "bg-slate-50 text-slate-400";
  const strength = Math.abs(value);
  if (strength >= 0.7) {
    return value > 0
      ? "bg-teal-700 text-white"
      : "bg-violet-700 text-white";
  }
  if (strength >= 0.4) {
    return value > 0
      ? "bg-teal-100 text-teal-900"
      : "bg-violet-100 text-violet-900";
  }
  return "bg-slate-100 text-slate-700";
}

function thresholdCellTone(share: number) {
  if (share === 0) return "bg-emerald-100";
  if (share <= 0.25) return "bg-amber-200";
  if (share <= 0.5) return "bg-orange-400";
  if (share <= 0.75) return "bg-red-500";
  return "bg-red-800";
}

export default function ResearchAnalysis() {
  const [selectedCycleId, setSelectedCycleId] = useState(
    RESEARCH_CYCLES[0]?.id ?? ""
  );
  const [selectedMetric, setSelectedMetric] =
    useState<SensorMetric>("temp");
  const selectedCycle =
    RESEARCH_CYCLES.find((cycle) => cycle.id === selectedCycleId) ??
    RESEARCH_CYCLES[0];

  const correlationMatrix = useMemo(
    () => (selectedCycle ? getCorrelationMatrix(selectedCycle) : null),
    [selectedCycle]
  );
  const thresholdMap = useMemo(
    () => (selectedCycle ? getDailyThresholdMap(selectedCycle) : []),
    [selectedCycle]
  );
  const episodes = useMemo(
    () => (selectedCycle ? getEpisodeSummary(selectedCycle) : []),
    [selectedCycle]
  );
  const associations = useMemo(
    () => (selectedCycle ? getOutcomeAssociations(selectedCycle) : []),
    [selectedCycle]
  );

  if (!selectedCycle) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        No research-cycle dataset is available.
      </section>
    );
  }

  const trendData = Array.from(
    { length: Math.max(...RESEARCH_CYCLES.map((cycle) => cycle.harvestDay)) },
    (_, dayIndex) => {
      const day = dayIndex + 1;
      return Object.fromEntries([
        ["day", day],
        ...RESEARCH_CYCLES.map((cycle) => [
          cycle.id,
          cycle.daily.find((row) => row.day === day)?.[selectedMetric] ?? null,
        ]),
      ]);
    }
  );
  const associationScatter = selectedCycle.daily
    .filter((row) => typeof row.adgGPerDay === "number")
    .map((row) => ({
      day: row.day,
      environment: row[selectedMetric],
      adg: row.adgGPerDay,
      mortality: row.dailyMortality,
    }));

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-950 via-slate-900 to-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="max-w-4xl">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
            Analysis
          </div>
          <h2 className="mt-2 text-3xl font-semibold">
            Original two-cycle environmental evidence
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            This view uses the two original Zone A cycles from the supplied
            workbook. It does not use the shifted or blended batch profiles in
            the operational history view.
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RESEARCH_CYCLES.map((cycle, index) => {
            const coverage = getDatasetCoverage(cycle);
            return (
              <div
                key={cycle.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{cycle.label}</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: cycleColors[index] }}
                  />
                </div>
                <div className="mt-3 text-2xl font-semibold">
                  {coverage.received} readings
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  {cycle.harvestDay} days · {cycle.readingsPerDay} readings/day
                  · {coverage.completeness.toFixed(0)}% dataset coverage
                </div>
              </div>
            );
          })}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:col-span-2">
            <div className="text-sm font-semibold">Interpretation boundary</div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              Dashboard thresholds support screening and episode summaries.
              Correlations describe association only. They do not establish
              biological or operational causation.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              Finding 02
            </div>
            <h3 className="mt-1 text-2xl font-semibold text-slate-950">
              Environmental conditions by broiler age
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Daily averages align both cycles to Day 1–37 for a comparable age
              basis.
            </p>
          </div>
          <label className="text-sm font-medium text-slate-700">
            Environmental variable
            <select
              value={selectedMetric}
              onChange={(event) =>
                setSelectedMetric(event.target.value as SensorMetric)
              }
              className="mt-1 block min-w-56 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {RESEARCH_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {RESEARCH_METRIC_META[metric].label} (
                  {RESEARCH_METRIC_META[metric].unit})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" label={{ value: "Broiler age (day)", position: "insideBottom", offset: -2 }} />
              <YAxis
                width={62}
                label={{
                  value: RESEARCH_METRIC_META[selectedMetric].unit,
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <Tooltip />
              <Legend />
              {RESEARCH_CYCLES.map((cycle, index) => (
                <Line
                  key={cycle.id}
                  type="monotone"
                  dataKey={cycle.id}
                  name={cycle.label}
                  stroke={cycleColors[index]}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
                Finding 03
              </div>
              <h3 className="mt-1 text-2xl font-semibold text-slate-950">
                Environmental correlation matrix
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Pearson correlation across {selectedCycle.readings.length} raw
                observations.
              </p>
            </div>
            <CycleSelector
              value={selectedCycle.id}
              onChange={setSelectedCycleId}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] border-separate border-spacing-1 text-center text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left text-slate-500">Variable</th>
                  {RESEARCH_METRICS.map((metric) => (
                    <th key={metric} className="p-2 font-semibold text-slate-700">
                      {RESEARCH_METRIC_META[metric].shortLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESEARCH_METRICS.map((rowMetric) => (
                  <tr key={rowMetric}>
                    <th className="p-2 text-left font-semibold text-slate-700">
                      {RESEARCH_METRIC_META[rowMetric].shortLabel}
                    </th>
                    {RESEARCH_METRICS.map((columnMetric) => {
                      const value = correlationMatrix?.[rowMetric][columnMetric] ?? null;
                      return (
                        <td
                          key={columnMetric}
                          className={`rounded-lg p-3 font-semibold ${correlationTone(value)}`}
                        >
                          {value === null ? "—" : value.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Repeated time-series observations may be autocorrelated. Treat the
            coefficients as descriptive evidence and review timing before
            interpreting a relationship.
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            Finding 09
          </div>
          <h3 className="mt-1 text-2xl font-semibold text-slate-950">
            Environment and production outcomes
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Exploratory daily associations for {selectedCycle.label}.
          </p>
          <div className="mt-5 space-y-3">
            {associations.map((association) => (
              <div
                key={association.metric}
                className="grid grid-cols-[minmax(100px,1fr)_90px_90px] items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-700">
                  {RESEARCH_METRIC_META[association.metric].shortLabel}
                </span>
                <span className="text-right text-slate-600">
                  ADG {association.adg?.toFixed(2) ?? "—"}
                </span>
                <span className="text-right text-slate-600">
                  Mort. {association.mortality?.toFixed(2) ?? "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, bottom: 28, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="environment"
                  name={RESEARCH_METRIC_META[selectedMetric].shortLabel}
                  unit={` ${RESEARCH_METRIC_META[selectedMetric].unit}`}
                  label={{ value: RESEARCH_METRIC_META[selectedMetric].shortLabel, position: "insideBottom", offset: -16 }}
                />
                <YAxis type="number" dataKey="adg" name="ADG" unit=" g/day" width={66} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={associationScatter} fill={RESEARCH_METRIC_META[selectedMetric].color} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs leading-5 text-amber-800">
            Age, management, and repeated measurements may explain part of
            these patterns. The view reports association, not environmental
            impact or causation.
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
          Finding 04
        </div>
        <h3 className="mt-1 text-2xl font-semibold text-slate-950">
          Daily threshold exceedance map
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Each cell shows the share of four daily readings above the configured
          dashboard threshold for {selectedCycle.label}.
        </p>
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="min-w-[1050px]">
            <div className="grid grid-cols-[110px_repeat(37,minmax(20px,1fr))] gap-1 text-center text-[10px] text-slate-500">
              <div className="text-left font-semibold">Variable</div>
              {Array.from({ length: 37 }, (_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
              {thresholdMap.flatMap((row) => [
                <div
                  key={`${row.metric}-label`}
                  className="flex items-center font-semibold text-slate-700"
                >
                  {RESEARCH_METRIC_META[row.metric].shortLabel}
                </div>,
                ...row.days.map((day) => (
                  <div
                    key={`${row.metric}-${day.day}`}
                    title={`${RESEARCH_METRIC_META[row.metric].shortLabel}, Day ${day.day}: ${day.exceedances}/${day.total} readings above ${SENSOR_ALERT_RULES[row.metric].threshold} ${SENSOR_ALERT_RULES[row.metric].unit}`}
                    className={`h-7 rounded ${thresholdCellTone(day.share)}`}
                  />
                )),
              ])}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
          {[
            ["0%", "bg-emerald-100"],
            ["1–25%", "bg-amber-200"],
            ["26–50%", "bg-orange-400"],
            ["51–75%", "bg-red-500"],
            ["76–100%", "bg-red-800"],
          ].map(([label, tone]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded ${tone}`} /> {label}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            Finding 05
          </div>
          <h3 className="mt-1 text-2xl font-semibold text-slate-950">
            Rule-based anomaly episodes
          </h3>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[580px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-3">Variable</th>
                  <th className="pb-3 text-right">Episodes</th>
                  <th className="pb-3 text-right">Readings above</th>
                  <th className="pb-3 text-right">Longest run</th>
                </tr>
              </thead>
              <tbody>
                {episodes.map((item) => (
                  <tr key={item.metric} className="border-b border-slate-100">
                    <td className="py-3 font-medium text-slate-800">
                      {RESEARCH_METRIC_META[item.metric].shortLabel}
                    </td>
                    <td className="py-3 text-right">{item.episodes}</td>
                    <td className="py-3 text-right">
                      {item.readingsAbove} ({item.exceedancePercent.toFixed(1)}%)
                    </td>
                    <td className="py-3 text-right">
                      {item.longestRun} consecutive samples
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            An episode begins when a metric crosses its configured threshold
            and ends when it returns to or below that threshold. Sampling occurs
            every {selectedCycle.intervalMinutes / 60} hours, so this view does
            not claim exact continuous event duration.
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            Findings 06–07
          </div>
          <h3 className="mt-1 text-2xl font-semibold text-slate-950">
            Cycle stability and dataset coverage
          </h3>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-3">Variable</th>
                  {RESEARCH_CYCLES.map((cycle) => (
                    <th key={cycle.id} className="pb-3 text-right">
                      {cycle.label} avg. / CV / outside
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RESEARCH_METRICS.map((metric) => (
                  <tr key={metric} className="border-b border-slate-100">
                    <td className="py-3 font-medium text-slate-800">
                      {RESEARCH_METRIC_META[metric].shortLabel}
                    </td>
                    {RESEARCH_CYCLES.map((cycle) => {
                      const summary = getCycleMetricSummary(cycle, metric);
                      return (
                        <td key={cycle.id} className="py-3 text-right text-slate-700">
                          {formatValue(summary.average, metric)} {RESEARCH_METRIC_META[metric].unit}
                          <span className="block text-xs text-slate-500">
                            CV {summary.coefficientOfVariation.toFixed(1)}% · outside {summary.exceedancePercent.toFixed(1)}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {RESEARCH_CYCLES.map((cycle) => {
              const coverage = getDatasetCoverage(cycle);
              return (
                <div key={cycle.id} className="rounded-xl bg-slate-50 p-4">
                  <div className="font-semibold text-slate-800">
                    {cycle.label} dataset coverage
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-teal-700">
                    {coverage.completeness.toFixed(0)}%
                  </div>
                  <div className="text-xs text-slate-500">
                    {coverage.received} received / {coverage.expected} expected
                    records
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Coverage describes records present in the supplied workbook. It
            does not measure device uptime, transmission success, sensor drift,
            or communication outages.
          </p>
        </article>
      </section>
    </div>
  );
}

function CycleSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      Source cycle
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block min-w-44 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        {RESEARCH_CYCLES.map((cycle) => (
          <option key={cycle.id} value={cycle.id}>
            {cycle.label}
          </option>
        ))}
      </select>
    </label>
  );
}
