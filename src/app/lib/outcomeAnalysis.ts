import { SENSOR_ALERT_RULES, isSensorAtOrAboveLimit } from "./alertRules";
import type { HarvestSummary } from "./cycleAnalytics";
import type { HistoricalCycle } from "./historicalCycles";
import type { DataPoint, ProductionCycle, SensorMetric, Zone } from "./types";

const SENSOR_METRICS: SensorMetric[] = [
  "temp",
  "humidity",
  "co2",
  "nh3",
  "pm25",
];

export type OutcomeSensorMetric = {
  key: SensorMetric;
  label: string;
  unit: string;
  average: number;
  maximum: number;
  reviewLimit: number;
  exceedanceCount: number;
  exceedancePercent: number;
};

export type OutcomeComparisonMetric = {
  label: string;
  currentValue: string;
  previousValue: string;
  change: string;
  direction: "better" | "weaker" | "similar";
};

export type FarmerOutcomeAdvice = {
  summary: string;
  whatHappened: string[];
  whyItMatters: string[];
  monitoringFocus: string[];
  suggestedActions: Array<{
    action: string;
    reason: string;
  }>;
};

export type CycleOutcomeAnalysis = {
  signature: string;
  cycleId: string;
  zone: Zone;
  batch?: number;
  currentDay: number;
  targetDay: number;
  progressPercent: number;
  isFinal: boolean;
  initialBirds: number;
  survivingBirds: number;
  survivalRate: number;
  totalMortality: number;
  mortalityRate: number;
  averageWeightKg: number;
  cumulativeFcr: number;
  alertCount: number;
  sensorRecords: number;
  readingsWithinLimitsPercent: number;
  sensorMetrics: OutcomeSensorMetric[];
  efficiencyIndex?: number;
  finalComparison?: {
    previousBatch: number;
    metrics: OutcomeComparisonMetric[];
  };
  localAdvice: FarmerOutcomeAdvice;
};

export type HistoricalOutcomeRow = {
  batch: number;
  mortalityRate: number;
  fcr: number;
  averageWeightKg: number;
  efficiencyIndex: number;
  profitRmPerBird: number;
  interpretation: string;
};

