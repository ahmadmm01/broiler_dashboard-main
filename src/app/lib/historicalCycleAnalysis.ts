import type { HistoricalCycle } from "./historicalCycles";

export type HistoricalAnalysisRisk = "Low" | "Moderate" | "High";

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
  production: {
    initialBirds: number;
    totalMortality: number;
    mortalityRate: number;
    survivingBirds: number;
    totalFeedPerBirdKg: number;
    totalWaterPerBirdL: number;
    waterFeedRatio: number;
    finalAverageWeightKg: number;
    standardFinalWeightKg: number;
    weightVariancePercent: number;
    estimatedFcr: number;
    estimatedLiveWeightKg: number;
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
  const expectedRecords = cycle.harvestDay * 4;
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

  const readingsWithIssue = count(
    (index) =>
      values.temp[index] > 32 ||
      values.humidity[index] < 60 ||
      values.humidity[index] > 80 ||
      values.co2[index] > 1200 ||
      values.nh3[index] > 5 ||
      values.pm25[index] > 35
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
  const totalFeedPerBirdKg = production.feedWater.reduce(
    (total, item) => total + item.feedKgPerBird,
    0
  );
  const totalWaterPerBirdL = production.feedWater.reduce(
    (total, item) => total + item.waterLPerBird,
    0
  );
  const finalWeight = production.weights.at(-1);
  const finalAverageWeightKg = finalWeight?.actualWeightKg ?? 0;
  const standardFinalWeightKg = finalWeight?.standardWeightKg ?? 0;
  const mortalityRate = production.initialBirds
    ? (totalMortality / production.initialBirds) * 100
    : 0;
  const weightVariancePercent = standardFinalWeightKg
    ? ((finalAverageWeightKg - standardFinalWeightKg) /
        standardFinalWeightKg) *
      100
    : 0;
  const estimatedFcr = finalAverageWeightKg
    ? totalFeedPerBirdKg / finalAverageWeightKg
    : 0;
  let retrospectiveRiskScore =
    issueReadingPercent >= 25 ? 3 : issueReadingPercent >= 5 ? 1 : 0;
  if (mortalityRate > 3) retrospectiveRiskScore += 3;
  else if (mortalityRate > 1.5) retrospectiveRiskScore += 1;
  if (weightVariancePercent < -8) retrospectiveRiskScore += 3;
  else if (weightVariancePercent < -3) retrospectiveRiskScore += 2;
  if (estimatedFcr > 1.9) retrospectiveRiskScore += 2;
  else if (estimatedFcr > 1.7) retrospectiveRiskScore += 1;
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
    production: {
      initialBirds: production.initialBirds,
      totalMortality,
      mortalityRate: round(mortalityRate),
      survivingBirds,
      totalFeedPerBirdKg: round(totalFeedPerBirdKg, 3),
      totalWaterPerBirdL: round(totalWaterPerBirdL, 3),
      waterFeedRatio: totalFeedPerBirdKg
        ? round(totalWaterPerBirdL / totalFeedPerBirdKg)
        : 0,
      finalAverageWeightKg: round(finalAverageWeightKg, 3),
      standardFinalWeightKg: round(standardFinalWeightKg, 3),
      weightVariancePercent: round(weightVariancePercent),
      estimatedFcr: round(estimatedFcr),
      estimatedLiveWeightKg: Math.round(
        survivingBirds * finalAverageWeightKg
      ),
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
      title: "Weight and feed efficiency",
      evidence: `Final average weight was ${finalAverageWeightKg.toFixed(3)} kg (${weightVariancePercent.toFixed(2)}% vs standard), using ${totalFeedPerBirdKg.toFixed(3)} kg feed per bird with estimated FCR ${estimatedFcr.toFixed(2)}.`,
      meaning:
        weightVariancePercent < -3
          ? "The weight gap should be reviewed against feed intake, heat events, and sample quality."
          : "Final weight and feed efficiency were close to the configured reference.",
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

  if (weightVariancePercent < -3) {
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

  return {
    baseline,
    fallbackAdvice: {
      summary: `${cycle.label} completed with ${survivingBirds.toLocaleString()} birds, ${mortalityRate.toFixed(2)}% mortality, ${finalAverageWeightKg.toFixed(3)} kg final average weight, and estimated FCR ${estimatedFcr.toFixed(2)}. It contains ${records} sensor readings with ${baseline.completeness.toFixed(1)}% expected coverage; ${readingsWithIssue} readings (${issueReadingPercent.toFixed(1)}%) were outside at least one review limit. Combined production and environmental retrospective risk is ${riskLevel.toLowerCase()}.`,
      keyFindings: keyFindings.slice(0, 4),
      nextCycleActions: nextCycleActions.slice(0, 5),
      monitoringFocus: metrics
        .filter((item) => item.exceedanceCount > 0)
        .map((item) => `${item.label} exceedance timing`)
        .concat(
          "Mortality, feed, water, and weight checkpoints",
          "Sensor-to-CCTV event comparison"
        )
        .slice(0, 5),
    },
  };
}
