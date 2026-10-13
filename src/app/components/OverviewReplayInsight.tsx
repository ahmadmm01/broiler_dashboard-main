"use client";

import { useState } from "react";
import type { HarvestSummary } from "../lib/cycleAnalytics";
import { SENSOR_ALERT_RULES } from "../lib/alertRules";
import type {
  DataPoint,
  ProductionCycle,
  SensorMetric,
} from "../lib/types";

const METRICS: SensorMetric[] = ["temp", "humidity", "co2", "nh3", "pm25"];

type GeneratedInsight = {
  insight: string;
  replayTimestamp: string;
  cycleDay: number;
  zoneLabel: string;
  generatedAt: string;
  signature: string;
};

type InsightSection = {
  title: string;
  paragraphs: string[];
  bullets: string[];
};

function cleanInsightText(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function parseInsightSections(insight: string): InsightSection[] {
  const sections: InsightSection[] = [];
  let current: InsightSection | null = null;
  const flush = () => {
    if (current && (current.paragraphs.length || current.bullets.length)) {
      sections.push(current);
    }
  };

  insight.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    const boldHeadingMatch = line.match(/^\*\*([^*]+)\*\*:?$/);
    const plainHeadingMatch = line.match(
      /^(Situation|Evidence|Recommended checks|Recommended actions|Operational checks):?$/i
    );
    const heading = headingMatch?.[1] ?? boldHeadingMatch?.[1] ?? plainHeadingMatch?.[1];

    if (heading) {
      const cleanedHeading = cleanInsightText(heading);
      if (/monitoring insight/i.test(cleanedHeading)) return;
      flush();
      current = {
        title: cleanedHeading,
        paragraphs: [],
        bullets: [],
      };
      return;
    }

    if (!current) {
      current = { title: "Situation", paragraphs: [], bullets: [] };
    }
    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      current.bullets.push(cleanInsightText(bulletMatch[1]));
    } else {
      current.paragraphs.push(cleanInsightText(line));
    }
  });
  flush();

  return sections.length
    ? sections
    : [{ title: "Analysis", paragraphs: [cleanInsightText(insight)], bullets: [] }];
}

