import { standardBroilerWeight } from "./broilerStandard";
import { SENSOR_ALERT_RULES } from "./alertRules";
import type { HarvestSummary } from "./cycleAnalytics";
import { summarizeData } from "./sensorData";
import type { DataPoint, ProductionCycle, Zone } from "./types";

export type PredictionRiskLevel = "Low" | "Moderate" | "High";
export type PredictionConfidence = "Low" | "Medium" | "High";

export type CycleRiskFactor = {
  key:
    | "mortality"
    | "weight"
    | "fcr"
    | "temperature"
    | "co2"
    | "nh3"
    | "pm25"
    | "alert-episodes"
    | "sensor-completeness";
  label: string;
  detail: string;
  score: number;
};

export type CycleRiskAssessment = {
  level: PredictionRiskLevel;
  score: number;
  factors: CycleRiskFactor[];
  summary: string;
};

export type CyclePredictionBaseline = {
  cycleId: string;
  houseName: string;
  zone: Zone;
  currentDay: number;
  targetHarvestDay: number;
  daysRemaining: number;
  projectedAverageWeightKg: number;
  targetAverageWeightKg: number;
  projectedSurvivingBirds: number;
  projectedLiveWeightKg: number;
  mortalityRate: number;
  fcr: number;
  hasWeightReference: boolean;
  weightVariancePercent: number;
  alertCount: number;
  riskLevel: PredictionRiskLevel;
  riskScore: number;
  riskDrivers: string[];
  confidence: PredictionConfidence;
  sensorCompleteness: number;
  latestReading: string;
  sensor: {
    temperatureAverage: number;
    temperaturePeak: number;
    humidityAverage: number;
    co2Average: number;
    co2Peak: number;
    nh3Average: number;
    nh3Peak: number;
    pm25Average: number;
    pm25Peak: number;
  };
};

export type CyclePredictionAdvice = {
  summary: string;
  zoneSummaries?: Array<{
    zone: Zone;
    riskLevel: PredictionRiskLevel;
    summary: string;
  }>;
  keyRisks: Array<{
    title: string;
    evidence: string;
    impact: string;
  }>;
  priorityActions: Array<{
    timeframe: string;
    action: string;
    reason: string;
  }>;
  monitoringFocus: string[];
};

export type CurrentCyclePrediction = {
  baseline: CyclePredictionBaseline;
  fallbackAdvice: CyclePredictionAdvice;
};

const round = (value: number, decimals = 2) =>
  Number(value.toFixed(decimals));