function formatSigned(value: number, decimals: number, suffix = "") {
  const normalized = Math.abs(value) < 10 ** -(decimals + 1) ? 0 : value;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(decimals)}${suffix}`;
}

function compareMetric({
  label,
  current,
  previous,
  decimals,
  suffix = "",
  lowerIsBetter,
}: {
  label: string;
  current: number;
  previous: number;
  decimals: number;
  suffix?: string;
  lowerIsBetter: boolean;
}): OutcomeComparisonMetric {
  const difference = current - previous;
  const tolerance = 10 ** -decimals / 2;
  const direction =
    Math.abs(difference) <= tolerance
      ? "similar"
      : lowerIsBetter
        ? difference < 0
          ? "better"
          : "weaker"
        : difference > 0
          ? "better"
          : "weaker";

  return {
    label,
    currentValue: `${current.toFixed(decimals)}${suffix}`,
    previousValue: `${previous.toFixed(decimals)}${suffix}`,
    change: formatSigned(difference, decimals, suffix),
    direction,
  };
}

function createSensorMetrics(sensorData: DataPoint[]): OutcomeSensorMetric[] {
  return SENSOR_METRICS.map((key) => {
    const rule = SENSOR_ALERT_RULES[key];
    const values = sensorData.map((point) => point[key]);
    const exceedanceCount = values.filter(
      (value) => isSensorAtOrAboveLimit(key, value)
    ).length;

    return {
      key,
      label: rule.label,
      unit: rule.unit,
      average:
        values.length > 0
          ? values.reduce((total, value) => total + value, 0) / values.length
          : 0,
      maximum: values.length > 0 ? Math.max(...values) : 0,
      reviewLimit: rule.threshold,
      exceedanceCount,
      exceedancePercent: values.length
        ? (exceedanceCount / values.length) * 100
        : 0,
    };
  });
}

function buildLocalAdvice(
  analysis: Omit<CycleOutcomeAnalysis, "signature" | "localAdvice">
): FarmerOutcomeAdvice {
  const affectedMetrics = analysis.sensorMetrics.filter(
    (metric) => metric.exceedanceCount > 0
  );
  const stage = analysis.isFinal
    ? "The completed cycle outcome"
    : `The recorded outcome through Day ${analysis.currentDay}`;
  const whatHappened = [
    `${analysis.survivingBirds.toLocaleString()} of ${analysis.initialBirds.toLocaleString()} birds remain in the recorded population (${analysis.survivalRate.toFixed(2)}% survival).`,
    analysis.averageWeightKg > 0
      ? `The latest recorded average body weight is ${analysis.averageWeightKg.toFixed(2)} kg per bird, with cumulative FCR ${analysis.cumulativeFcr.toFixed(2)}.`
      : "A body-weight reading has not yet been recorded at this replay position.",
    affectedMetrics.length > 0
      ? `${affectedMetrics.map((metric) => metric.label).join(", ")} crossed a configured review limit in the displayed period.`
      : analysis.sensorRecords > 0
        ? "All displayed environmental readings remain below the configured review limits."
        : "Environmental readings are not available for this displayed period.",
  ];

  const whyItMatters = [
    "Mortality, growth, feed use, and environmental conditions should be read together; one value alone does not establish the cause of an outcome.",
    analysis.isFinal
      ? "Final production indicators can now be compared with earlier completed batches."
      : "These values are cumulative to the selected replay day and can still change as the timeline advances.",
  ];

  if (analysis.finalComparison) {
    const improved = analysis.finalComparison.metrics
      .filter((metric) => metric.direction === "better")
      .map((metric) => metric.label.toLowerCase());
    const weaker = analysis.finalComparison.metrics
      .filter((metric) => metric.direction === "weaker")
      .map((metric) => metric.label.toLowerCase());
    whyItMatters.push(
      `Compared with Batch ${analysis.finalComparison.previousBatch}, ${improved.length ? `${improved.join(" and ")} improved` : "no listed indicator improved"}${weaker.length ? `, while ${weaker.join(" and ")} weakened` : ""}.`
    );
  }

  const monitoringFocus = [
    "Daily mortality pattern",
    "Feed and water availability",
    "Body-weight sampling consistency",
    ...affectedMetrics.map((metric) => metric.label),
  ].filter((item, index, values) => values.indexOf(item) === index);

  const suggestedActions: FarmerOutcomeAdvice["suggestedActions"] = [
    {
      action: "Check the daily records against physical flock observations.",
      reason:
        "The dashboard describes the recorded pattern, while bird behaviour, litter condition, feed lines, and water lines confirm what is happening in the house.",
    },
  ];

  if (affectedMetrics.length > 0) {
    suggestedActions.push({
      action: `Review ${affectedMetrics.map((metric) => metric.label.toLowerCase()).join(", ")} periods against ventilation and litter checks.`,
      reason:
        "This links limit crossings to operational evidence without assuming that the sensor pattern caused the production result.",
    });
  } else {
    suggestedActions.push({
      action: "Keep the current environmental inspection routine and watch for sustained changes.",
      reason:
        "No configured environmental review limit was crossed in the displayed replay period.",
    });
  }

  suggestedActions.push(
    analysis.isFinal
      ? {
          action: "Use the completed comparison to set the next-cycle monitoring priorities.",
          reason:
            "The final outcome shows which indicators improved and which still need follow-up against the previous batch.",
        }
      : {
          action: "Move the replay seeker forward before making a final cycle conclusion.",
          reason:
            "Efficiency index and final batch comparison remain unavailable until the cycle reaches its completed record.",
        }
  );

  return {
    summary: `${stage} shows ${analysis.mortalityRate.toFixed(2)}% cumulative mortality and ${analysis.survivalRate.toFixed(2)}% survival${analysis.averageWeightKg > 0 ? `, with the latest recorded weight at ${analysis.averageWeightKg.toFixed(2)} kg per bird` : ""}.`,
    whatHappened,
    whyItMatters,
    monitoringFocus: monitoringFocus.slice(0, 6),
    suggestedActions,
  };
}

export function createCycleOutcomeAnalysis({
  cycle,
  summary,
  sensorData,
  replayDay,
  sourceCycle,
  historicalCycles,
}: {
  cycle: ProductionCycle;
  summary: HarvestSummary;
  sensorData: DataPoint[];
  replayDay?: number;
  sourceCycle?: HistoricalCycle;
  historicalCycles: HistoricalCycle[];
}): CycleOutcomeAnalysis {
  const currentDay = Math.max(1, replayDay ?? summary.cycleDay);
  const targetDay = Math.max(1, cycle.targetHarvestDay);
  const sourceSummary = sourceCycle?.production.sourceSummary;
  const isFinal = cycle.status === "completed" || currentDay >= targetDay;
  const sensorMetrics = createSensorMetrics(sensorData);
  const readingsWithIssue = sensorData.filter((point) =>
    SENSOR_METRICS.some(
      (metric) => isSensorAtOrAboveLimit(metric, point[metric])
    )
  ).length;
  const previousCycle = sourceSummary
    ? historicalCycles
        .filter(
          (candidate) =>
            candidate.production.sourceSummary &&
            candidate.production.sourceSummary.batch < sourceSummary.batch
        )
        .sort(
          (left, right) =>
            (right.production.sourceSummary?.batch ?? 0) -
            (left.production.sourceSummary?.batch ?? 0)
        )[0]
    : undefined;
  const previousSummary = previousCycle?.production.sourceSummary;
  const finalComparison =
    isFinal && sourceSummary && previousSummary
      ? {
          previousBatch: previousSummary.batch,
          metrics: [
            compareMetric({
              label: "Mortality",
              current: sourceSummary.mortalityRatePercent,
              previous: previousSummary.mortalityRatePercent,
              decimals: 2,
              suffix: "%",
              lowerIsBetter: true,
            }),
            compareMetric({
              label: "FCR",
              current: sourceSummary.fcr,
              previous: previousSummary.fcr,
              decimals: 2,
              lowerIsBetter: true,
            }),
            compareMetric({
              label: "Average weight",
              current: sourceSummary.averageWeightKg,
              previous: previousSummary.averageWeightKg,
              decimals: 2,
              suffix: " kg",
              lowerIsBetter: false,
            }),
            compareMetric({
              label: "Efficiency index",
              current: sourceSummary.efficiencyIndex,
              previous: previousSummary.efficiencyIndex,
              decimals: 2,
              lowerIsBetter: false,
            }),
          ],
        }
      : undefined;

  const base = {
    cycleId: cycle.id,
    zone: cycle.zone,
    batch: sourceSummary?.batch,
    currentDay,
    targetDay,
    progressPercent: Math.min(100, (currentDay / targetDay) * 100),
    isFinal,
    initialBirds: cycle.initialBirds,
    survivingBirds: summary.survivingBirds,
    survivalRate: cycle.initialBirds
      ? (summary.survivingBirds / cycle.initialBirds) * 100
      : 0,
    totalMortality: summary.totalMortality,
    mortalityRate: summary.mortalityRate,
    averageWeightKg:
      isFinal && sourceSummary
        ? sourceSummary.averageWeightKg
        : summary.finalAverageWeightKg,
    cumulativeFcr:
      isFinal && sourceSummary ? sourceSummary.fcr : summary.fcr,
    alertCount: summary.alertCount,
    sensorRecords: sensorData.length,
    readingsWithinLimitsPercent: sensorData.length
      ? ((sensorData.length - readingsWithIssue) / sensorData.length) * 100
      : 0,
    sensorMetrics,
    efficiencyIndex:
      isFinal && sourceSummary ? sourceSummary.efficiencyIndex : undefined,
    finalComparison,
  } satisfies Omit<CycleOutcomeAnalysis, "signature" | "localAdvice">;

  return {
    ...base,
    signature: JSON.stringify(base),
    localAdvice: buildLocalAdvice(base),
  };
}

export function createHistoricalOutcomeRows(
  cycles: HistoricalCycle[]
): HistoricalOutcomeRow[] {
  const completed = cycles
    .filter((cycle) => Boolean(cycle.production.sourceSummary))
    .sort(
      (left, right) =>
        (left.production.sourceSummary?.batch ?? 0) -
        (right.production.sourceSummary?.batch ?? 0)
    );

  return completed.map((cycle, index) => {
    const summary = cycle.production.sourceSummary!;
    const previous = completed[index - 1]?.production.sourceSummary;
    let interpretation = "Starting point for the displayed batch comparison.";

    if (previous) {
      const better: string[] = [];
      const weaker: string[] = [];
      if (summary.mortalityRatePercent < previous.mortalityRatePercent)
        better.push("mortality");
      else if (summary.mortalityRatePercent > previous.mortalityRatePercent)
        weaker.push("mortality");
      if (summary.fcr < previous.fcr) better.push("FCR");
      else if (summary.fcr > previous.fcr) weaker.push("FCR");
      if (summary.averageWeightKg > previous.averageWeightKg)
        better.push("weight");
      else if (summary.averageWeightKg < previous.averageWeightKg)
        weaker.push("weight");
      if (summary.efficiencyIndex > previous.efficiencyIndex)
        better.push("efficiency index");
      else if (summary.efficiencyIndex < previous.efficiencyIndex)
        weaker.push("efficiency index");
      if (summary.profitRmPerBird > previous.profitRmPerBird)
        better.push("profit per bird");
      else if (summary.profitRmPerBird < previous.profitRmPerBird)
        weaker.push("profit per bird");

      interpretation = `${better.length ? `${better.join(", ")} improved` : "No listed indicator improved"}${weaker.length ? `; ${weaker.join(", ")} weakened` : ""} versus Batch ${previous.batch}.`;
    }

    return {
      batch: summary.batch,
      mortalityRate: summary.mortalityRatePercent,
      fcr: summary.fcr,
      averageWeightKg: summary.averageWeightKg,
      efficiencyIndex: summary.efficiencyIndex,
      profitRmPerBird: summary.profitRmPerBird,
      interpretation,
    };
  });
}
