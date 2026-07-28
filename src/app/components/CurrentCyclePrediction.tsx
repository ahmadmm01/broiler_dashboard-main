"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HarvestSummary } from "../lib/cycleAnalytics";
import {
  createCurrentCyclePrediction,
  type CyclePredictionAdvice,
  type CyclePredictionBaseline,
  type PredictionRiskLevel,
} from "../lib/cyclePrediction";
import type { CurrentCycleReportAnalysisSnapshot } from "../lib/reportAnalysis";
import type { DataPoint, ProductionCycle, Zone } from "../lib/types";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const riskStyle: Record<PredictionRiskLevel, string> = {
  Low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Moderate: "border-amber-200 bg-amber-50 text-amber-700",
  High: "border-red-200 bg-red-50 text-red-700",
};

const zoneAccent: Record<Zone, string> = {
  A: "#f97316",
  B: "#3b82f6",
  C: "#10b981",
};

const riskRank: Record<PredictionRiskLevel, number> = {
  Low: 0,
  Moderate: 1,
  High: 2,
};

export type CurrentCyclePredictionInput = {
  zone: Zone;
  cycle: ProductionCycle;
  summary: HarvestSummary;
  sensorData: DataPoint[];
};

function combineZoneAdvice(
  predictions: Array<{
    zone: Zone;
    riskLevel: PredictionRiskLevel;
    baseline: CyclePredictionBaseline;
    fallbackAdvice: CyclePredictionAdvice;
  }>,
  overallRisk: PredictionRiskLevel
): CyclePredictionAdvice {
  if (predictions.length === 1) return predictions[0].fallbackAdvice;

  const prioritizedPredictions = [...predictions].sort(
    (left, right) => riskRank[right.riskLevel] - riskRank[left.riskLevel]
  );
  const keyRisks = prioritizedPredictions
    .flatMap(({ zone, fallbackAdvice }) =>
      fallbackAdvice.keyRisks.slice(0, 2).map((risk) => ({
        ...risk,
        title: `Zone ${zone} · ${risk.title}`,
      }))
    )
    .slice(0, 4);
  const priorityActions = prioritizedPredictions
    .flatMap(({ zone, fallbackAdvice }) =>
      fallbackAdvice.priorityActions.slice(0, 2).map((item) => ({
        ...item,
        action: `Zone ${zone}: ${item.action}`,
      }))
    )
    .slice(0, 5);
  const monitoringFocus = prioritizedPredictions
    .flatMap(({ zone, fallbackAdvice }) =>
      fallbackAdvice.monitoringFocus
        .slice(0, 2)
        .map((item) => `Zone ${zone}: ${item}`)
    )
    .slice(0, 5);

  return {
    summary: `The current-cycle comparison covers Zones ${predictions
      .map(({ zone }) => zone)
      .join(", ")}. The highest current cycle risk across the active zones is ${overallRisk.toLowerCase()}. Review each zone condition before applying any house-wide action.`,
    zoneSummaries: predictions.map(({ zone, riskLevel, baseline }) => ({
      zone,
      riskLevel,
      summary: `At cycle day ${baseline.currentDay} of ${baseline.targetHarvestDay}, recorded mortality is ${baseline.mortalityRate.toFixed(2)}% with FCR ${baseline.fcr.toFixed(2)} and ${baseline.sensorCompleteness.toFixed(1)}% sensor completeness. Environmental peaks were ${baseline.sensor.temperaturePeak.toFixed(2)} °C, ${baseline.sensor.co2Peak.toFixed(0)} ppm CO₂, ${baseline.sensor.nh3Peak.toFixed(2)} ppm NH₃, and ${baseline.sensor.pm25Peak.toFixed(2)} µg/m³ PM2.5.`,
    })),
    keyRisks,
    priorityActions,
    monitoringFocus,
  };
}

function formatHarvestTiming(
  currentDay: number,
  targetHarvestDay: number,
  daysRemaining: number
) {
  if (daysRemaining > 0) return `${daysRemaining} days remaining`;
  if (currentDay === targetHarvestDay) return `Day ${targetHarvestDay} reached`;
  return `${currentDay - targetHarvestDay} days beyond ideal`;
}