export function assessCurrentCycleRisk({
  harvest,
  sensorData,
  sensorSummary,
}: {
  harvest: HarvestSummary;
  sensorData?: DataPoint[];
  sensorSummary?: ReturnType<typeof summarizeData>;
}): CycleRiskAssessment {
  const sensor = sensorSummary ?? summarizeData(sensorData ?? []);
  const temperaturePeak = sensor?.temp.max ?? 0;
  const co2Peak = sensor?.co2.max ?? 0;
  const nh3Peak = sensor?.nh3.max ?? 0;
  const pm25Peak = sensor?.pm25.max ?? 0;
  const factors: CycleRiskFactor[] = [];

  if (harvest.mortalityRate > 3) {
    factors.push({
      key: "mortality",
      label: "Mortality trend",
      detail: `${harvest.mortalityRate.toFixed(2)}% mortality`,
      score: 3,
    });
  } else if (harvest.mortalityRate > 1.5) {
    factors.push({
      key: "mortality",
      label: "Mortality trend",
      detail: `${harvest.mortalityRate.toFixed(2)}% mortality`,
      score: 1,
    });
  }

  if (harvest.hasWeightReference && harvest.weightVariancePercent < -8) {
    factors.push({
      key: "weight",
      label: "Weight gap",
      detail: `${Math.abs(harvest.weightVariancePercent).toFixed(2)}% below weight standard`,
      score: 3,
    });
  } else if (
    harvest.hasWeightReference &&
    harvest.weightVariancePercent < -3
  ) {
    factors.push({
      key: "weight",
      label: "Weight gap",
      detail: `${Math.abs(harvest.weightVariancePercent).toFixed(2)}% below weight standard`,
      score: 1,
    });
  }

  if (harvest.fcr > 1.9) {
    factors.push({
      key: "fcr",
      label: "Feed efficiency",
      detail: `FCR ${harvest.fcr.toFixed(2)} above 1.90`,
      score: 2,
    });
  } else if (harvest.fcr > 1.7) {
    factors.push({
      key: "fcr",
      label: "Feed efficiency",
      detail: `FCR ${harvest.fcr.toFixed(2)} above 1.70`,
      score: 1,
    });
  }

  if (temperaturePeak > 32) {
    factors.push({
      key: "temperature",
      label: "Heat exposure",
      detail: `${temperaturePeak.toFixed(2)} °C temperature peak`,
      score: 1,
    });
  }
  if (co2Peak > 1200) {
    factors.push({
      key: "co2",
      label: "CO₂ peak",
      detail: `${co2Peak.toFixed(0)} ppm CO₂ peak`,
      score: 1,
    });
  }
  if (nh3Peak >= SENSOR_ALERT_RULES.nh3.threshold) {
    factors.push({
      key: "nh3",
      label: "NH₃ peak",
      detail: `${nh3Peak.toFixed(2)} ppm NH₃ peak`,
      score: 1,
    });
  }
  if (pm25Peak > 35) {
    factors.push({
      key: "pm25",
      label: "PM2.5 peak",
      detail: `${pm25Peak.toFixed(2)} µg/m³ PM2.5 peak`,
      score: 1,
    });
  }

  if (harvest.alertCount >= 8) {
    factors.push({
      key: "alert-episodes",
      label: `${harvest.alertCount} alert episodes`,
      detail: `${harvest.alertCount} threshold alert episodes during the cycle`,
      score: 2,
    });
  } else if (harvest.alertCount >= 3) {
    factors.push({
      key: "alert-episodes",
      label: `${harvest.alertCount} alert episodes`,
      detail: `${harvest.alertCount} threshold alert episodes during the cycle`,
      score: 1,
    });
  }

  if (harvest.sensorHealth.completeness < 90) {
    factors.push({
      key: "sensor-completeness",
      label: "Sensor data gap",
      detail: `${harvest.sensorHealth.completeness.toFixed(1)}% sensor completeness`,
      score: 2,
    });
  }

  factors.sort((left, right) => right.score - left.score);
  const score = factors.reduce((total, factor) => total + factor.score, 0);
  const level: PredictionRiskLevel =
    score >= 5 ? "High" : score >= 2 ? "Moderate" : "Low";

  return {
    level,
    score,
    factors,
    summary:
      factors.length > 0
        ? factors
            .slice(0, 3)
            .map((factor) => factor.detail)
            .join(" · ")
        : "No major cycle-risk driver is outside the configured review limits",
  };
}

