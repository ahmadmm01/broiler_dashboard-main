"use client";

import { useMemo, useState } from "react";
import type { HarvestSummary } from "../lib/cycleAnalytics";
import {
  createCurrentCyclePrediction,
  type CyclePredictionAdvice,
  type PredictionRiskLevel,
} from "../lib/cyclePrediction";
import type { DataPoint, ProductionCycle, Zone } from "../lib/types";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const riskStyle: Record<PredictionRiskLevel, string> = {
  Low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Moderate: "border-amber-200 bg-amber-50 text-amber-700",
  High: "border-red-200 bg-red-50 text-red-700",
};

export default function CurrentCyclePrediction({
  cycle,
  summary,
  sensorData,
  zone,
}: {
  cycle: ProductionCycle;
  summary: HarvestSummary;
  sensorData: DataPoint[];
  zone: Zone;
}) {
  const prediction = useMemo(
    () =>
      createCurrentCyclePrediction({
        cycle,
        harvest: summary,
        sensorData,
        zone,
      }),
    [cycle, sensorData, summary, zone]
  );
  const baselineSignature = JSON.stringify(prediction.baseline);
  const [aiResult, setAiResult] = useState<{
    signature: string;
    advice: CyclePredictionAdvice;
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [requestedSignature, setRequestedSignature] = useState<string | null>(
    null
  );

  const hasCurrentAiResult = aiResult?.signature === baselineSignature;
  const hasRequestedAi = requestedSignature === baselineSignature;
  const showRecommendations =
    hasCurrentAiResult || (hasRequestedAi && aiUnavailable);
  const advice = hasCurrentAiResult
    ? aiResult.advice
    : prediction.fallbackAdvice;
  const { baseline } = prediction;

  const generateAiRecommendations = async () => {
    setRequestedSignature(baselineSignature);
    setIsGenerating(true);
    setAiUnavailable(false);

    try {
      const response = await fetch("/api/cycle-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseline }),
      });
      const json = await response.json();

      if (!response.ok || !json.advice) {
        throw new Error("AI prediction enhancement is unavailable");
      }

      setAiResult({ signature: baselineSignature, advice: json.advice });
    } catch {
      setAiUnavailable(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const timingValue =
    baseline.daysRemaining > 0
      ? `${baseline.daysRemaining} days remaining`
      : baseline.currentDay === baseline.targetHarvestDay
        ? `Day ${baseline.targetHarvestDay} reached`
        : `${baseline.currentDay - baseline.targetHarvestDay} days beyond ideal`;

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-blue-50 to-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-slate-950">
                Current Cycle Prediction
              </h2>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStyle[baseline.riskLevel]}`}
              >
                {baseline.riskLevel} operational risk
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Forecast of the configured harvest outcome if the current
              production and environmental trend continues.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-indigo-700">
                {baseline.houseName} · Zone {baseline.zone}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                Cycle {baseline.cycleId}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                Day {baseline.currentDay} of ideal {baseline.targetHarvestDay}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <button
              type="button"
              onClick={generateAiRecommendations}
              disabled={isGenerating}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {isGenerating
                ? "Analysing Current Cycle…"
                : hasCurrentAiResult
                  ? "Refresh AI Recommendations"
                  : "Generate AI Recommendations"}
            </button>
            <span className="text-right text-xs text-slate-500">
              {hasCurrentAiResult
                ? "AI-assisted recommendations · fixed numeric forecast"
                : hasRequestedAi && aiUnavailable
                  ? "Verified rule-based recommendations"
                  : "Forecast ready · AI runs only on request"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {aiUnavailable && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="status"
          >
            AI enhancement is temporarily unavailable. The verified cycle
            forecast and recommendations remain active.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            [
              "Projected avg weight",
              `${baseline.projectedAverageWeightKg.toFixed(3)} kg`,
              `Target ${baseline.targetAverageWeightKg.toFixed(3)} kg`,
            ],
            [
              "Projected birds",
              integer.format(baseline.projectedSurvivingBirds),
              `${baseline.mortalityRate.toFixed(2)}% mortality`,
            ],
            [
              "Projected live weight",
              `${integer.format(baseline.projectedLiveWeightKg)} kg`,
              "If current trend continues",
            ],
            [
              "Harvest timing",
              timingValue,
              `Ideal cycle: ${baseline.targetHarvestDay} days`,
            ],
            [
              "Forecast confidence",
              baseline.confidence,
              `${baseline.sensorCompleteness.toFixed(1)}% sensor completeness`,
            ],
            [
              "Production efficiency",
              `FCR ${baseline.fcr.toFixed(2)}`,
              `${baseline.weightVariancePercent >= 0 ? "+" : ""}${baseline.weightVariancePercent.toFixed(2)}% vs weight standard`,
            ],
          ].map(([label, value, detail]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-1 font-semibold text-slate-950">{value}</div>
              <div className="mt-1 text-[11px] leading-4 text-slate-500">
                {detail}
              </div>
            </div>
          ))}
        </div>

        {isGenerating ? (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-700">
            Reviewing current sensor, production, and harvest forecast data…
          </div>
        ) : showRecommendations ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-semibold text-slate-950">
                  Prediction Summary
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {advice.summary}
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-slate-950">
                  Key Risks to Harvest Outcome
                </h3>
                <div className="space-y-2">
                  {advice.keyRisks.map((risk, index) => (
                    <div
                      key={`${risk.title}-${index}`}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="font-medium text-slate-900">
                        {risk.title}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {risk.evidence}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        Expected impact: {risk.impact}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-950">
                Priority Farmer Actions
              </h3>
              <div className="space-y-2">
                {advice.priorityActions.map((item, index) => (
                  <div
                    key={`${item.timeframe}-${item.action}-${index}`}
                    className="grid grid-cols-[34px_1fr] gap-3 rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
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
        ) : (
          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-5 py-6 text-center">
            <h3 className="font-semibold text-slate-900">
              AI recommendations have not been generated
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              The numeric forecast above is calculated locally from the current
              cycle. Click Generate AI Recommendations when you want additional
              interpretation, risks, and priority farmer actions.
            </p>
          </div>
        )}

        {showRecommendations && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Monitor closely
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
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Based on records through {baseline.latestReading}. This is
              decision support, not a disease diagnosis or medication
              recommendation. Confirm actions through flock inspection, farm
              records, and qualified farm or veterinary personnel where needed.
            </p>
          </div>
        )}

        {!showRecommendations && (
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Numeric forecast based on records through {baseline.latestReading}.
            Confirm the result through flock inspection and verified farm
            records before making harvest decisions.
          </p>
        )}
      </div>
    </section>
  );
}
