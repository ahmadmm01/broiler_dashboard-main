"use client";

import { useMemo, useState } from "react";
import {
  createHistoricalCycleAnalysis,
  type HistoricalAnalysisRisk,
  type HistoricalCycleAdvice,
} from "../lib/historicalCycleAnalysis";
import type { HistoricalCycle } from "../lib/historicalCycles";

const riskStyle: Record<HistoricalAnalysisRisk, string> = {
  Low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Moderate: "border-amber-200 bg-amber-50 text-amber-700",
  High: "border-red-200 bg-red-50 text-red-700",
};

export default function HistoricalCycleAiAnalysis({
  cycle,
}: {
  cycle: HistoricalCycle;
}) {
  const analysis = useMemo(
    () => createHistoricalCycleAnalysis(cycle),
    [cycle]
  );
  const signature = JSON.stringify(analysis.baseline);
  const [aiResult, setAiResult] = useState<{
    signature: string;
    advice: HistoricalCycleAdvice;
  } | null>(null);
  const [requestedSignature, setRequestedSignature] = useState<string | null>(
    null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const hasCurrentAiResult = aiResult?.signature === signature;
  const hasRequestedCurrentCycle = requestedSignature === signature;
  const showAnalysis =
    hasCurrentAiResult || (hasRequestedCurrentCycle && aiUnavailable);
  const advice = hasCurrentAiResult
    ? aiResult.advice
    : analysis.fallbackAdvice;

  const generateAnalysis = async () => {
    setRequestedSignature(signature);
    setIsGenerating(true);
    setAiUnavailable(false);

    try {
      const response = await fetch("/api/historical-cycle-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseline: analysis.baseline }),
      });
      const json = await response.json();

      if (!response.ok || !json.advice) {
        throw new Error("AI historical analysis is unavailable");
      }

      setAiResult({ signature, advice: json.advice });
    } catch {
      setAiUnavailable(true);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-purple-50 to-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-950">
                AI Historical Cycle Analysis
              </h3>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStyle[analysis.baseline.riskLevel]}`}
              >
                {analysis.baseline.riskLevel} retrospective risk
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Production and environmental lessons from {cycle.label} for
              improving the next production cycle.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <button
              type="button"
              onClick={generateAnalysis}
              disabled={isGenerating}
              className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
            >
              {isGenerating
                ? "Analysing Historical Cycle…"
                : hasCurrentAiResult
                  ? "Refresh Historical Analysis"
                  : "Generate Historical Analysis"}
            </button>
            <span className="text-right text-xs text-slate-500">
              {hasCurrentAiResult
                ? "AI-assisted analysis · fixed historical snapshot"
                : hasRequestedCurrentCycle && aiUnavailable
                  ? "Verified rule-based analysis"
                  : "AI runs only on request"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {aiUnavailable && hasRequestedCurrentCycle && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="status"
          >
            AI enhancement is temporarily unavailable. Verified retrospective
            findings from the selected snapshot are shown instead.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {analysis.baseline.metrics.map((metric) => (
            <div
              key={metric.key}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="text-xs text-slate-500">
                Avg {metric.label}
              </div>
              <div className="mt-1 font-semibold text-slate-950">
                {metric.average.toFixed(metric.key === "co2" ? 0 : 2)}{" "}
                {metric.unit}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-slate-500">
                Range {metric.minimum.toFixed(metric.key === "co2" ? 0 : 2)}–
                {metric.maximum.toFixed(metric.key === "co2" ? 0 : 2)}{" "}
                {metric.unit}
              </div>
              <div
                className={`mt-2 text-xs font-medium ${
                  metric.exceedanceCount > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
                }`}
              >
                {metric.exceedanceCount > 0
                  ? `${metric.exceedanceCount} outside limit (${metric.exceedancePercent.toFixed(1)}%)`
                  : "No exceedance"}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>
            {analysis.baseline.readingsWithIssue} of {analysis.baseline.records}{" "}
            readings were outside at least one review limit.
          </span>
          <span className="font-medium text-slate-800">
            {analysis.baseline.completeness.toFixed(1)}% expected sensor coverage
          </span>
        </div>

        {isGenerating ? (
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-5 text-sm text-violet-700">
            Reviewing the selected historical snapshot and threshold patterns…
          </div>
        ) : showAnalysis ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold text-slate-950">
                Historical Summary
              </h4>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {advice.summary}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <h4 className="mb-2 font-semibold text-slate-950">
                  Key Environmental Findings
                </h4>
                <div className="space-y-2">
                  {advice.keyFindings.map((finding, index) => (
                    <div
                      key={`${finding.title}-${index}`}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="font-medium text-slate-900">
                        {finding.title}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {finding.evidence}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        What it means: {finding.meaning}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-semibold text-slate-950">
                  Actions for the Next Cycle
                </h4>
                <div className="space-y-2">
                  {advice.nextCycleActions.map((item, index) => (
                    <div
                      key={`${item.timeframe}-${item.action}-${index}`}
                      className="grid grid-cols-[32px_1fr] gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                        {index + 1}
                      </div>
                      <div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          {item.timeframe}
                        </span>
                        <div className="mt-2 font-medium text-slate-900">
                          {item.action}
                        </div>
                        <div className="mt-1 text-sm leading-5 text-slate-600">
                          {item.reason}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Monitor in the next cycle
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {advice.monitoringFocus.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-5 py-6 text-center">
            <h4 className="font-semibold text-slate-900">
              Historical AI analysis has not been generated
            </h4>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              The fixed sensor statistics above are available immediately.
              Click Generate Historical Analysis to obtain environmental
              findings and lessons for the next cycle.
            </p>
          </div>
        )}

        <p className="text-xs leading-5 text-slate-500">
          This analysis uses the stored sensor, mortality, feed, water, and
          body-weight records for {cycle.id}. It does not infer disease or any
          farm outcome that is not stored in the selected historical snapshot.
        </p>
      </div>
    </div>
  );
}
