"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createFocusedHistoricalAdvice,
  createHistoricalCycleAnalysis,
  getHistoricalAnalysisQuestion,
  HISTORICAL_ANALYSIS_QUESTIONS,
  type HistoricalAnalysisRisk,
  type HistoricalAnalysisQuestionId,
  type HistoricalCycleAdvice,
} from "../lib/historicalCycleAnalysis";
import type { HistoricalCycle } from "../lib/historicalCycles";
import type { HistoricalCycleReportAnalysisSnapshot } from "../lib/reportAnalysis";

const riskStyle: Record<HistoricalAnalysisRisk, string> = {
  Low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Moderate: "border-amber-200 bg-amber-50 text-amber-700",
  High: "border-red-200 bg-red-50 text-red-700",
};

export default function HistoricalCycleAiAnalysis({
  cycle,
  onReportAnalysisChange,
}: {
  cycle: HistoricalCycle;
  onReportAnalysisChange?: (
    snapshot: HistoricalCycleReportAnalysisSnapshot
  ) => void;
}) {
  const hasSensorData = cycle.data.length > 0;
  const analysis = useMemo(
    () => createHistoricalCycleAnalysis(cycle),
    [cycle]
  );
  const signature = JSON.stringify(analysis.baseline);
  const [selectedQuestionId, setSelectedQuestionId] =
    useState<HistoricalAnalysisQuestionId>("overall");
  const selectedQuestion = getHistoricalAnalysisQuestion(selectedQuestionId);
  const requestKey = `${signature}:${selectedQuestionId}`;
  const [analysisResults, setAnalysisResults] = useState<
    Record<
      string,
      {
        advice: HistoricalCycleAdvice;
        source: "ai" | "fallback";
        generatedAt: string;
        model?: string;
      }
    >
  >({});
  const [isGenerating, setIsGenerating] = useState(false);
  const currentResult = analysisResults[requestKey];
  const fallbackAdvice = useMemo(
    () => createFocusedHistoricalAdvice(analysis, selectedQuestionId),
    [analysis, selectedQuestionId]
  );
  const showAnalysis = Boolean(currentResult);
  const advice = currentResult?.advice ?? fallbackAdvice;
  const reportAnalysis = useMemo<HistoricalCycleReportAnalysisSnapshot>(
    () => ({
      cycleId: cycle.id,
      questionId: selectedQuestionId,
      questionLabel: selectedQuestion.label,
      source: currentResult?.source ?? "local",
      generatedAt: currentResult?.generatedAt,
      model: currentResult?.model,
      riskLevel: analysis.baseline.riskLevel,
      advice,
    }),
    [
      advice,
      analysis.baseline.riskLevel,
      currentResult?.generatedAt,
      currentResult?.model,
      currentResult?.source,
      cycle.id,
      selectedQuestion.label,
      selectedQuestionId,
    ]
  );

  useEffect(() => {
    onReportAnalysisChange?.(reportAnalysis);
  }, [onReportAnalysisChange, reportAnalysis]);

  const generateAnalysis = async () => {
    const generatedQuestionId = selectedQuestionId;
    const generatedRequestKey = requestKey;
    const generatedFallback = createFocusedHistoricalAdvice(
      analysis,
      generatedQuestionId
    );
    setIsGenerating(true);

    try {
      const response = await fetch("/api/historical-cycle-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseline: analysis.baseline,
          questionId: generatedQuestionId,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.advice) {
        throw new Error("AI historical analysis is unavailable");
      }

      setAnalysisResults((current) => ({
        ...current,
        [generatedRequestKey]: {
          advice: json.advice,
          source: "ai",
          generatedAt: new Date().toISOString(),
          model: typeof json.model === "string" ? json.model : undefined,
        },
      }));
    } catch {
      setAnalysisResults((current) => ({
        ...current,
        [generatedRequestKey]: {
          advice: generatedFallback,
          source: "fallback",
          generatedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-purple-50 to-white p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-950">
              AI Historical Cycle Analysis
            </h3>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStyle[analysis.baseline.riskLevel]}`}
            >
              {analysis.baseline.riskLevel} cycle review risk
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Ask a focused question about {cycle.label} to turn its completed
            records into lessons for the next production cycle.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label
              htmlFor="historical-analysis-question"
              className="text-sm font-semibold text-slate-900"
            >
              Choose an analysis question
            </label>
            <select
              id="historical-analysis-question"
              aria-label="Historical analysis question"
              value={selectedQuestionId}
              onChange={(event) =>
                setSelectedQuestionId(
                  event.target.value as HistoricalAnalysisQuestionId
                )
              }
              disabled={isGenerating}
              className="mt-2 w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {HISTORICAL_ANALYSIS_QUESTIONS.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              {selectedQuestion.description}
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
                ? "Analysing Selected Question…"
                : currentResult
                  ? "Refresh Selected Analysis"
                  : "Analyse Selected Question"}
            </button>
            <span className="text-right text-xs text-slate-500">
              {currentResult?.source === "ai"
                ? "AI-assisted analysis · fixed historical snapshot"
                : currentResult?.source === "fallback"
                  ? "Evidence-checked analysis · fixed historical snapshot"
                  : "AI runs only on request"}
            </span>
          </div>
        </div>

        {currentResult?.source === "fallback" && (
          <div
            className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800"
            role="status"
          >
            This answer passed the dashboard&apos;s evidence checks and uses
            only the selected completed-cycle snapshot.
          </div>
        )}

        {hasSensorData ? (
          <>
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
                {analysis.baseline.sensorAlertEpisodes} sensor alert episodes · {analysis.baseline.readingsWithIssue} of {analysis.baseline.records}{" "}
                raw readings were at or above at least one review limit.
              </span>
              <span className="font-medium text-slate-800">
                {analysis.baseline.completeness.toFixed(1)}% expected sensor coverage
              </span>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-3 text-sm text-violet-800">
            Environmental sensor readings were not included in the source
            summary. This analysis is limited to the available production KPIs.
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <div className="font-semibold text-slate-900">Why this cycle risk?</div>
          <p className="mt-1">{analysis.baseline.riskDrivers.length > 0 ? analysis.baseline.riskDrivers.join(" · ") : "No configured production or sensor review driver was detected."}</p>
          <p className="mt-1 text-xs text-slate-500">The same review rules apply to replay and completed cycles. Risk includes production outcomes and sensor history; the sensor graphs show the environmental part.</p>
        </div>

        {isGenerating ? (
          <div className="rounded-xl border border-violet-100 bg-violet-50 p-5 text-sm text-violet-700">
            Reviewing the selected historical snapshot and threshold patterns…
          </div>
        ) : showAnalysis ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                Focused question
              </div>
              <h4 className="mt-1 font-semibold text-slate-950">
                {selectedQuestion.label}
              </h4>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-semibold text-slate-950">
                Focused Answer
              </h4>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {advice.summary}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <h4 className="mb-2 font-semibold text-slate-950">
                  Evidence and Interpretation
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
              Select a question to explore this completed cycle
            </h4>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {hasSensorData
                ? "The fixed sensor statistics above are available immediately. "
                : "The source production statistics are available immediately. "}
              Choose a question and click Analyse Selected Question for a
              focused explanation, evidence, and next-cycle actions.
            </p>
          </div>
        )}

        <p className="text-xs leading-5 text-slate-500">
          This analysis uses the stored {hasSensorData ? "sensor, " : ""}
          mortality and body-weight records for {cycle.id}
          {analysis.baseline.production.availability.feedWater
            ? ", including the available feed and water records"
            : typeof cycle.production.reportedFcr === "number"
              ? `; daily feed and water records were not included, while the source summary reports FCR ${cycle.production.reportedFcr.toFixed(2)}`
              : "; feed, water, and FCR were not included in the source workbook"}
          . It does not infer disease or any farm outcome that is not stored in
          the selected historical snapshot.
        </p>
      </div>
    </div>
  );
}
