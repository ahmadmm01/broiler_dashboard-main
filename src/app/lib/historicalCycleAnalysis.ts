import type { HistoricalCycle } from "./historicalCycles";

export type HistoricalAnalysisRisk = "Low" | "Moderate" | "High";

export type HistoricalAnalysisQuestionId =
  | "overall"
  | "mortality"
  | "environment"
  | "growth_efficiency"
  | "sensor_production"
  | "next_cycle";

export type HistoricalAnalysisQuestion = {
  id: HistoricalAnalysisQuestionId;
  label: string;
  description: string;
  guidance: string;
};

export const HISTORICAL_ANALYSIS_QUESTIONS: HistoricalAnalysisQuestion[] = [
  {
    id: "overall",
    label: "What are the main lessons from this cycle?",
    description:
      "Summarise the strongest production and environmental lessons before reviewing individual topics.",
    guidance:
      "Prioritise the most decision-relevant outcomes, explain their evidence, and identify the lessons that should carry into the next cycle.",
  },
  {
    id: "mortality",
    label: "What does the mortality pattern tell us?",
    description:
      "Review the total, peak day, and concentration of mortality across the early, middle, and late cycle.",
    guidance:
      "Analyse mortality timing and phase concentration. Compare it with environmental context without identifying causes or claiming that sensor conditions caused mortality.",
  },
  {
    id: "environment",
    label: "Which environmental conditions need the most attention?",
    description:
      "Identify the dominant temperature, humidity, and air-quality patterns and when they were most pronounced.",
    guidance:
      "Rank environmental issues by frequency and cycle phase, then translate them into ventilation, cooling, litter, and sensor-check lessons.",
  },
  {
    id: "growth_efficiency",
    label: "How effective were growth, feed, water, and FCR?",
    description:
      "Examine final weight, weight development, consumption, water-to-feed balance, and estimated FCR.",
    guidance:
      "Evaluate growth and efficiency only from available fields. Clearly distinguish missing reference weights, avoid inventing targets, and do not recommend feeding, watering, hydration, or nutrition programs.",
  },
  {
    id: "sensor_production",
    label: "How did sensor patterns align with production outcomes?",
    description:
      "Compare environmental conditions with mortality, weight gain, feed, and water patterns by cycle phase.",
    guidance:
      "Discuss time-aligned associations by phase, explicitly state that association is not causation, and recommend what evidence to collect next.",
  },
  {
    id: "next_cycle",
    label: "What should we change for the next cycle?",
    description:
      "Turn completed-cycle findings into a prioritised preparation, early-cycle, and ongoing monitoring plan.",
    guidance:
      "Produce a practical, prioritised improvement plan tied directly to the supplied evidence and measurable checkpoints.",
  },
];

export function isHistoricalAnalysisQuestionId(
  value: unknown
): value is HistoricalAnalysisQuestionId {
  return HISTORICAL_ANALYSIS_QUESTIONS.some(
    (question) => question.id === value
  );
}

export function getHistoricalAnalysisQuestion(
  id: HistoricalAnalysisQuestionId
) {
  return (
    HISTORICAL_ANALYSIS_QUESTIONS.find((question) => question.id === id) ??
    HISTORICAL_ANALYSIS_QUESTIONS[0]
  );
}

export type HistoricalMetricReview = {
  key: "temp" | "humidity" | "co2" | "nh3" | "pm25";
  label: string;
  unit: string;
  average: number;
  minimum: number;
  maximum: number;
  reviewLimit: string;
  exceedanceCount: number;
  exceedancePercent: number;
};

export type HistoricalCyclePhaseReview = {
  key: "early" | "middle" | "late";
  label: string;
  dayRange: string;
  startDay: number;
  endDay: number;
  records: number;
  issueReadingPercent: number;
  metricAverages: Record<HistoricalMetricReview["key"], number>;
  metricExceedancePercent: Record<HistoricalMetricReview["key"], number>;
  mortalityCount: number;
  mortalitySharePercent: number;
  feedPerBirdKg: number | null;
  waterPerBirdL: number | null;
  weightStartKg: number | null;
  weightEndKg: number | null;
  weightGainKg: number | null;
};

export type HistoricalCycleAnalysisBaseline = {
  cycleId: string;
  cycleLabel: string;
  period: string;
  harvestDay: number;
  records: number;
  expectedRecords: number;
  completeness: number;
  readingsWithIssue: number;
  issueReadingPercent: number;
  riskLevel: HistoricalAnalysisRisk;
  metrics: HistoricalMetricReview[];
  cyclePhases: HistoricalCyclePhaseReview[];
  production: {
    availability: {
      feedWater: boolean;
      standardWeight: boolean;
    };
    initialBirds: number;
    totalMortality: number;
    mortalityRate: number;
    firstWeekMortality: number;
    peakDailyMortality: {
      day: number;
      count: number;
    } | null;
    survivingBirds: number;
    totalFeedPerBirdKg: number | null;
    totalWaterPerBirdL: number | null;
    waterFeedRatio: number | null;
    finalAverageWeightKg: number;
    standardFinalWeightKg: number | null;
    weightVariancePercent: number | null;
    estimatedFcr: number | null;
    estimatedLiveWeightKg: number;
    finalAdgGPerDay: number | null;
  };
};

export type HistoricalCycleAdvice = {
  summary: string;
  keyFindings: Array<{
    title: string;
    evidence: string;
    meaning: string;
  }>;
  nextCycleActions: Array<{
    timeframe: string;
    action: string;
    reason: string;
  }>;
  monitoringFocus: string[];
};

export type HistoricalCycleAnalysis = {
  baseline: HistoricalCycleAnalysisBaseline;
  fallbackAdvice: HistoricalCycleAdvice;
};

const round = (value: number, decimals = 2) =>
  Number(value.toFixed(decimals));