export default function CurrentCyclePrediction({
  inputs,
  onReportAnalysisChange,
}: {
  inputs: CurrentCyclePredictionInput[];
  onReportAnalysisChange?: (
    snapshot: CurrentCycleReportAnalysisSnapshot
  ) => void;
}) {
  const predictions = useMemo(
    () =>
      inputs.map(({ zone, cycle, summary, sensorData }) => ({
        zone,
        cycle,
        ...createCurrentCyclePrediction({
          cycle,
          harvest: summary,
          sensorData,
          zone,
        }),
      })),
    [inputs]
  );
  const baselines = predictions.map((prediction) => prediction.baseline);
  const isMultiZone = predictions.length > 1;
  const primaryPrediction = predictions[0];
  const overallRisk = predictions.reduce<PredictionRiskLevel>(
    (highest, prediction) =>
      riskRank[prediction.baseline.riskLevel] > riskRank[highest]
        ? prediction.baseline.riskLevel
        : highest,
    "Low"
  );
  const overallRiskDrivers = predictions
    .filter((prediction) => prediction.baseline.riskLevel === overallRisk)
    .flatMap((prediction) =>
      prediction.baseline.riskDrivers.map((driver) =>
        isMultiZone ? `Zone ${prediction.zone}: ${driver}` : driver
      )
    )
    .slice(0, 3);
  const baselineSignature = JSON.stringify(baselines);
  const contextSignature = predictions
    .map(
      ({ zone, cycle: zoneCycle }) =>
        `${zone}:${zoneCycle.id}:${zoneCycle.startDate}`
    )
    .join("|");
  const latestReading = baselines.reduce(
    (latest, baseline) =>
      baseline.latestReading > latest ? baseline.latestReading : latest,
    "-"
  );
  const hasReadyZoneData =
    inputs.length > 0 &&
    inputs.every(
      (input) => input.sensorData.length > 0
    ) &&
    baselines.every((baseline) => baseline.latestReading !== "-");
  const fallbackAdvice = useMemo(
    () =>
      combineZoneAdvice(
        predictions.map(({ zone, baseline, fallbackAdvice }) => ({
          zone,
          riskLevel: baseline.riskLevel,
          baseline,
          fallbackAdvice,
        })),
        overallRisk
      ),
    [overallRisk, predictions]
  );
  const [aiResults, setAiResults] = useState<Record<string, {
    contextSignature: string;
    baselineSignature: string;
    latestReading: string;
    generatedAt: string;
    model?: string;
    advice: CyclePredictionAdvice;
  }>>({});
  const [generatingContext, setGeneratingContext] = useState<string | null>(
    null
  );
  const [unavailableContexts, setUnavailableContexts] = useState<
    Record<string, boolean>
  >({});
  const [requestedContexts, setRequestedContexts] = useState<
    Record<string, boolean>
  >({});
  const autoRequestedContextsRef = useRef(new Set<string>());

  const aiResult = aiResults[contextSignature];
  const isGenerating = generatingContext === contextSignature;
  const aiUnavailable = Boolean(unavailableContexts[contextSignature]);
  const hasCurrentAiResult = Boolean(aiResult);
  const hasRequestedAi = Boolean(requestedContexts[contextSignature]);
  const hasNewSensorData = Boolean(
    hasCurrentAiResult && aiResult?.baselineSignature !== baselineSignature
  );
  const showRecommendations =
    hasCurrentAiResult || (hasRequestedAi && aiUnavailable);
  const advice = hasCurrentAiResult
    ? aiResult!.advice
    : fallbackAdvice;
  const recommendationsDataThrough = hasCurrentAiResult
    ? aiResult!.latestReading
    : latestReading;
  const reportAnalysis = useMemo<CurrentCycleReportAnalysisSnapshot>(
    () => ({
      contextSignature,
      cycleIds: predictions.map(({ cycle }) => cycle.id),
      zones: predictions.map(({ zone }) => zone),
      source: hasCurrentAiResult
        ? "ai"
        : hasRequestedAi && aiUnavailable
          ? "fallback"
          : "local",
      generatedAt: aiResult?.generatedAt,
      dataThrough: recommendationsDataThrough,
      model: aiResult?.model,
      riskLevel: overallRisk,
      stale: hasNewSensorData,
      advice,
    }),
    [
      advice,
      aiResult?.generatedAt,
      aiResult?.model,
      aiUnavailable,
      contextSignature,
      hasCurrentAiResult,
      hasNewSensorData,
      hasRequestedAi,
      overallRisk,
      predictions,
      recommendationsDataThrough,
    ]
  );

  useEffect(() => {
    onReportAnalysisChange?.(reportAnalysis);
  }, [onReportAnalysisChange, reportAnalysis]);

  const generateAiRecommendations = useCallback(async () => {
    setRequestedContexts((current) => ({
      ...current,
      [contextSignature]: true,
    }));
    setGeneratingContext(contextSignature);
    setUnavailableContexts((current) => ({
      ...current,
      [contextSignature]: false,
    }));

    try {
      const response = await fetch("/api/cycle-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isMultiZone ? { baselines } : { baseline: baselines[0] }
        ),
      });
      const json = await response.json();

      if (!response.ok || !json.advice) {
        throw new Error("AI prediction enhancement is unavailable");
      }

      setAiResults((current) => ({
        ...current,
        [contextSignature]: {
          contextSignature,
          baselineSignature,
          latestReading,
          generatedAt: new Date().toISOString(),
          model: typeof json.model === "string" ? json.model : undefined,
          advice: json.advice,
        },
      }));
    } catch {
      setUnavailableContexts((current) => ({
        ...current,
        [contextSignature]: true,
      }));
    } finally {
      setGeneratingContext((current) =>
        current === contextSignature ? null : current
      );
    }
  }, [baselineSignature, baselines, contextSignature, isMultiZone, latestReading]);

  useEffect(() => {
    if (
      !isMultiZone ||
      !hasReadyZoneData ||
      hasRequestedAi ||
      isGenerating ||
      autoRequestedContextsRef.current.has(contextSignature)
    ) {
      return;
    }

    autoRequestedContextsRef.current.add(contextSignature);
    void generateAiRecommendations();
  }, [
    contextSignature,
    generateAiRecommendations,
    hasRequestedAi,
    hasReadyZoneData,
    isGenerating,
    isMultiZone,
  ]);

  if (!primaryPrediction) return null;
  const { baseline } = primaryPrediction;
  const timingValue = formatHarvestTiming(
    baseline.currentDay,
    baseline.targetHarvestDay,
    baseline.daysRemaining
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-blue-50 to-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-slate-950">
                {isMultiZone
                  ? "Current Cycle AI Zone Summary"
                  : "Current Cycle Prediction"}
              </h2>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  hasReadyZoneData
                    ? riskStyle[overallRisk]
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {hasReadyZoneData
                  ? `${isMultiZone ? "Highest cycle risk: " : "Cycle risk: "}${overallRisk}`
                  : "Cycle risk: Calculating"}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {isMultiZone
                ? "Automatic current-condition summary for every active zone. Forecasting is available after selecting one zone."
                : "Forecast of the configured harvest outcome if the current production and environmental trend continues."}
            </p>
            <p className="mt-2 max-w-4xl text-xs text-slate-500">
              <span className="font-semibold text-slate-700">
                Cycle-risk drivers:
              </span>{" "}
              {!hasReadyZoneData
                ? "Waiting for the current-cycle sensor snapshot"
                : overallRiskDrivers.length > 0
                ? overallRiskDrivers.join(" · ")
                : "No major configured risk driver detected"}
              . Active sensor alerts are reported separately in the toolbar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-indigo-700">
                {baseline.houseName} · {isMultiZone
                  ? `All Zones (${predictions.map(({ zone }) => zone).join(", ")})`
                  : `Zone ${baseline.zone}`}
              </span>
              {predictions.map(({ zone, baseline: zoneBaseline }) => (
                <span
                  key={zone}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600"
                >
                  {isMultiZone ? `Zone ${zone} · ` : ""}
                  {zoneBaseline.cycleId} · Day {zoneBaseline.currentDay}/
                  {zoneBaseline.targetHarvestDay}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <button
              type="button"
              onClick={generateAiRecommendations}
              disabled={isGenerating || (isMultiZone && !hasReadyZoneData)}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {isGenerating
                ? isMultiZone
                  ? "Summarising All Zones…"
                  : "Analysing Current Cycle…"
                : isMultiZone
                  ? "Regenerate AI Summary"
                  : hasCurrentAiResult
                  ? "Refresh AI Recommendations"
                  : "Generate AI Recommendations"}
            </button>
            <span className="text-right text-xs text-slate-500">
              {hasCurrentAiResult
                ? hasNewSensorData
                  ? isMultiZone
                    ? "New sensor data available · summary preserved"
                    : "New sensor data available · result preserved"
                  : isMultiZone
                    ? "AI current-condition summary · fixed snapshot"
                    : "AI-assisted recommendations · fixed numeric forecast"
                : hasRequestedAi && aiUnavailable
                  ? isMultiZone
                    ? "Verified rule-based zone summary"
                    : "Verified rule-based recommendations"
                  : isMultiZone
                    ? hasReadyZoneData
                      ? "AI summary starts automatically"
                      : "Waiting for complete zone data"
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
            AI enhancement is temporarily unavailable. The verified {isMultiZone
              ? "current-condition zone summary"
              : "cycle forecast and recommendations"} remains active.
          </div>
        )}

        {hasNewSensorData && (
          <div
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
            role="status"
          >
            New sensor readings have arrived. The generated AI {isMultiZone
              ? "zone summary"
              : "recommendations"} remains visible and reflects records through {recommendationsDataThrough}.
            {isMultiZone ? " Regenerate" : " Refresh"} when you want the latest readings included.
          </div>
        )}

        {isMultiZone ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {predictions.map(({ zone, baseline: zoneBaseline }) => (
              <article
                key={zone}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                style={{ borderTopColor: zoneAccent[zone], borderTopWidth: 4 }}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: zoneAccent[zone] }}
                    />
                    <h3 className="font-semibold text-slate-950">Zone {zone}</h3>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${riskStyle[zoneBaseline.riskLevel]}`}
                  >
                    Cycle risk: {zoneBaseline.riskLevel}
                  </span>
                </div>
                <div className="mb-3 text-xs text-slate-500">
                  {zoneBaseline.cycleId} · Day {zoneBaseline.currentDay} of {zoneBaseline.targetHarvestDay}
                </div>
                <div className="mb-3 text-xs leading-5 text-slate-600">
                  <span className="font-semibold">Drivers:</span>{" "}
                  {zoneBaseline.riskDrivers.slice(0, 2).join(" · ") ||
                    "No major configured driver"}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {[
                    [
                      "Mortality",
                      `${zoneBaseline.mortalityRate.toFixed(2)}%`,
                    ],
                    [
                      "FCR",
                      zoneBaseline.fcr.toFixed(2),
                    ],
                    [
                      "Avg temperature",
                      `${zoneBaseline.sensor.temperatureAverage.toFixed(2)} °C`,
                    ],
                    [
                      "Peak CO₂",
                      `${zoneBaseline.sensor.co2Peak.toFixed(0)} ppm`,
                    ],
                    [
                      "Peak NH₃",
                      `${zoneBaseline.sensor.nh3Peak.toFixed(2)} ppm`,
                    ],
                    [
                      "Peak PM2.5",
                      `${zoneBaseline.sensor.pm25Peak.toFixed(2)} µg/m³`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="mt-0.5 font-semibold text-slate-900">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                  {zoneBaseline.sensorCompleteness.toFixed(1)}% sensor completeness
                </div>
              </article>
            ))}
          </div>
        ) : (
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
        )}

        {isGenerating ? (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-700">
            {isMultiZone
              ? "Summarising the latest production and environmental condition for Zones A, B, and C…"
              : "Reviewing current sensor, production, and harvest forecast data…"}
          </div>
        ) : showRecommendations ? (
          isMultiZone ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <h3 className="font-semibold text-slate-950">
                  Overall Current Condition
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {advice.summary}
                </p>
              </div>

              <div>
                <h3 className="mb-3 font-semibold text-slate-950">
                  AI Summary by Zone
                </h3>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {(advice.zoneSummaries ?? []).map((item) => (
                    <article
                      key={item.zone}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                      style={{
                        borderTopColor: zoneAccent[item.zone],
                        borderTopWidth: 4,
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-semibold text-slate-950">
                          Zone {item.zone}
                        </h4>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${riskStyle[item.riskLevel]}`}
                        >
                          {item.riskLevel} condition risk
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {item.summary}
                      </p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <div>
                  <h3 className="mb-2 font-semibold text-slate-950">
                    Conditions Requiring Attention
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
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-slate-950">
                    Cross-zone Next Steps
                  </h3>
                  <div className="space-y-2">
                    {advice.priorityActions.map((item, index) => (
                      <div
                        key={`${item.action}-${index}`}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          {item.timeframe}
                        </div>
                        <div className="mt-1 font-medium text-slate-900">
                          {item.action}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {item.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
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
          )
        ) : (
          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 px-5 py-6 text-center">
            <h3 className="font-semibold text-slate-900">
              AI recommendations have not been generated
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {isMultiZone
                ? "The AI current-condition summary starts automatically when All Zones is opened."
                : "The numeric forecast above is calculated locally from the current cycle. Click Generate AI Recommendations when you want additional interpretation, risks, and priority farmer actions."}
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
              Based on records through {recommendationsDataThrough}. This is
              decision support, not a disease diagnosis or medication
              recommendation. Confirm actions through flock inspection, farm
              records, and qualified farm or veterinary personnel where needed.
            </p>
          </div>
        )}

        {!showRecommendations && (
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {isMultiZone
              ? `Current-condition data available through ${latestReading}.`
              : `Numeric forecast based on records through ${latestReading}.`}
            Confirm the result through flock inspection and verified farm
            records before making harvest decisions.
          </p>
        )}
      </div>
    </section>
  );
}
