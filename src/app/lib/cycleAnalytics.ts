import {
  addDays,
  dateToDayNumber,
  formatDate,
  getDemoWindowStart,
} from "./dateUtils";
import { summarizeData } from "./sensorData";
import { countSensorAlertEpisodes } from "./alertRules";
import type {
  AlertEvent,
  ConsumptionEntry,
  DataPoint,
  MortalityEntry,
  ProductionCycle,
  WeightEntry,
  Zone,
} from "./types";

export type SensorHealthSummary = {
  status: "Healthy" | "Review Required";
  completeness: number;
  expectedRecords: number;
  receivedRecords: number;
  largestGapHours: number;
  issueCount: number;
};

export type HarvestSummary = {
  cycleDay: number;
  totalMortality: number;
  mortalityRate: number;
  survivingBirds: number;
  harvestedBirds: number;
  finalAverageWeightKg: number;
  hasWeightReference: boolean;
  weightVariancePercent: number;
  totalLiveWeightKg: number;
  totalFeedPerBirdKg: number;
  totalWaterPerBirdL: number;
  estimatedFeedKg: number;
  estimatedWaterL: number;
  fcr: number;
  waterFeedRatio: number;
  averageDailyGainGram: number;
  alertCount: number;
  sensorHealth: SensorHealthSummary;
};

const demoZoneStartOffsets: Record<Zone, number> = {
  A: 0,
  B: 7,
  C: 16,
};

export function createDraftProductionCycles(): Record<Zone, ProductionCycle> {
  const draftDate = formatDate(new Date());
  const draftTimestamp = `${draftDate}T00:00:00.000Z`;

  return Object.fromEntries(
    (["A", "B", "C"] as Zone[]).map((zone) => [
      zone,
      {
        id: `PENDING-${zone}`,
        zone,
        houseName: "Poultry House 1",
        startDate: draftDate,
        targetHarvestDay: 37,
        initialBirds: 25000,
        initialAverageWeightKg: 0.044,
        harvestedBirds: 0,
        notes: "",
        status: "draft",
        createdAt: draftTimestamp,
        updatedAt: draftTimestamp,
        revision: 0,
        auditLog: [],
      } satisfies ProductionCycle,
    ])
  ) as unknown as Record<Zone, ProductionCycle>;
}

export function createInitialProductionCycles(): Record<
  Zone,
  ProductionCycle
> {
  const cycles = createDraftProductionCycles();
  const startDate = formatDate(addDays(new Date(), -9));
  const startedAt = `${startDate}T00:00:00.000Z`;

  cycles.A = {
    ...cycles.A,
    id: `CYCLE-A-${startDate.replaceAll("-", "")}`,
    startDate,
    notes: "",
    status: "active",
    createdAt: startedAt,
    updatedAt: startedAt,
    revision: 1,
    auditLog: [
      {
        id: `started-A-${startedAt}`,
        type: "started",
        timestamp: startedAt,
        reason: "Production cycle started for Zone A.",
      },
    ],
  };

  return cycles;
}

export function createDemoProductionCycles(): Record<Zone, ProductionCycle> {
  const windowStart = getDemoWindowStart();

  return Object.fromEntries(
    (["A", "B", "C"] as Zone[]).map((zone) => {
      const startDate = formatDate(addDays(windowStart, demoZoneStartOffsets[zone]));
      const startedAt = `${startDate}T00:00:00.000Z`;

      return [
        zone,
        {
          id: `CYCLE-${zone}-ACTIVE-${startDate.replaceAll("-", "")}`,
          zone,
          houseName: "Poultry House 1",
          startDate,
          targetHarvestDay: 37,
          initialBirds: 5000,
          initialAverageWeightKg: 0.044,
          harvestedBirds: 0,
          notes: "Pilot cycle prepared for operational review.",
          status: "active",
          createdAt: startedAt,
          updatedAt: startedAt,
          revision: 1,
          auditLog: [
            {
              id: `started-${zone}-${startedAt}`,
              type: "started",
              timestamp: startedAt,
              reason: `Demo production cycle initialized for Zone ${zone}.`,
            },
          ],
        } satisfies ProductionCycle,
      ];
    })
  ) as Record<Zone, ProductionCycle>;
}

export function createDemoProductionCycle(): ProductionCycle {
  return createDemoProductionCycles().A;
}

export function calculateSensorHealth(
  data: DataPoint[],
  targetHarvestDay: number,
  expectedIntervalMinutes = 1
): SensorHealthSummary {
  const normalizedIntervalMinutes = Math.max(1, expectedIntervalMinutes);
  const expectedRecords =
    data.length > 1
      ? Math.max(
          1,
          Math.round(
            (data.at(-1)!.ts - data[0].ts) /
              (normalizedIntervalMinutes * 60 * 1000)
          ) + 1
        )
      : Math.max(
          1,
          Math.round(
            (targetHarvestDay * 24 * 60) / normalizedIntervalMinutes
          )
        );
  const receivedRecords = data.length;
  const completeness = Math.min(100, (receivedRecords / expectedRecords) * 100);
  const gaps = data
    .slice(1)
    .map((point, index) => (point.ts - data[index].ts) / (60 * 60 * 1000));
  const largestGapHours = gaps.length ? Math.max(...gaps) : 0;
  const issueCount =
    Number(completeness < 95) +
    Number(largestGapHours > (normalizedIntervalMinutes * 1.5) / 60);

  return {
    status: issueCount ? "Review Required" : "Healthy",
    completeness,
    expectedRecords,
    receivedRecords,
    largestGapHours,
    issueCount,
  };
}

