import { SENSOR_ALERT_RULES, isSensorAtOrAboveLimit } from "./alertRules";
import { dateToDayNumber } from "./dateUtils";
import type { HistoricalCycle, HistoricalProductionData } from "./historicalCycles";
import type { DataPoint, SensorMetric } from "./types";

export type FindingStatus = "unreviewed" | "reviewed" | "planned" | "done";

export const FINDING_STATUSES: { value: FindingStatus; label: string }[] = [
  { value: "unreviewed", label: "Not reviewed" },
  { value: "reviewed", label: "Reviewed" },
  { value: "planned", label: "Action planned" },
  { value: "done", label: "Action completed" },
];

export type CycleFinding = {
  id: string;
  title: string;
  category: "Environment" | "Mortality" | "Production";
  priority: "Review" | "Maintain";
  evidence: string;
  meaning: string;
  action: string;
  timeframe: string;
  checkpoint: string;
  day: number;
  timestamp?: number;
  period: string;
};

export type CycleFindingsSnapshot = {
  cycleId: string;
  cycleLabel: string;
  zone: string;
  currentDay: number;
  isFinal: boolean;
  selectedTime?: string;
  findings: CycleFinding[];
  signature: string;
};

export type FindingInterpretation = {
  id: string;
  meaning: string;
  action: string;
  checkpoint: string;
};

export type SavedFindingFollowUp = {
  status: FindingStatus;
  note: string;
  updatedAt: string;
  finding: CycleFinding;
};

export type SavedFindingInsight = {
  signature: string;
  currentDay: number;
  selectedTime?: string;
  generatedAt: string;
  interpretations: FindingInterpretation[];
  snapshot: CycleFindingsSnapshot;
};

export type CycleFindingsStore = Record<
  string,
  {
    followUps: Record<string, SavedFindingFollowUp>;
    insights: SavedFindingInsight[];
  }
>;

function shortSignature(value: unknown) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  }
  return `findings-v1-${(hash >>> 0).toString(16)}`;
}

export function getPreviousFindingCycle(
  cycle: HistoricalCycle,
  cycles: HistoricalCycle[]
) {
  return cycles
    .filter(
      (candidate) =>
        candidate.zone === cycle.zone &&
        candidate.id !== cycle.id &&
        candidate.startDate < cycle.startDate
    )
    .sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
}