export function createHistoricalCycleAnalysis(
  cycle: HistoricalCycle
): HistoricalCycleAnalysis {
  const records = cycle.data.length;
  const intervalMinutes = cycle.dataIntervalMinutes ?? 1;
  const expectedRecords =
    cycle.data.length > 1
      ? Math.max(
          1,
          Math.round(
            (cycle.data.at(-1)!.ts - cycle.data[0].ts) /
              (intervalMinutes * 60 * 1000)
          ) + 1
        )
      : Math.max(
          1,
          Math.round((cycle.harvestDay * 24 * 60) / intervalMinutes)
        );
  const values = {
    temp: cycle.data.map((point) => point.temp),
    humidity: cycle.data.map((point) => point.humidity),
    co2: cycle.data.map((point) => point.co2),
    nh3: cycle.data.map((point) => point.nh3),
    pm25: cycle.data.map((point) => point.pm25),
  };
  const average = (items: number[]) =>
    items.length
      ? items.reduce((total, item) => total + item, 0) / items.length
      : 0;
  const count = (predicate: (index: number) => boolean) =>
    cycle.data.reduce(
      (total, _point, index) => total + Number(predicate(index)),
      0
    );
  const metric = (
    key: HistoricalMetricReview["key"],
    label: string,
    unit: string,
    reviewLimit: string,
    isOutsideLimit: (value: number) => boolean
  ): HistoricalMetricReview => {
    const metricValues = values[key];
    const exceedanceCount = metricValues.filter(isOutsideLimit).length;

    return {
      key,
      label,
      unit,
      average: round(average(metricValues)),
      minimum: round(Math.min(...metricValues)),
      maximum: round(Math.max(...metricValues)),
      reviewLimit,
      exceedanceCount,
      exceedancePercent: records
        ? round((exceedanceCount / records) * 100, 1)
        : 0,
    };
  };

  const metrics: HistoricalMetricReview[] = [
    metric("temp", "Temperature", "°C", "≤ 32 °C", (value) => value > 32),
    metric(
      "humidity",
      "Humidity",
      "%",
      "60–80% review band",
      (value) => value < 60 || value > 80
    ),
    metric("co2", "CO₂", "ppm", "≤ 1,200 ppm", (value) => value > 1200),
    metric("nh3", "NH₃", "ppm", "≤ 5 ppm", (value) => value > 5),
    metric(
      "pm25",
      "PM2.5",
      "µg/m³",
      "≤ 35 µg/m³",
      (value) => value > 35
    ),
  ];

  const isOutsideMetricLimit = (
    key: HistoricalMetricReview["key"],
    value: number
  ) => {
    if (key === "temp") return value > 32;
    if (key === "humidity") return value < 60 || value > 80;
    if (key === "co2") return value > 1200;
    if (key === "nh3") return value > 5;
    return value > 35;
  };
  const metricKeys: HistoricalMetricReview["key"][] = [
    "temp",
    "humidity",
    "co2",
    "nh3",
    "pm25",
  ];
  const readingsWithIssue = count(
    (index) =>
      metricKeys.some((key) =>
        isOutsideMetricLimit(key, values[key][index])
      )
  );
  const issueReadingPercent = records
    ? round((readingsWithIssue / records) * 100, 1)
    : 0;
  const production = cycle.production;
  const totalMortality = production.mortality.reduce(
    (total, item) => total + item.count,
    0
  );
  const survivingBirds = Math.max(
    0,
    production.harvestedBirds ??
      production.initialBirds - totalMortality
  );
  const hasFeedWaterData = production.feedWater.length > 0;
  const totalFeedPerBirdKg = hasFeedWaterData
    ? production.feedWater.reduce(
        (total, item) => total + item.feedKgPerBird,
        0
      )
    : null;
  const totalWaterPerBirdL = hasFeedWaterData
    ? production.feedWater.reduce(
        (total, item) => total + item.waterLPerBird,
        0
      )
    : null;
  const finalWeight = production.weights.at(-1);
  const finalAverageWeightKg = finalWeight?.actualWeightKg ?? 0;
  const standardFinalWeightKg =
    typeof finalWeight?.standardWeightKg === "number" &&
    finalWeight.standardWeightKg > 0
      ? finalWeight.standardWeightKg
      : null;
  const mortalityRate = production.initialBirds
    ? (totalMortality / production.initialBirds) * 100
    : 0;
  const weightVariancePercent = standardFinalWeightKg
    ? ((finalAverageWeightKg - standardFinalWeightKg) /
        standardFinalWeightKg) *
      100
    : null;
  const estimatedFcr =
    totalFeedPerBirdKg !== null && finalAverageWeightKg
      ? totalFeedPerBirdKg / finalAverageWeightKg
      : null;
  const firstWeekMortality = production.mortality
    .filter((item) => item.day <= 7)
    .reduce((total, item) => total + item.count, 0);
  const peakDailyMortality =
    production.mortality.length > 0
      ? production.mortality.reduce((peak, item) =>
          item.count > peak.count ? item : peak
        )
      : null;
  const earlyEndDay = Math.max(1, Math.ceil(cycle.harvestDay / 3));
  const middleEndDay = Math.max(
    earlyEndDay,
    Math.ceil((cycle.harvestDay * 2) / 3)
  );
  const phaseDefinitions = (
    [
      {
        key: "early",
        label: "Early cycle",
        startDay: 1,
        endDay: earlyEndDay,
      },
      {
        key: "middle",
        label: "Middle cycle",
        startDay: earlyEndDay + 1,
        endDay: middleEndDay,
      },
      {
        key: "late",
        label: "Late cycle",
        startDay: middleEndDay + 1,
        endDay: cycle.harvestDay,
      },
    ] satisfies Array<{
      key: HistoricalCyclePhaseReview["key"];
      label: string;
      startDay: number;
      endDay: number;
    }>
  ).filter((phase) => phase.startDay <= phase.endDay);
  const firstReadingTs =
    cycle.data.length > 0
      ? Math.min(...cycle.data.map((point) => point.ts))
      : 0;
  const pointCycleDay = (timestamp: number) =>
    firstReadingTs
      ? Math.floor((timestamp - firstReadingTs) / (24 * 60 * 60 * 1000)) + 1
      : 1;
  const cyclePhases: HistoricalCyclePhaseReview[] = phaseDefinitions.map(
    (phase) => {
      const phaseData = cycle.data.filter((point) => {
        const day = pointCycleDay(point.ts);
        return day >= phase.startDay && day <= phase.endDay;
      });
      const phaseMortality = production.mortality
        .filter(
          (item) => item.day >= phase.startDay && item.day <= phase.endDay
        )
        .reduce((total, item) => total + item.count, 0);
      const phaseFeedWater = production.feedWater.filter(
        (item) => item.day >= phase.startDay && item.day <= phase.endDay
      );
      const phaseWeights = production.weights
        .filter(
          (item) => item.day >= phase.startDay && item.day <= phase.endDay
        )
        .sort((a, b) => a.day - b.day);
      const metricAverage = (key: HistoricalMetricReview["key"]) =>
        round(average(phaseData.map((point) => point[key])));
      const metricExceedance = (key: HistoricalMetricReview["key"]) =>
        phaseData.length
          ? round(
              (phaseData.filter((point) =>
                isOutsideMetricLimit(key, point[key])
              ).length /
                phaseData.length) *
                100,
              1
            )
          : 0;
      const phaseIssueCount = phaseData.filter((point) =>
        metricKeys.some((key) => isOutsideMetricLimit(key, point[key]))
      ).length;
      const weightStartKg = phaseWeights.at(0)?.actualWeightKg ?? null;
      const weightEndKg = phaseWeights.at(-1)?.actualWeightKg ?? null;

      return {
        key: phase.key,
        label: phase.label,
        dayRange: `Day ${phase.startDay}–${phase.endDay}`,
        startDay: phase.startDay,
        endDay: phase.endDay,
        records: phaseData.length,
        issueReadingPercent: phaseData.length
          ? round((phaseIssueCount / phaseData.length) * 100, 1)
          : 0,
        metricAverages: {
          temp: metricAverage("temp"),
          humidity: metricAverage("humidity"),
          co2: metricAverage("co2"),
          nh3: metricAverage("nh3"),
          pm25: metricAverage("pm25"),
        },
        metricExceedancePercent: {
          temp: metricExceedance("temp"),
          humidity: metricExceedance("humidity"),
          co2: metricExceedance("co2"),
          nh3: metricExceedance("nh3"),
          pm25: metricExceedance("pm25"),
        },
        mortalityCount: phaseMortality,
        mortalitySharePercent: totalMortality
          ? round((phaseMortality / totalMortality) * 100, 1)
          : 0,
        feedPerBirdKg:
          phaseFeedWater.length > 0
            ? round(
                phaseFeedWater.reduce(
                  (total, item) => total + item.feedKgPerBird,
                  0
                ),
                3
              )
            : null,
        waterPerBirdL:
          phaseFeedWater.length > 0
            ? round(
                phaseFeedWater.reduce(
                  (total, item) => total + item.waterLPerBird,
                  0
                ),
                3
              )
            : null,
        weightStartKg,
        weightEndKg,
        weightGainKg:
          weightStartKg !== null &&
          weightEndKg !== null &&
          phaseWeights.length > 1
            ? round(weightEndKg - weightStartKg, 3)
            : null,
      };
    }
  );
  let retrospectiveRiskScore =
    issueReadingPercent >= 25 ? 3 : issueReadingPercent >= 5 ? 1 : 0;
  if (mortalityRate > 3) retrospectiveRiskScore += 3;
  else if (mortalityRate > 1.5) retrospectiveRiskScore += 1;
  if (weightVariancePercent !== null) {
    if (weightVariancePercent < -8) retrospectiveRiskScore += 3;
    else if (weightVariancePercent < -3) retrospectiveRiskScore += 2;
  }
  if (estimatedFcr !== null) {
    if (estimatedFcr > 1.9) retrospectiveRiskScore += 2;
    else if (estimatedFcr > 1.7) retrospectiveRiskScore += 1;
  }
  const riskLevel: HistoricalAnalysisRisk =
    retrospectiveRiskScore >= 5
      ? "High"
      : retrospectiveRiskScore >= 2
        ? "Moderate"
        : "Low";

  const baseline: HistoricalCycleAnalysisBaseline = {
    cycleId: cycle.id,
    cycleLabel: cycle.label,
    period: `${cycle.startDate} – ${cycle.endDate}`,
    harvestDay: cycle.harvestDay,
    records,
    expectedRecords,
    completeness: expectedRecords
      ? round(Math.min(100, (records / expectedRecords) * 100), 1)
      : 0,
    readingsWithIssue,
    issueReadingPercent,
    riskLevel,
    metrics,
    cyclePhases,
    production: {
      availability: {
        feedWater: hasFeedWaterData,
        standardWeight: standardFinalWeightKg !== null,
      },
      initialBirds: production.initialBirds,
      totalMortality,
      mortalityRate: round(mortalityRate),
      firstWeekMortality,
      peakDailyMortality: peakDailyMortality
        ? {
            day: peakDailyMortality.day,
            count: peakDailyMortality.count,
          }
        : null,
      survivingBirds,
      totalFeedPerBirdKg:
        totalFeedPerBirdKg === null ? null : round(totalFeedPerBirdKg, 3),
      totalWaterPerBirdL:
        totalWaterPerBirdL === null ? null : round(totalWaterPerBirdL, 3),
      waterFeedRatio:
        totalFeedPerBirdKg && totalWaterPerBirdL !== null
          ? round(totalWaterPerBirdL / totalFeedPerBirdKg)
          : null,
      finalAverageWeightKg: round(finalAverageWeightKg, 3),
      standardFinalWeightKg:
        standardFinalWeightKg === null
          ? null
          : round(standardFinalWeightKg, 3),
      weightVariancePercent:
        weightVariancePercent === null ? null : round(weightVariancePercent),
      estimatedFcr: estimatedFcr === null ? null : round(estimatedFcr),
      estimatedLiveWeightKg: Math.round(
        survivingBirds * finalAverageWeightKg
      ),
      finalAdgGPerDay:
        typeof production.finalAdgGPerDay === "number"
          ? round(production.finalAdgGPerDay, 1)
          : null,
    },
  };

  const sensorFindings: HistoricalCycleAdvice["keyFindings"] = metrics
    .filter((item) => item.exceedanceCount > 0)
    .sort((a, b) => b.exceedancePercent - a.exceedancePercent)
    .map((item) => ({
      title: `${item.label} exceeded its review limit`,
      evidence: `${item.exceedanceCount} of ${records} readings (${item.exceedancePercent.toFixed(1)}%) were outside ${item.reviewLimit}; recorded range ${item.minimum.toFixed(2)}–${item.maximum.toFixed(2)} ${item.unit}.`,
      meaning:
        item.key === "temp"
          ? "Review whether heat periods aligned with reduced activity, feeding, or cooling performance."
          : item.key === "humidity"
            ? "Humidity outside the review band can indicate a need to check airflow, litter moisture, or weather response."
            : "Repeated air-quality exceedances should be compared with ventilation, litter, and activity records.",
    }));

  if (sensorFindings.length === 0) {
    sensorFindings.push({
      title: "Environmental readings remained within review limits",
      evidence: `All ${records} stored readings stayed within the configured dashboard review limits.`,
      meaning: "Use this cycle as a baseline while continuing routine verification.",
    });
  }

  const weightEvidence = [
    `Final average weight was ${finalAverageWeightKg.toFixed(3)} kg`,
    production.finalBiomassKg
      ? `with ${production.finalBiomassKg.toLocaleString()} kg recorded biomass`
      : null,
    weightVariancePercent !== null
      ? `${weightVariancePercent.toFixed(2)}% versus the configured standard`
      : "no standard-weight series was included",
    estimatedFcr !== null && totalFeedPerBirdKg !== null
      ? `${totalFeedPerBirdKg.toFixed(3)} kg feed per bird with estimated FCR ${estimatedFcr.toFixed(2)}`
      : "feed, water, and FCR were not available in the source workbook",
  ]
    .filter(Boolean)
    .join("; ");
  const keyFindings: HistoricalCycleAdvice["keyFindings"] = [
    {
      title: "Completed flock outcome",
      evidence: `${survivingBirds.toLocaleString()} birds remained from ${production.initialBirds.toLocaleString()}, with ${totalMortality} recorded mortality (${mortalityRate.toFixed(2)}%).`,
      meaning:
        mortalityRate > 1.5
          ? "Review mortality timing and farm notes before setting the next-cycle baseline."
          : "Recorded flock survival provides a stable baseline for the next cycle.",
    },
    {
      title: "Recorded weight outcome",
      evidence: `${weightEvidence}.`,
      meaning:
        weightVariancePercent !== null && weightVariancePercent < -3
          ? "The weight gap should be reviewed against feed intake, heat events, and sample quality."
          : weightVariancePercent !== null
            ? "Final weight was close to the configured reference."
            : "Use the recorded weight trend as the cycle outcome without inferring feed efficiency.",
    },
    ...sensorFindings,
  ];

  const nextCycleActions: HistoricalCycleAdvice["nextCycleActions"] = [];
  const temperatureReview = metrics.find((item) => item.key === "temp")!;
  const humidityReview = metrics.find((item) => item.key === "humidity")!;
  const airQualityReview = metrics.filter((item) =>
    ["co2", "nh3", "pm25"].includes(item.key)
  );

  if (temperatureReview.exceedanceCount > 0) {
    nextCycleActions.push({
      timeframe: "Before next placement",
      action: "Service and test fans, inlets, cooling, and temperature sensors.",
      reason: "Prepare the house for the heat-risk pattern observed in this completed cycle.",
    });
  }

  if (humidityReview.exceedanceCount > 0) {
    nextCycleActions.push({
      timeframe: "Early next cycle",
      action: "Set a routine for litter, drinker leakage, and humidity checks by time of day.",
      reason: "Prevent repeated moisture or overly dry conditions from developing later in the cycle.",
    });
  }

  if (airQualityReview.some((item) => item.exceedanceCount > 0)) {
    nextCycleActions.push({
      timeframe: "Before next placement",
      action: "Review minimum ventilation settings and clean air inlets and fan areas.",
      reason: "Reduce the likelihood of recurring gas or particulate peaks.",
    });
  }

  if (mortalityRate > 1.5) {
    nextCycleActions.push({
      timeframe: "Before next placement",
      action: "Review mortality by day against flock notes, CCTV, and environmental events.",
      reason: "Use the completed-cycle pattern to set earlier intervention checkpoints.",
    });
  }

  if (weightVariancePercent !== null && weightVariancePercent < -3) {
    nextCycleActions.push({
      timeframe: "Early next cycle",
      action: "Schedule representative weighing and verify feeder access and daily feed delivery.",
      reason: "Detect a repeat weight gap before the late-cycle growth window.",
    });
  }

  nextCycleActions.push({
    timeframe: "Throughout next cycle",
    action: "Compare sensor alerts with CCTV and daily farm notes using the same timestamps.",
    reason: "Build evidence for whether environmental events consistently affect flock behaviour.",
  });

  const efficiencySummary =
    estimatedFcr !== null
      ? `estimated FCR ${estimatedFcr.toFixed(2)}`
      : "feed, water, and FCR not recorded";
  const monitoringFocus = metrics
    .filter((item) => item.exceedanceCount > 0)
    .map((item) => `${item.label} exceedance timing`)
    .concat(
      hasFeedWaterData
        ? "Mortality, feed, water, and weight checkpoints"
        : "Mortality and weight checkpoints",
      "Sensor-to-CCTV event comparison"
    )
    .slice(0, 5);

  return {
    baseline,
    fallbackAdvice: {
      summary: `${cycle.label} completed with ${survivingBirds.toLocaleString()} birds, ${mortalityRate.toFixed(2)}% mortality, ${finalAverageWeightKg.toFixed(3)} kg final average weight, and ${efficiencySummary}. It contains ${records} sensor readings with ${baseline.completeness.toFixed(1)}% expected coverage; ${readingsWithIssue} readings (${issueReadingPercent.toFixed(1)}%) were outside at least one review limit. Combined production and environmental retrospective risk is ${riskLevel.toLowerCase()}.`,
      keyFindings: keyFindings.slice(0, 4),
      nextCycleActions: nextCycleActions.slice(0, 5),
      monitoringFocus,
    },
  };
}

