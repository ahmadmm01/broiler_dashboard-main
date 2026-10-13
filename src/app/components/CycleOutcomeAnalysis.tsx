"use client";

import { useState } from "react";
import type {
  CycleOutcomeAnalysis as CycleOutcomeAnalysisData,
  FarmerOutcomeAdvice,
} from "../lib/outcomeAnalysis";

const directionStyle = {
  better: "border-emerald-200 bg-emerald-50 text-emerald-700",
  weaker: "border-amber-200 bg-amber-50 text-amber-700",
  similar: "border-slate-200 bg-slate-50 text-slate-600",
};

function AdviceSections({ advice }: { advice: FarmerOutcomeAdvice }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold text-slate-950">What happened</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {advice.whatHappened.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold text-slate-950">Why it matters</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {advice.whyItMatters.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold text-slate-950">What to monitor next</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {advice.monitoringFocus.map((item) => (
            <span
              key={item}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {item}
            </span>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold text-slate-950">Suggested actions</h4>
        <div className="mt-3 space-y-3">
          {advice.suggestedActions.map((item, index) => (
            <div key={`${item.action}-${index}`} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                {index + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {item.action}
                </div>
                <div className="mt-0.5 text-xs leading-5 text-slate-500">
                  {item.reason}
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

export function CycleOutcomeSnapshot({
  analysis,
}: {
  analysis: CycleOutcomeAnalysisData;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Farmer outcome snapshot
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              {analysis.isFinal
                ? "Completed Cycle Outcome"
                : `Outcome to Day ${analysis.currentDay}`}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {analysis.localAdvice.summary}
            </p>
          </div>
          <span className="w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
            {analysis.isFinal
              ? "Final recorded outcome"
              : `${analysis.progressPercent.toFixed(0)}% of cycle timeline`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
        {[
          ["Survival", `${analysis.survivalRate.toFixed(2)}%`],
          ["Cumulative mortality", `${analysis.mortalityRate.toFixed(2)}%`],
          [
            "Latest average weight",
            analysis.averageWeightKg > 0
              ? `${analysis.averageWeightKg.toFixed(2)} kg`
              : "Not recorded yet",
          ],
          [
            "Readings within limits",
            analysis.sensorRecords > 0
              ? `${analysis.readingsWithinLimitsPercent.toFixed(1)}%`
              : "No readings",
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 font-semibold text-slate-950">{value}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-700">
        <span className="font-semibold text-slate-950">Next farmer check: </span>
        {analysis.localAdvice.suggestedActions[0]?.action}
      </div>
    </section>
  );
}

export default function CycleOutcomeAnalysis({
  analysis,
  onGenerateStart,
}: {
  analysis: CycleOutcomeAnalysisData;
  onGenerateStart?: () => void;
}) {
  const [results, setResults] = useState<
    Record<string, FarmerOutcomeAdvice>
  >({});
  const [loadingSignature, setLoadingSignature] = useState<string>();
  const [errorSignature, setErrorSignature] = useState<string>();
  const generatedAdvice = results[analysis.signature];
  const isGenerating = loadingSignature === analysis.signature;
  const hasError = errorSignature === analysis.signature;

  const generateInsight = async () => {
    onGenerateStart?.();
    setLoadingSignature(analysis.signature);
    setErrorSignature(undefined);

    try {
      const response = await fetch("/api/outcome-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseline: analysis }),
      });
      const json = await response.json();
      if (!response.ok || !json.advice) {
        throw new Error("Outcome insight is unavailable");
      }
      setResults((current) => ({
        ...current,
        [analysis.signature]: json.advice,
      }));
    } catch {
      setErrorSignature(analysis.signature);
    } finally {
      setLoadingSignature(undefined);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Production outcome
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              Cycle Outcome Analysis
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              A farmer-focused reading of recorded production and environment
              data {analysis.isFinal ? "for the completed cycle" : `through Day ${analysis.currentDay}`}.
              It describes association, not proof of cause.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <button
              type="button"
              onClick={generateInsight}
              disabled={isGenerating}
              className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
            >
              {isGenerating
                ? "Generating Outcome Insight…"
                : generatedAdvice
                  ? "Refresh Outcome Insight"
                  : "Generate Outcome Insight"}
            </button>
            <span className="text-right text-xs text-slate-500">
              Generated only when requested
            </span>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>
              {analysis.isFinal
                ? "Completed cycle record"
                : `Outcome to Day ${analysis.currentDay}`}
            </span>
            <span>{analysis.progressPercent.toFixed(0)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-emerald-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-[width]"
              style={{ width: `${analysis.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Birds remaining", analysis.survivingBirds.toLocaleString()],
            ["Survival", `${analysis.survivalRate.toFixed(2)}%`],
            ["Mortality", `${analysis.mortalityRate.toFixed(2)}%`],
            [
              "Average weight",
              analysis.averageWeightKg > 0
                ? `${analysis.averageWeightKg.toFixed(2)} kg`
                : "Not recorded",
            ],
            [
              analysis.isFinal ? "FCR" : "Cumulative FCR",
              analysis.cumulativeFcr > 0
                ? analysis.cumulativeFcr.toFixed(2)
                : "Not available",
            ],
            [
              "Efficiency index",
              typeof analysis.efficiencyIndex === "number"
                ? analysis.efficiencyIndex.toFixed(2)
                : "At cycle completion",
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="h-fit rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-1 font-semibold text-slate-950">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-950">
                Environmental context
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {analysis.sensorRecords.toLocaleString()} raw readings · {analysis.readingsWithinLimitsPercent.toFixed(1)}% below all configured review limits
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              {analysis.alertCount} alert episode{analysis.alertCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {analysis.sensorMetrics.map((metric) => (
              <div
                key={metric.key}
                className="h-fit rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="text-xs text-slate-500">Avg {metric.label}</div>
                <div className="mt-1 text-sm font-semibold text-slate-950">
                  {metric.average.toFixed(metric.key === "co2" ? 0 : 1)} {metric.unit}
                </div>
                <div className={`mt-2 text-[11px] leading-4 ${metric.exceedanceCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {metric.exceedanceCount > 0
                    ? `${metric.exceedancePercent.toFixed(1)}% at/above ${metric.reviewLimit} ${metric.unit}`
                    : `Below ${metric.reviewLimit} ${metric.unit}`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {analysis.finalComparison ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <h3 className="font-semibold text-slate-950">
              Final comparison with Batch {analysis.finalComparison.previousBatch}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Lower mortality and FCR are favourable; higher weight and efficiency index are favourable.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {analysis.finalComparison.metrics.map((metric) => (
                <div key={metric.label} className="rounded-lg border border-violet-100 bg-white p-3">
                  <div className="text-xs text-slate-500">{metric.label}</div>
                  <div className="mt-1 font-semibold text-slate-950">
                    {metric.currentValue}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Batch {analysis.finalComparison?.previousBatch}: {metric.previousValue}
                  </div>
                  <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${directionStyle[metric.direction]}`}>
                    {metric.change} · {metric.direction === "better" ? "Improved" : metric.direction === "weaker" ? "Needs follow-up" : "Similar"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-3 text-sm text-violet-800">
            Final efficiency and previous-batch comparison will appear when the replay reaches the completed cycle record.
          </div>
        )}

        <div>
          <div className="mb-3">
            <h3 className="font-semibold text-slate-950">
              Recorded-data interpretation
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {analysis.localAdvice.summary}
            </p>
          </div>
          <AdviceSections advice={analysis.localAdvice} />
        </div>

        {isGenerating && (
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-5 text-sm text-violet-700">
            Reviewing the selected replay position and preparing farmer-facing actions…
          </div>
        )}

        {hasError && !isGenerating && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
            Generated insight is unavailable right now. The recorded-data analysis above remains available and unchanged.
          </div>
        )}

        {generatedAdvice && !isGenerating && (
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
              Generated farmer interpretation
            </div>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">
              Outcome Insight
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {generatedAdvice.summary}
            </p>
            <div className="mt-4">
              <AdviceSections advice={generatedAdvice} />
            </div>
          </div>
        )}

        <p className="text-xs leading-5 text-slate-500">
          This decision-support view uses only records available at the selected replay position. Confirm unusual flock conditions through physical inspection and farm management procedures.
        </p>
      </div>
    </section>
  );
}