export function createCurrentCyclePrediction({
  cycle,
  harvest,
  sensorData,
  zone,
}: {
  cycle: ProductionCycle;
  harvest: HarvestSummary;
  sensorData: DataPoint[];
  zone: Zone;
}): CurrentCyclePrediction {
  const sensor = summarizeData(sensorData);
  const currentDay = Math.max(1, harvest.cycleDay);
  const daysRemaining = Math.max(0, cycle.targetHarvestDay - currentDay);
  const measuredWeight = harvest.finalAverageWeightKg;
  const currentStandardWeightKg = standardBroilerWeight(currentDay);
  const targetAverageWeightKg = standardBroilerWeight(
    cycle.targetHarvestDay
  );
  const growthPerformanceRatio =
    measuredWeight > 0 && currentStandardWeightKg > 0
      ? measuredWeight / currentStandardWeightKg
      : 1;
  const projectedAverageWeightKg = Math.max(
    0,
    targetAverageWeightKg * growthPerformanceRatio
  );
  const projectedMortality = Math.round(
    (harvest.totalMortality / currentDay) * daysRemaining
  );
  const projectedSurvivingBirds = Math.max(
    0,
    harvest.survivingBirds - projectedMortality
  );
  const temperaturePeak = sensor?.temp.max ?? 0;
  const co2Peak = sensor?.co2.max ?? 0;
  const nh3Peak = sensor?.nh3.max ?? 0;
  const pm25Peak = sensor?.pm25.max ?? 0;
  const riskAssessment = assessCurrentCycleRisk({
    harvest,
    sensorSummary: sensor,
  });
  const riskLevel = riskAssessment.level;
  const confidence: PredictionConfidence =
    harvest.sensorHealth.completeness >= 95 &&
    measuredWeight > 0 &&
    harvest.totalFeedPerBirdKg > 0
      ? "High"
      : harvest.sensorHealth.completeness >= 80 && measuredWeight > 0
        ? "Medium"
        : "Low";

  const baseline: CyclePredictionBaseline = {
    cycleId: cycle.id,
    houseName: cycle.houseName,
    zone,
    currentDay,
    targetHarvestDay: cycle.targetHarvestDay,
    daysRemaining,
    projectedAverageWeightKg: round(projectedAverageWeightKg, 3),
    targetAverageWeightKg: round(targetAverageWeightKg, 3),
    projectedSurvivingBirds,
    projectedLiveWeightKg: Math.round(
      projectedSurvivingBirds * projectedAverageWeightKg
    ),
    mortalityRate: round(harvest.mortalityRate),
    fcr: round(harvest.fcr),
    hasWeightReference: harvest.hasWeightReference,
    weightVariancePercent: round(harvest.weightVariancePercent),
    alertCount: harvest.alertCount,
    riskLevel,
    riskScore: riskAssessment.score,
    riskDrivers: riskAssessment.factors.map((factor) => factor.detail),
    confidence,
    sensorCompleteness: round(harvest.sensorHealth.completeness, 1),
    latestReading: sensorData.at(-1)?.time ?? "-",
    sensor: {
      temperatureAverage: round(sensor?.temp.avg ?? 0),
      temperaturePeak: round(temperaturePeak),
      humidityAverage: round(sensor?.humidity.avg ?? 0),
      co2Average: Math.round(sensor?.co2.avg ?? 0),
      co2Peak: Math.round(co2Peak),
      nh3Average: round(sensor?.nh3.avg ?? 0),
      nh3Peak: round(nh3Peak),
      pm25Average: round(sensor?.pm25.avg ?? 0),
      pm25Peak: round(pm25Peak),
    },
  };

  const keyRisks: CyclePredictionAdvice["keyRisks"] = [];
  const priorityActions: CyclePredictionAdvice["priorityActions"] = [];
  const monitoringFocus = new Set<string>();

  if (temperaturePeak > 32) {
    keyRisks.push({
      title: "Heat stress exposure",
      evidence: `Temperature peaked at ${temperaturePeak.toFixed(2)} °C against the 32 °C dashboard threshold.`,
      impact: "Sustained heat can reduce feed intake and late-cycle weight gain.",
    });
    priorityActions.push({
      timeframe: "Now",
      action: "Check fan, inlet, and cooling operation during the hottest periods.",
      reason: "Reduce heat load while preserving sufficient air exchange.",
    });
    monitoringFocus.add("Temperature peaks and bird heat-stress behaviour");
  }

  if (
    co2Peak > 1200 ||
    nh3Peak >= SENSOR_ALERT_RULES.nh3.threshold
  ) {
    keyRisks.push({
      title: "Ventilation or litter air-quality risk",
      evidence: `Peak CO₂ was ${co2Peak.toFixed(0)} ppm and peak NH₃ was ${nh3Peak.toFixed(2)} ppm.`,
      impact: "Poor air quality may affect comfort, respiratory condition, and performance.",
    });
    priorityActions.push({
      timeframe: "Next 24 hours",
      action: "Inspect ventilation balance, wet litter areas, and drinker leakage.",
      reason: "Address likely contributors before the next high-reading period.",
    });
    monitoringFocus.add("CO₂ and NH₃ after ventilation adjustments");
  }

  if (pm25Peak > 35) {
    keyRisks.push({
      title: "Dust exposure",
      evidence: `PM2.5 peaked at ${pm25Peak.toFixed(2)} µg/m³ against the 35 µg/m³ dashboard threshold.`,
      impact: "Dust can indicate dry litter or activity-related air-quality pressure.",
    });
    priorityActions.push({
      timeframe: "Next 24 hours",
      action: "Check litter condition and airflow without creating excessive dust movement.",
      reason: "Keep particulate exposure controlled while maintaining ventilation.",
    });
    monitoringFocus.add("PM2.5 during feeding and high-activity periods");
  }

  if (
    harvest.hasWeightReference &&
    harvest.weightVariancePercent < -3
  ) {
    keyRisks.push({
      title: "Weight below configured target",
      evidence: `Recorded weight is ${Math.abs(harvest.weightVariancePercent).toFixed(2)}% below the configured standard.`,
      impact: "Harvest weight and total live output may finish below plan.",
    });
    priorityActions.push({
      timeframe: "Before harvest",
      action: "Repeat a representative sample weighing and verify feeder access and feed delivery records.",
      reason: "Confirm whether the gap is biological, operational, or a sampling issue.",
    });
    monitoringFocus.add("Representative body-weight sample");
  }

  if (harvest.mortalityRate > 1.5) {
    keyRisks.push({
      title: "Mortality trend requires review",
      evidence: `Recorded mortality is ${harvest.mortalityRate.toFixed(2)}%.`,
      impact: "Further loss would reduce surviving birds and total live weight.",
    });
    priorityActions.push({
      timeframe: "Now",
      action: "Review daily mortality timing alongside farm notes and environmental alerts.",
      reason: "Identify a repeatable pattern and escalate unusual findings to farm management or a veterinarian.",
    });
    monitoringFocus.add("Daily mortality and flock behaviour");
  }

  if (harvest.sensorHealth.completeness < 95) {
    keyRisks.push({
      title: "Prediction data gap",
      evidence: `Sensor completeness is ${harvest.sensorHealth.completeness.toFixed(1)}%.`,
      impact: "Missing periods reduce confidence in environmental recommendations.",
    });
    priorityActions.push({
      timeframe: "Now",
      action: "Verify sensor connectivity and compare missing periods with manual farm records.",
      reason: "Restore a reliable evidence trail before operational decisions are signed off.",
    });
    monitoringFocus.add("Sensor completeness and sampling gaps");
  }

  if (harvest.alertCount >= 3) {
    keyRisks.push({
      title: "Repeated environmental alert exposure",
      evidence: `${harvest.alertCount} alert events were recorded during the current cycle.`,
      impact: "Repeated short events can still affect comfort and performance even when cycle averages look acceptable.",
    });
    priorityActions.push({
      timeframe: "Next 24 hours",
      action: "Review the alert timeline against CCTV, weather, feeding, and ventilation records.",
      reason: "Identify whether alerts share a recurring operational cause.",
    });
    monitoringFocus.add("Alert recurrence by time of day");
  }

  if (keyRisks.length === 0) {
    keyRisks.push({
      title: "No major threshold risk detected",
      evidence: "Recorded production and environmental indicators remain within the configured review limits.",
      impact: "The current trajectory can be maintained with routine monitoring.",
    });
  }

  if (priorityActions.length === 0) {
    priorityActions.push({
      timeframe: "Daily",
      action: "Maintain current feed, water, ventilation, and observation routines.",
      reason: "Preserve the current trajectory and catch deviations early.",
    });
  }

  priorityActions.push({
    timeframe: daysRemaining > 0 ? "Before harvest" : "Before sign-off",
    action: "Confirm final bird count, representative weight, feed total, and water records.",
    reason: "Use verified farm records before accepting the projected harvest outcome.",
  });
  monitoringFocus.add("Feed intake, water availability, and flock behaviour");

  const stageText =
    daysRemaining > 0
      ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remain before the configured harvest day.`
      : "The configured harvest day has been reached.";

  return {
    baseline,
    fallbackAdvice: {
      summary: `${stageText} If the recorded trend continues, average weight is projected at ${baseline.projectedAverageWeightKg.toFixed(3)} kg per bird with approximately ${baseline.projectedSurvivingBirds.toLocaleString()} birds remaining. Overall cycle risk is ${riskLevel.toLowerCase()}, driven by ${riskAssessment.summary}.`,
      zoneSummaries: [
        {
          zone,
          riskLevel,
          summary: `Projected average weight is ${baseline.projectedAverageWeightKg.toFixed(3)} kg with ${baseline.mortalityRate.toFixed(2)}% recorded mortality, FCR ${baseline.fcr.toFixed(2)}, and ${baseline.sensorCompleteness.toFixed(1)}% sensor completeness.`,
        },
      ],
      keyRisks: keyRisks.slice(0, 4),
      priorityActions: priorityActions.slice(0, 5),
      monitoringFocus: Array.from(monitoringFocus).slice(0, 5),
    },
  };
}