export function createFocusedHistoricalAdvice(
  analysis: HistoricalCycleAnalysis,
  questionId: HistoricalAnalysisQuestionId
): HistoricalCycleAdvice {
  const baseline = analysis.baseline;
  const production = baseline.production;
  const phases = baseline.cyclePhases;
  const rankedMetrics = [...baseline.metrics].sort(
    (a, b) => b.exceedancePercent - a.exceedancePercent
  );
  const topMetric = rankedMetrics[0];
  const worstEnvironmentalPhase = [...phases].sort(
    (a, b) => b.issueReadingPercent - a.issueReadingPercent
  )[0];
  const highestMortalityPhase = [...phases].sort(
    (a, b) => b.mortalityCount - a.mortalityCount
  )[0];
  const firstWeekShare = production.totalMortality
    ? round(
        (production.firstWeekMortality / production.totalMortality) * 100,
        1
      )
    : 0;
  const fcrText =
    production.estimatedFcr !== null
      ? `estimated FCR ${production.estimatedFcr.toFixed(2)}`
      : "FCR was not available";
  const phaseOutcomeEvidence = phases
    .map(
      (phase) =>
        `${phase.label} (${phase.dayRange}): ${phase.issueReadingPercent.toFixed(1)}% readings outside a review limit, ${phase.mortalityCount} mortality${
          phase.weightGainKg !== null
            ? `, ${phase.weightGainKg.toFixed(3)} kg recorded weight gain`
            : ""
        }`
    )
    .join("; ");
  const monitoringFromMetrics = rankedMetrics
    .filter((metric) => metric.exceedanceCount > 0)
    .map((metric) => `${metric.label} exceedance timing`);

  if (questionId === "mortality") {
    const peak = production.peakDailyMortality;
    return {
      summary: `${baseline.cycleLabel} recorded ${production.totalMortality.toLocaleString()} mortality (${production.mortalityRate.toFixed(2)}% of ${production.initialBirds.toLocaleString()} placed birds). ${
        peak
          ? `The highest daily record was ${peak.count} birds on day ${peak.day}.`
          : "No daily mortality peak was available."
      } The first seven days contributed ${production.firstWeekMortality.toLocaleString()} birds (${firstWeekShare.toFixed(1)}% of total mortality), making timing—not only the final total—the key lesson for the next cycle.`,
      keyFindings: [
        {
          title: "Peak mortality checkpoint",
          evidence: peak
            ? `Day ${peak.day} had the highest recorded daily mortality at ${peak.count} birds; the completed cycle total was ${production.totalMortality.toLocaleString()}.`
            : `The cycle total was ${production.totalMortality.toLocaleString()}, but no daily peak was stored.`,
          meaning:
            "Review farm notes, chick condition, CCTV, and sensor readings around the peak before deciding which prevention measure is most relevant.",
        },
        {
          title: `${highestMortalityPhase?.label ?? "Cycle"} concentration`,
          evidence: highestMortalityPhase
            ? `${highestMortalityPhase.mortalityCount} birds (${highestMortalityPhase.mortalitySharePercent.toFixed(1)}% of cycle mortality) were recorded during ${highestMortalityPhase.dayRange}.`
            : "No phase-level mortality pattern was available.",
          meaning:
            "A phase concentration helps define when tighter checks and earlier escalation thresholds are needed.",
        },
        {
          title: "Environmental context requires timestamp review",
          evidence: highestMortalityPhase
            ? `During the same ${highestMortalityPhase.label.toLowerCase()}, ${highestMortalityPhase.issueReadingPercent.toFixed(1)}% of sensor readings were outside at least one dashboard review limit.`
            : `${baseline.issueReadingPercent.toFixed(1)}% of stored sensor readings were outside at least one review limit.`,
          meaning:
            "The overlap is context, not proof of causation. Compare exact dates and times before linking mortality to an environmental event.",
        },
      ],
      nextCycleActions: [
        {
          timeframe: "Before next placement",
          action:
            "Review mortality records around the peak day with farm notes, chick-receiving checks, CCTV, and timestamp-matched sensor data.",
          reason:
            "This separates observable events from assumptions and identifies which controls can be tested next.",
        },
        {
          timeframe: "Early next cycle",
          action:
            "Track daily and cumulative mortality with a clearly agreed escalation threshold.",
          reason:
            "The first-week share can be compared early enough to act before the pattern accumulates.",
        },
        {
          timeframe: "Early next cycle",
          action:
            "Record placement quality, temperature distribution, water access, and flock behaviour at consistent times.",
          reason:
            "These observations add the evidence that the completed cycle cannot provide from mortality totals alone.",
        },
        {
          timeframe: "Throughout next cycle",
          action:
            "Annotate every unusual mortality increase with operational changes and sensor alerts.",
          reason:
            "A timestamped event history makes the next retrospective analysis more conclusive.",
        },
      ],
      monitoringFocus: [
        "Daily and cumulative mortality",
        "First-week mortality share",
        "Mortality peak-day context",
        ...monitoringFromMetrics,
      ].slice(0, 5),
    };
  }

  if (questionId === "environment") {
    const environmentalFindings: HistoricalCycleAdvice["keyFindings"] =
      rankedMetrics
        .filter((metric) => metric.exceedanceCount > 0)
        .slice(0, 3)
        .map((metric) => ({
          title: `${metric.label} was a recurring review point`,
          evidence: `${metric.exceedanceCount} of ${baseline.records} readings (${metric.exceedancePercent.toFixed(1)}%) were outside ${metric.reviewLimit}; the recorded range was ${metric.minimum.toFixed(metric.key === "co2" ? 0 : 2)}–${metric.maximum.toFixed(metric.key === "co2" ? 0 : 2)} ${metric.unit}.`,
          meaning:
            metric.key === "temp"
              ? "Check whether cooling capacity, air speed, and temperature distribution were sufficient during the affected periods."
              : metric.key === "humidity"
                ? "Compare humidity timing with ventilation, drinker leakage, litter condition, and outside weather."
                : "Review minimum ventilation, inlet performance, litter condition, and sensor cleanliness around the affected timestamps.",
        }));
    if (environmentalFindings.length === 0) {
      environmentalFindings.push({
        title: "No configured environmental limit was exceeded",
        evidence: `All ${baseline.records} stored readings remained within the dashboard review limits.`,
        meaning:
          "Use this profile as a reference, while continuing calibration and flock-behaviour checks.",
      });
    }
    if (worstEnvironmentalPhase) {
      environmentalFindings.push({
        title: `${worstEnvironmentalPhase.label} needs the closest review`,
        evidence: `${worstEnvironmentalPhase.issueReadingPercent.toFixed(1)}% of readings during ${worstEnvironmentalPhase.dayRange} were outside at least one review limit, the highest phase-level share in this cycle.`,
        meaning:
          "Target equipment checks and operating reviews at the phase where environmental control was least consistent.",
      });
    }

    const actions: HistoricalCycleAdvice["nextCycleActions"] = [];
    if (
      rankedMetrics.some(
        (metric) => metric.key === "temp" && metric.exceedanceCount > 0
      )
    ) {
      actions.push({
        timeframe: "Before next placement",
        action:
          "Test fan stages, inlets, cooling, temperature sensors, and hot-spot coverage.",
        reason:
          "Verify that the house can respond before the cycle reaches its previously affected phase.",
      });
    }
    if (
      rankedMetrics.some(
        (metric) => metric.key === "humidity" && metric.exceedanceCount > 0
      )
    ) {
      actions.push({
        timeframe: "Early next cycle",
        action:
          "Log litter condition, drinker leakage, and humidity by time of day.",
        reason:
          "This distinguishes moisture-control issues from short weather-related changes.",
      });
    }
    if (
      rankedMetrics.some(
        (metric) =>
          ["co2", "nh3", "pm25"].includes(metric.key) &&
          metric.exceedanceCount > 0
      )
    ) {
      actions.push({
        timeframe: "Before next placement",
        action:
          "Review minimum ventilation, clean fan and inlet areas, and verify air-quality sensors.",
        reason:
          "These checks address recurring gas or particulate readings without relying on a single sensor signal.",
      });
    }
    actions.push(
      {
        timeframe: "Early next cycle",
        action:
          "Set phase-specific environmental review checkpoints using this cycle as the comparison baseline.",
        reason:
          "The house requirement changes as bird age, biomass, and heat production increase.",
      },
      {
        timeframe: "Throughout next cycle",
        action:
          "Confirm alerts with flock behaviour, CCTV, and a second physical observation.",
        reason:
          "Operational decisions should use corroborated evidence, not an isolated reading.",
      }
    );

    return {
      summary: `${baseline.issueReadingPercent.toFixed(1)}% of ${baseline.records} stored readings were outside at least one environmental review limit. ${
        topMetric
          ? `${topMetric.label} had the highest exceedance share at ${topMetric.exceedancePercent.toFixed(1)}%.`
          : ""
      } ${
        worstEnvironmentalPhase
          ? `${worstEnvironmentalPhase.label} (${worstEnvironmentalPhase.dayRange}) had the highest combined issue rate at ${worstEnvironmentalPhase.issueReadingPercent.toFixed(1)}%.`
          : ""
      } The priority is to review when and why control became inconsistent, then test the relevant equipment before the same production phase returns.`,
      keyFindings: environmentalFindings.slice(0, 4),
      nextCycleActions: actions.slice(0, 5),
      monitoringFocus: [
        ...monitoringFromMetrics,
        "Phase-level environmental issue rate",
        "Ventilation and cooling response",
        "Sensor-to-CCTV confirmation",
      ].slice(0, 5),
    };
  }

  if (questionId === "growth_efficiency") {
    const weightPhaseEvidence = phases
      .filter((phase) => phase.weightGainKg !== null)
      .map(
        (phase) =>
          `${phase.label}: ${phase.weightGainKg!.toFixed(3)} kg recorded gain`
      )
      .join("; ");
    const feedWaterEvidence =
      production.totalFeedPerBirdKg !== null &&
      production.totalWaterPerBirdL !== null
        ? `${production.totalFeedPerBirdKg.toFixed(3)} kg feed and ${production.totalWaterPerBirdL.toFixed(3)} L water per bird, with a water-to-feed ratio of ${production.waterFeedRatio?.toFixed(2) ?? "not available"}`
        : "Feed and water totals were not available";

    return {
      summary: `${baseline.cycleLabel} finished at ${production.finalAverageWeightKg.toFixed(3)} kg average live weight with ${production.survivingBirds.toLocaleString()} surviving birds and ${production.estimatedLiveWeightKg.toLocaleString()} kg estimated live weight. The cycle used ${feedWaterEvidence} and produced ${fcrText}. ${
        production.standardFinalWeightKg !== null
          ? `Final weight was ${production.weightVariancePercent?.toFixed(2)}% versus the configured standard.`
          : "No standard final-weight reference was stored, so efficiency should be compared with the farm's agreed target before judging it as good or poor."
      }`,
      keyFindings: [
        {
          title: "Final growth outcome",
          evidence: `Final average weight was ${production.finalAverageWeightKg.toFixed(3)} kg${
            production.finalAdgGPerDay !== null
              ? ` with ${production.finalAdgGPerDay.toFixed(1)} g/day recorded final ADG`
              : ""
          }; ${production.survivingBirds.toLocaleString()} birds survived to completion.`,
          meaning:
            "Use both per-bird weight and surviving flock output when comparing completed cycles.",
        },
        {
          title: "Feed and water efficiency",
          evidence: `${feedWaterEvidence}; ${fcrText}.`,
          meaning:
            "Reconcile these totals with delivery and inventory records before using them as a management benchmark.",
        },
        {
          title: "Growth development by phase",
          evidence:
            weightPhaseEvidence ||
            "There were not enough weight checkpoints to calculate phase-level gains.",
          meaning:
            "Phase checkpoints reveal when a final weight gap began, which is more actionable than the harvest value alone.",
        },
        {
          title: "Reference-weight limitation",
          evidence:
            production.standardFinalWeightKg !== null
              ? `The final configured standard was ${production.standardFinalWeightKg.toFixed(3)} kg and variance was ${production.weightVariancePercent?.toFixed(2)}%.`
              : "No standard-weight series was stored for this completed cycle.",
          meaning:
            production.standardFinalWeightKg !== null
              ? "Use the same standard source and sampling method in the next cycle for a fair comparison."
              : "Add an agreed breed/sex/program reference before drawing conclusions about growth performance.",
        },
      ],
      nextCycleActions: [
        {
          timeframe: "Before next placement",
          action:
            "Confirm the next cycle's weight standard, feed program, and expected FCR benchmark.",
          reason:
            "A documented target makes later variance and efficiency comparisons defensible.",
        },
        {
          timeframe: "Early next cycle",
          action:
            "Use representative, repeatable weighing checkpoints and record the sample size.",
          reason:
            "Consistent sampling detects a growth deviation before the final phase.",
        },
        {
          timeframe: "Throughout next cycle",
          action:
            "Reconcile daily feed and water entries with stock movement and meter readings.",
          reason:
            "FCR and water-to-feed analysis is only as reliable as the underlying consumption records.",
        },
        {
          timeframe: "Throughout next cycle",
          action:
            "Review weight gain, mortality, feed, water, and heat events together at each checkpoint.",
          reason:
            "A combined review helps explain when efficiency changed without assuming a single cause.",
        },
      ],
      monitoringFocus: [
        "Weight gain by phase",
        "Feed per bird",
        "Water-to-feed ratio",
        "Estimated FCR",
        "Mortality-adjusted live output",
      ],
    };
  }

  if (questionId === "sensor_production") {
    const sameHighestPhase =
      worstEnvironmentalPhase &&
      highestMortalityPhase &&
      worstEnvironmentalPhase.key === highestMortalityPhase.key;
    return {
      summary: `Phase comparison shows where environmental and production patterns overlapped: ${phaseOutcomeEvidence}. ${
        sameHighestPhase
          ? `${worstEnvironmentalPhase!.label} had both the highest combined sensor issue rate and the highest mortality count.`
          : "The highest sensor-issue phase and highest-mortality phase were different."
      } This is an association for investigation, not evidence that the sensor conditions caused the production outcome.`,
      keyFindings: [
        {
          title: "Phase-by-phase alignment",
          evidence: phaseOutcomeEvidence,
          meaning:
            "Phase alignment narrows the periods to investigate, but daily timestamps are needed for a stronger conclusion.",
        },
        {
          title: "Dominant sensor signal",
          evidence: topMetric
            ? `${topMetric.label} was outside ${topMetric.reviewLimit} in ${topMetric.exceedancePercent.toFixed(1)}% of all readings, the highest metric-level exceedance share.`
            : "No dominant sensor signal was available.",
          meaning:
            "Use the dominant signal as a review lead, then confirm it against the other sensors and physical observations.",
        },
        {
          title: "Production outcome context",
          evidence: `${production.mortalityRate.toFixed(2)}% mortality, ${production.finalAverageWeightKg.toFixed(3)} kg final average weight, and ${fcrText}.`,
          meaning:
            "These end outcomes should be linked only after matching individual events, operating changes, and checkpoints in time.",
        },
        {
          title: "Evidence strength",
          evidence: `${baseline.completeness.toFixed(1)}% expected sensor coverage was available across ${baseline.records} readings.`,
          meaning:
            "Coverage supports retrospective screening, while event notes and aligned daily records are still needed to test explanations.",
        },
      ],
      nextCycleActions: [
        {
          timeframe: "Before next placement",
          action:
            "Synchronise sensor, CCTV, mortality, feed, water, weighing, and farm-note timestamps.",
          reason:
            "Aligned timestamps are required to test whether patterns repeatedly occur together.",
        },
        {
          timeframe: "Early next cycle",
          action:
            "Create a simple event log for ventilation changes, equipment faults, litter issues, and flock-behaviour changes.",
          reason:
            "Operational context turns a sensor alert into an explainable event.",
        },
        {
          timeframe: "Throughout next cycle",
          action:
            "Review production and sensor indicators together at early, middle, and late-cycle checkpoints.",
          reason:
            "The completed-cycle phase profile provides a consistent comparison structure.",
        },
        {
          timeframe: "Throughout next cycle",
          action:
            "Treat correlations as investigation triggers and confirm them with repeated observations.",
          reason:
            "This avoids turning a coincident pattern into an unsupported causal conclusion.",
        },
      ],
      monitoringFocus: [
        "Timestamp-aligned sensor alerts",
        "Mortality and weight checkpoints",
        "Feed and water changes",
        "CCTV and farm event notes",
        "Repeated phase-level associations",
      ],
    };
  }

  if (questionId === "next_cycle") {
    const inheritedActions = analysis.fallbackAdvice.nextCycleActions;
    return {
      summary: `The next cycle should focus first on ${
        topMetric && topMetric.exceedanceCount > 0
          ? `${topMetric.label.toLowerCase()} control (${topMetric.exceedancePercent.toFixed(1)}% exceedance)`
          : "maintaining the completed cycle's environmental baseline"
      }, early detection of the ${production.mortalityRate.toFixed(2)}% mortality pattern, and repeatable growth and consumption checkpoints around the ${production.finalAverageWeightKg.toFixed(3)} kg final-weight outcome. ${
        worstEnvironmentalPhase
          ? `Preparation should be tested before ${worstEnvironmentalPhase.label.toLowerCase()} (${worstEnvironmentalPhase.dayRange}), when the combined sensor issue rate was highest.`
          : ""
      }`,
      keyFindings: [
        {
          title: "Priority 1: environmental readiness",
          evidence: topMetric
            ? `${topMetric.label} had ${topMetric.exceedanceCount} readings outside ${topMetric.reviewLimit} (${topMetric.exceedancePercent.toFixed(1)}%).`
            : "No sensor exceedance was available.",
          meaning:
            "Test the matching equipment and operating response before placement, not after the pattern returns.",
        },
        {
          title: "Priority 2: earlier mortality visibility",
          evidence: `${production.totalMortality.toLocaleString()} mortality (${production.mortalityRate.toFixed(2)}%) was recorded; ${production.firstWeekMortality.toLocaleString()} occurred in the first seven days.`,
          meaning:
            "Use daily and cumulative triggers so the next cycle can react earlier than the final retrospective.",
        },
        {
          title: "Priority 3: comparable performance checkpoints",
          evidence: `${production.finalAverageWeightKg.toFixed(3)} kg final average weight, ${fcrText}, and ${baseline.completeness.toFixed(1)}% expected sensor coverage.`,
          meaning:
            "Keep the same definitions and sampling method so changes between cycles are meaningful.",
        },
      ],
      nextCycleActions: inheritedActions.slice(0, 5),
      monitoringFocus: [
        ...monitoringFromMetrics,
        "First-week mortality trend",
        "Weight, feed, water, and FCR checkpoints",
        "Timestamped operating events",
      ].slice(0, 5),
    };
  }

  return {
    summary: `${analysis.fallbackAdvice.summary} By phase, ${
      worstEnvironmentalPhase
        ? `${worstEnvironmentalPhase.label.toLowerCase()} had the highest combined sensor issue rate (${worstEnvironmentalPhase.issueReadingPercent.toFixed(1)}%)`
        : "no phase-level environmental issue was identified"
    }, while ${
      highestMortalityPhase
        ? `${highestMortalityPhase.label.toLowerCase()} contained ${highestMortalityPhase.mortalitySharePercent.toFixed(1)}% of mortality`
        : "no phase-level mortality pattern was available"
    }. These patterns define the first areas to verify and improve in the next cycle.`,
    keyFindings: [
      {
        title: "Completed production outcome",
        evidence: `${production.survivingBirds.toLocaleString()} birds survived from ${production.initialBirds.toLocaleString()}, with ${production.totalMortality.toLocaleString()} mortality (${production.mortalityRate.toFixed(2)}%) and ${production.finalAverageWeightKg.toFixed(3)} kg final average weight.`,
        meaning:
          "Use survival and weight together as the completed-cycle outcome baseline.",
      },
      {
        title: "Efficiency outcome",
        evidence:
          production.totalFeedPerBirdKg !== null
            ? `${production.totalFeedPerBirdKg.toFixed(3)} kg feed and ${production.totalWaterPerBirdL?.toFixed(3)} L water per bird; ${fcrText}.`
            : "Feed, water, and FCR were not available.",
        meaning:
          "Keep the same consumption definitions and reconcile entries before comparing cycles.",
      },
      {
        title: "Most important environmental pattern",
        evidence:
          topMetric && topMetric.exceedanceCount > 0
            ? `${topMetric.label} had the highest exceedance share at ${topMetric.exceedancePercent.toFixed(1)}%, with a range of ${topMetric.minimum.toFixed(topMetric.key === "co2" ? 0 : 2)}–${topMetric.maximum.toFixed(topMetric.key === "co2" ? 0 : 2)} ${topMetric.unit}.`
            : `All ${baseline.records} readings remained within the configured review limits.`,
        meaning:
          "Review the timing and operating response around the strongest pattern before choosing a corrective action.",
      },
      {
        title: "Cycle-phase lesson",
        evidence: phaseOutcomeEvidence,
        meaning:
          "Phase comparisons show when monitoring and management attention should increase in the next cycle.",
      },
    ],
    nextCycleActions: analysis.fallbackAdvice.nextCycleActions,
    monitoringFocus: analysis.fallbackAdvice.monitoringFocus,
  };
}