export default function OverviewReplayInsight({
  point,
  recentPoints,
  cycle,
  summary,
  activeAlertCount,
  zoneLabel,
  onGenerateStart,
}: {
  point: DataPoint;
  recentPoints: DataPoint[];
  cycle: ProductionCycle;
  summary: HarvestSummary;
  activeAlertCount: number;
  zoneLabel: string;
  onGenerateStart?: () => void;
}) {
  const [generated, setGenerated] = useState<GeneratedInsight | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentSignature = JSON.stringify({ point, recentPoints, cycleId: cycle.id, zoneLabel, summary, activeAlertCount });
  const isOutdated = Boolean(
    generated && generated.signature !== currentSignature
  );
  const insightSections = generated && !isOutdated
    ? parseInsightSections(generated.insight)
    : [];

  const generateInsight = async () => {
    onGenerateStart?.();
    const snapshotPoint = point;
    const snapshotRecentPoints = recentPoints;
    const snapshotSignature = currentSignature;
    const firstPoint = snapshotRecentPoints[0] ?? snapshotPoint;
    const sensorEvidence = METRICS.map((metric) => {
      const rule = SENSOR_ALERT_RULES[metric];
      const value = snapshotPoint[metric];
      return {
        metric,
        label: rule.label,
        value,
        unit: rule.unit,
        configuredLimit: rule.threshold,
        criticalLimit: rule.criticalThreshold,
        thresholdStatus:
          value > rule.criticalThreshold
            ? "CRITICAL"
            : value >= rule.threshold
              ? "EXCEEDED"
              : "WITHIN LIMIT",
        recentChange: Number((value - firstPoint[metric]).toFixed(2)),
      };
    });
    const context = JSON.stringify(
      {
        dataMode: "HISTORICAL REPLAY - NOT LIVE SENSOR DATA",
        replayTimestamp: snapshotPoint.time,
        replayScope: zoneLabel,
        cycle: {
          id: cycle.id,
          day: summary.cycleDay,
          targetDay: cycle.targetHarvestDay,
          initialBirds: cycle.initialBirds,
          birdsRemaining: summary.survivingBirds,
          mortalityBirds: summary.totalMortality,
          mortalityRatePercent: Number(summary.mortalityRate.toFixed(2)),
          averageWeightKg: Number(summary.finalAverageWeightKg.toFixed(3)),
          cumulativeFeedKgPerBird: Number(
            summary.totalFeedPerBirdKg.toFixed(3)
          ),
          fcr: Number(summary.fcr.toFixed(2)),
        },
        activeAlertCount,
        sensorEvidence,
        recentWindow: {
          records: snapshotRecentPoints.length,
          from: snapshotRecentPoints[0]?.time ?? snapshotPoint.time,
          to: snapshotPoint.time,
        },
      },
      null,
      2
    );

    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          prompt:
            "Create a concise monitoring insight for the operator. Return exactly three sections titled Situation, Evidence, and Recommended checks. Do not add an overall title. Do not use Markdown heading or bold markers. Use short bullet points for Evidence and Recommended checks. Prioritize the most important environmental and production evidence, explain uncertainty, and do not refer to any data that is not supplied. Do not describe the selected historical monitoring snapshot as live data, and focus on its conditions without repeating playback-mode labels.",
        }),
      });
      const payload = (await response.json()) as {
        insight?: string;
        model?: string;
        error?: string;
      };
      if (!response.ok || !payload.insight) {
        throw new Error(payload.error ?? "The AI service did not return an insight");
      }

      setGenerated({
        insight: payload.insight,
        replayTimestamp: snapshotPoint.time,
        cycleDay: summary.cycleDay,
        zoneLabel,
        generatedAt: new Date().toISOString(),
        signature: snapshotSignature,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to generate the AI insight"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="w-full overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-lg shadow-violet-100/60">
      <div className="flex flex-col gap-4 border-b border-violet-100 bg-gradient-to-r from-violet-100 via-indigo-50 to-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-slate-950">
              AI Monitoring Insight
            </h2>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Generate an on-demand interpretation of the sensor, alert, and
            production snapshot at the selected monitoring timestamp. Nothing is
            generated automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={generateInsight}
          disabled={isGenerating}
          className="min-w-52 whitespace-nowrap rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-wait disabled:bg-violet-300"
        >
          {isGenerating
            ? "Generating AI Insight…"
            : generated
              ? "Refresh AI Insight"
              : "Generate AI Insight"}
        </button>
      </div>

      <div className="p-5">
        {error && (
          <div
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            AI insight could not be generated: {error}. Verify the server-side
            AI configuration and quota, then try again.
          </div>
        )}

        {generated && !isOutdated ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-semibold text-violet-700">
                Generated for {generated.zoneLabel} · Day {generated.cycleDay}
                {" · "}{generated.replayTimestamp}
              </span>
              <span>
                Generated {new Date(generated.generatedAt).toLocaleString("en-GB")}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {insightSections.map((section, index) => (
                <article
                  key={`${section.title}-${index}`}
                  className={`rounded-xl border p-5 ${
                    index === 0
                      ? "border-violet-200 bg-violet-50/60 lg:col-span-2"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <h3 className="font-semibold text-slate-950">
                    {section.title}
                  </h3>
                  <div className="mt-3 space-y-2 text-justify text-sm leading-6 text-slate-700">
                    {section.paragraphs.map((paragraph, paragraphIndex) => (
                      <p key={`${section.title}-paragraph-${paragraphIndex}`}>
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets.length > 0 && (
                      <ul className="space-y-2 text-left">
                        {section.bullets.map((bullet, bulletIndex) => (
                          <li
                            key={`${section.title}-bullet-${bulletIndex}`}
                            className="grid grid-cols-[8px_1fr] gap-3"
                          >
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-5 py-8 text-center">
            <div className="text-3xl" aria-hidden="true">✦</div>
            <h3 className="mt-2 font-semibold text-slate-950">
              {isOutdated ? "Refresh insight for the selected record" : "No AI insight has been generated"}
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Current snapshot: {zoneLabel}, Day {summary.cycleDay}, {point.time}.
              Click Generate AI Insight when you want this snapshot analyzed.
            </p>
          </div>
        )}

        <p className="mt-4 text-xs leading-5 text-slate-500">
          This is decision support generated from the selected monitoring data. It is
          not a live sensor assessment, disease diagnosis, or medication advice.
        </p>
      </div>
    </section>
  );
}