export function createCycleFindings({
  cycle,
  cycles = [],
  replayDay,
  selectedTimestamp,
  sensorData = cycle.data,
  production = cycle.production,
  completed = replayDay === undefined,
}: {
  cycle: HistoricalCycle;
  cycles?: HistoricalCycle[];
  replayDay?: number;
  selectedTimestamp?: number;
  sensorData?: DataPoint[];
  production?: HistoricalProductionData;
  completed?: boolean;
}): CycleFindingsSnapshot {
  const currentDay = Math.max(1, replayDay ?? cycle.harvestDay);
  // A replay's final summary is released only at its last stored reading.
  const isFinal = completed;
  const data = sensorData.filter(
    (point) =>
      dateToDayNumber(point.time, cycle.startDate) <= currentDay &&
      (selectedTimestamp === undefined || point.ts <= selectedTimestamp)
  );
  const mortality = production.mortality.filter((entry) => entry.day <= currentDay);
  const weights = production.weights.filter((entry) => entry.day <= currentDay);
  const findings: CycleFinding[] = [];

  const checkpointByMetric: Record<SensorMetric, string> = {
    temp: "Record temperature peaks together with fan and cooling checks in the next cycle.",
    humidity: "Log litter condition and moisture checks alongside humidity readings.",
    co2: "Record fresh-air and fan inspections alongside CO₂ trends.",
    nh3: "Log litter moisture, drinker leaks, and ventilation checks alongside NH₃ readings.",
    pm25: "Record dusty feed handling and cleaning periods alongside PM2.5 readings.",
  };
  const actionByMetric: Record<SensorMetric, string> = {
    temp: "Inspect fan, cooling, and controller operation before placement, then repeat checks during the corresponding age period.",
    humidity: "Inspect drinker leaks, litter moisture, and air exchange before placement and during the corresponding age period.",
    co2: "Check fresh-air inlets and fan operation before placement and record checks during the corresponding age period.",
    nh3: "Inspect litter moisture, drinker leaks, and ventilation before placement and during the corresponding age period.",
    pm25: "Review dusty feed handling and cleaning routines before the next flock and record dust-control checks during growth.",
  };

  for (const metric of Object.keys(SENSOR_ALERT_RULES) as SensorMetric[]) {
    const rule = SENSOR_ALERT_RULES[metric];
    const exceeded = data.filter((point) => isSensorAtOrAboveLimit(metric, point[metric]));
    if (exceeded.length === 0) continue;
    const first = exceeded[0];
    const last = exceeded.at(-1)!;
    const firstDay = dateToDayNumber(first.time, cycle.startDate);
    const lastDay = dateToDayNumber(last.time, cycle.startDate);
    const peak = Math.max(...exceeded.map((point) => point[metric]));
    findings.push({
      id: `environment-${metric}`,
      title: `${rule.label} crossed the review limit`,
      category: "Environment",
      priority: "Review",
      evidence: `${exceeded.length} of ${data.length} raw readings (${((exceeded.length / data.length) * 100).toFixed(1)}%) were at or above ${rule.threshold} ${rule.unit}; recorded peak ${peak.toFixed(metric === "co2" ? 0 : 2)} ${rule.unit}. First crossing: ${first.time}; last crossing: ${last.time}. Averaged charts may stay below the limit; their recorded-peak line retains these readings.`,
      meaning: "These readings identify periods for operational review. They do not establish that this condition caused mortality or reduced growth.",
      action: actionByMetric[metric],
      timeframe: "Review the recorded period; check equipment before the next flock",
      checkpoint: checkpointByMetric[metric],
      day: firstDay,
      timestamp: first.ts,
      period: firstDay === lastDay ? `Day ${firstDay}` : `Days ${firstDay}–${lastDay}`,
    });
  }

  if (data.length > 0 && findings.length === 0) {
    findings.push({
      id: "environment-within-limits",
      title: "Displayed environment stayed within review limits",
      category: "Environment",
      priority: "Maintain",
      evidence: `None of the ${data.length} displayed readings reached the configured temperature, humidity, CO₂, NH₃, or PM2.5 review limit.`,
      meaning: "The displayed environmental record has no limit crossing. Physical flock and house inspections still provide information that these sensors do not measure.",
      action: "Maintain regular ventilation, litter, and sensor checks and record any unusual flock behaviour.",
      timeframe: "Daily checks in the next cycle",
      checkpoint: "Keep inspection notes aligned with sensor timestamps so later changes can be reviewed.",
      day: 1,
      timestamp: data[0].ts,
      period: `Days 1–${currentDay}`,
    });
  }

  if (mortality.length > 0) {
    const total = mortality.reduce((sum, entry) => sum + entry.count, 0);
    const daily = new Map<number, number>();
    mortality.forEach((entry) => daily.set(entry.day, (daily.get(entry.day) ?? 0) + entry.count));
    const peak = [...daily.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0];
    const point = data.find((entry) => dateToDayNumber(entry.time, cycle.startDate) === peak[0]);
    findings.push({
      id: "mortality-pattern",
      title: "Mortality timing provides a follow-up checkpoint",
      category: "Mortality",
      priority: "Review",
      evidence: `${total.toLocaleString()} birds lost (${production.initialBirds ? ((total / production.initialBirds) * 100).toFixed(2) : "0.00"}% of birds placed) through Day ${currentDay}. Highest recorded daily count: ${peak[1]} birds on Day ${peak[0]}.`,
      meaning: "The peak identifies a day to review alongside farm notes, flock observations, and equipment checks. Daily counts alone do not identify a health condition or its cause.",
      action: `Review the Day ${peak[0]} farm log and use the same age period as an inspection checkpoint in the next cycle.`,
      timeframe: "Before the next cycle and during the corresponding age period",
      checkpoint: "Record daily counts, flock observations, and completed house checks together.",
      day: peak[0],
      timestamp: point?.ts,
      period: `Day ${peak[0]} · cumulative review to Day ${currentDay}`,
    });
  }

  const source = isFinal ? cycle.production.sourceSummary : undefined;
  const previousCycle = getPreviousFindingCycle(cycle, cycles);
  const previous = previousCycle?.production.sourceSummary;
  if (source && previous) {
    const mortalityChange = source.mortalityRatePercent - previous.mortalityRatePercent;
    const fcrChange = source.fcr - previous.fcr;
    findings.push({
      id: "production-efficiency",
      title: "Survival and feed efficiency compared with the previous batch",
      category: "Production",
      priority: mortalityChange > 0 || fcrChange > 0 ? "Review" : "Maintain",
      evidence: `Batch ${source.batch}: mortality ${source.mortalityRatePercent.toFixed(2)}%, FCR ${source.fcr.toFixed(2)}. Batch ${previous.batch}: mortality ${previous.mortalityRatePercent.toFixed(2)}%, FCR ${previous.fcr.toFixed(2)}.`,
      meaning: `Mortality ${mortalityChange < 0 ? "decreased" : mortalityChange > 0 ? "increased" : "was unchanged"} and FCR ${fcrChange < 0 ? "decreased" : fcrChange > 0 ? "increased" : "was unchanged"}. Lower mortality and FCR are favourable; farm records are needed to explain the difference.`,
      action: "Compare flock inspection, feed delivery, and equipment-check records between the two batches before choosing which routines to carry forward.",
      timeframe: "Next-cycle planning",
      checkpoint: "Track daily mortality and cumulative feed use with consistent weighing and counting methods.",
      day: currentDay,
      timestamp: data.at(-1)?.ts,
      period: `Completed Batch ${source.batch} vs Batch ${previous.batch}`,
    });
    findings.push({
      id: "production-growth",
      title: "Growth and efficiency show the batch trade-off",
      category: "Production",
      priority: source.averageWeightKg < previous.averageWeightKg || source.efficiencyIndex < previous.efficiencyIndex ? "Review" : "Maintain",
      evidence: `Batch ${source.batch}: ${source.averageWeightKg.toFixed(2)} kg/bird, efficiency index ${source.efficiencyIndex.toFixed(2)}, average age ${source.averageAgeDays} days. Batch ${previous.batch}: ${previous.averageWeightKg.toFixed(2)} kg/bird, index ${previous.efficiencyIndex.toFixed(2)}, average age ${previous.averageAgeDays} days.`,
      meaning: "Weight, efficiency index, and slaughter age should be considered together. A favourable mortality or FCR result does not mean that every growth indicator also improved.",
      action: "Review weight sampling and harvest age alongside the farm's growth objectives before setting the next-cycle checkpoints.",
      timeframe: "Before placement; repeat checks during growth",
      checkpoint: "Use consistent weight sampling and compare birds at the same age before interpreting growth differences.",
      day: currentDay,
      timestamp: data.at(-1)?.ts,
      period: `Completed Batch ${source.batch} vs Batch ${previous.batch}`,
    });
  } else if (weights.length > 0) {
    const last = weights.at(-1)!;
    findings.push({
      id: "production-growth",
      title: isFinal ? "Recorded growth is a baseline for the next cycle" : "Growth review is still in progress",
      category: "Production",
      priority: "Maintain",
      evidence: `Latest average weight: ${last.actualWeightKg.toFixed(3)} kg/bird at Day ${last.day}. ${weights.length} weight records are available through Day ${currentDay}.`,
      meaning: isFinal
        ? "This record gives a growth baseline. Comparing birds at a matching age and with a consistent sampling method improves the next-cycle review."
        : "This is a to-date weight observation. Final efficiency and completed-batch comparisons become available at the end of the replay.",
      action: "Keep the body-weight sampling method consistent and record sample size and age with each measurement.",
      timeframe: "At each weight check in the next cycle",
      checkpoint: "Compare same-age measurements and investigate changes alongside farm records.",
      day: last.day,
      timestamp: data.find((entry) => dateToDayNumber(entry.time, cycle.startDate) === last.day)?.ts,
      period: `Day ${last.day} weight check`,
    });
  }

  const baseline = {
    cycleId: cycle.id,
    cycleLabel: cycle.label,
    zone: cycle.zone,
    currentDay,
    isFinal,
    selectedTime: data.at(-1)?.time,
    findings,
  };
  return { ...baseline, signature: shortSignature(baseline) };
}

export function sanitizeFindingInterpretations(
  value: unknown,
  expectedIds: string[]
): FindingInterpretation[] | null {
  if (!Array.isArray(value) || value.length !== expectedIds.length) return null;
  const items: FindingInterpretation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== "string" || !expectedIds.includes(raw.id) || items.some((entry) => entry.id === raw.id)) return null;
    const clean = (field: unknown) => typeof field === "string" ? field.trim().slice(0, 650) : "";
    const meaning = clean(raw.meaning);
    const action = clean(raw.action);
    const checkpoint = clean(raw.checkpoint);
    if (!meaning || !action || !checkpoint) return null;
    items.push({ id: raw.id, meaning, action, checkpoint });
  }
  return items;
}