export function calculateHarvestSummary({
  cycle,
  mortality,
  consumptions,
  weights,
  sensorData,
  alerts,
  zone,
  sensorIntervalMinutes = 1,
}: {
  cycle: ProductionCycle;
  mortality: MortalityEntry[];
  consumptions: ConsumptionEntry[];
  weights: WeightEntry[];
  sensorData: DataPoint[];
  alerts: AlertEvent[];
  zone: Zone;
  sensorIntervalMinutes?: number;
}): HarvestSummary {
  const houseMortality = mortality.filter((entry) => entry.zone === zone);
  const houseConsumptions = consumptions.filter((entry) => entry.zone === zone);
  const houseWeights = weights
    .filter((entry) => entry.zone === zone)
    .sort((a, b) => a.day - b.day);
  const finalWeight = houseWeights.at(-1);
  const latestSensorDate = sensorData.at(-1)?.time.slice(0, 10);
  const sensorCycleDay = latestSensorDate
    ? dateToDayNumber(latestSensorDate, cycle.startDate)
    : 0;
  const cycleDay = Math.max(1, finalWeight?.day ?? 0, sensorCycleDay);
  const totalMortality = houseMortality.reduce((sum, entry) => sum + entry.count, 0);
  const survivingBirds = Math.max(0, cycle.initialBirds - totalMortality);
  const harvestedBirds = cycle.harvestedBirds > 0
    ? cycle.harvestedBirds
    : survivingBirds;
  const totalFeedPerBirdKg = houseConsumptions.reduce(
    (sum, entry) => sum + entry.feedKg,
    0
  );
  const totalWaterPerBirdL = houseConsumptions.reduce(
    (sum, entry) => sum + entry.waterL,
    0
  );
  const finalAverageWeightKg = finalWeight?.actualWeightKg ?? 0;
  const standardWeightKg = finalWeight?.stdWeightKg ?? 0;
  const hasWeightReference = standardWeightKg > 0;
  const weightGainKg = Math.max(
    0,
    finalAverageWeightKg - cycle.initialAverageWeightKg
  );
  const averageBirds = (cycle.initialBirds + survivingBirds) / 2;

  return {
    cycleDay,
    totalMortality,
    mortalityRate: cycle.initialBirds
      ? (totalMortality / cycle.initialBirds) * 100
      : 0,
    survivingBirds,
    harvestedBirds,
    finalAverageWeightKg,
    hasWeightReference,
    weightVariancePercent: hasWeightReference
      ? ((finalAverageWeightKg - standardWeightKg) / standardWeightKg) * 100
      : 0,
    totalLiveWeightKg: harvestedBirds * finalAverageWeightKg,
    totalFeedPerBirdKg,
    totalWaterPerBirdL,
    estimatedFeedKg: totalFeedPerBirdKg * averageBirds,
    estimatedWaterL: totalWaterPerBirdL * averageBirds,
    fcr: finalAverageWeightKg ? totalFeedPerBirdKg / finalAverageWeightKg : 0,
    waterFeedRatio: totalFeedPerBirdKg
      ? totalWaterPerBirdL / totalFeedPerBirdKg
      : 0,
    averageDailyGainGram: cycleDay
      ? (weightGainKg * 1000) / cycleDay
      : 0,
    alertCount: Math.max(alerts.length, countSensorAlertEpisodes(sensorData)),
    sensorHealth: calculateSensorHealth(
      sensorData,
      cycleDay,
      sensorIntervalMinutes
    ),
  };
}

export function buildDeterministicCycleSummary(
  cycle: ProductionCycle,
  harvest: HarvestSummary,
  sensorData: DataPoint[]
) {
  const sensor = summarizeData(sensorData);
  const observations: string[] = [];
  if (harvest.mortalityRate > 3) {
    observations.push("Mortality requires review against the farm target.");
  } else {
    observations.push("Mortality remains controlled for the recorded cycle.");
  }
  if (!harvest.hasWeightReference) {
    observations.push(
      "No configured standard-weight reference was supplied for this cycle."
    );
  } else if (harvest.weightVariancePercent < -5) {
    observations.push("Final average weight is below the configured standard.");
  } else {
    observations.push("Final average weight is close to or above the configured standard.");
  }
  if (harvest.sensorHealth.issueCount) {
    observations.push("Sensor completeness or sampling gaps require verification.");
  }

  return `# Cycle Summary\n${cycle.houseName} completed a ${harvest.cycleDay}-day review with ${harvest.survivingBirds.toLocaleString()} birds remaining and ${harvest.mortalityRate.toFixed(2)}% recorded mortality.\n\n# Key Observations\n- ${observations.join("\n- ")}\n- Average temperature was ${sensor?.temp.avg.toFixed(2) ?? "-"} °C and average CO₂ was ${sensor?.co2.avg.toFixed(0) ?? "-"} ppm.\n- ${harvest.alertCount} alert events were recorded.\n\n# Possible Causes\nEnvironmental peaks, ventilation performance, litter moisture, feed intake, and sensor availability should be reviewed together before assigning a single cause.\n\n# Recommended Actions\n- Review alert periods against CCTV and daily farm notes.\n- Verify ventilation, cooling, litter condition, feed delivery, and water availability.\n- Confirm final bird count and weight before signing the harvest report.\n- Treat this summary as decision support and confirm findings through physical inspection.`;
}
