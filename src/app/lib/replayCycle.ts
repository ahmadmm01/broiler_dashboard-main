import { standardBroilerWeight } from "./broilerStandard";
import type {
  HistoricalCycle,
  HistoricalProductionData,
} from "./historicalCycles";
import type {
  ConsumptionEntry,
  MortalityEntry,
  ProductionCycle,
  WeightEntry,
  Zone,
} from "./types";

const ALL_ZONES: Zone[] = ["A", "B", "C"];

export function createReplayCycles(
  source: HistoricalCycle
): Record<Zone, ProductionCycle> {
  const sourceSummary = source.production.sourceSummary;
  const startedAt = `${source.startDate}T00:00:00.000Z`;

  return Object.fromEntries(
    ALL_ZONES.map((zone) => [
      zone,
      {
        id: `REPLAY-B${sourceSummary?.batch ?? source.id}-${zone}`,
        zone,
        houseName: "Poultry House 1",
        startDate: source.startDate,
        targetHarvestDay: sourceSummary?.averageAgeDays ?? source.harvestDay,
        initialBirds: source.production.initialBirds,
        initialAverageWeightKg: 0.044,
        harvestedBirds: 0,
        notes: "Stored production cycle replay.",
        status: "active",
        createdAt: startedAt,
        updatedAt: startedAt,
        revision: 1,
        auditLog: [
          {
            id: `replay-started-${zone}-${startedAt}`,
            type: "started",
            timestamp: startedAt,
            reason: `Stored cycle replay initialized for Zone ${zone}.`,
          },
        ],
      } satisfies ProductionCycle,
    ])
  ) as Record<Zone, ProductionCycle>;
}

export function sliceReplayProduction(
  production: HistoricalProductionData,
  replayDay: number
): HistoricalProductionData {
  return {
    initialBirds: production.initialBirds,
    mortality: production.mortality.filter((record) => record.day <= replayDay),
    feedWater: production.feedWater.filter((record) => record.day <= replayDay),
    weights: production.weights.filter((record) => record.day <= replayDay),
  };
}

export function createReplayProductionRecords(
  source: HistoricalCycle,
  replayDay: number,
  cyclesByZone: Record<Zone, ProductionCycle>
): {
  mortality: MortalityEntry[];
  consumptions: ConsumptionEntry[];
  weights: WeightEntry[];
} {
  const production = sliceReplayProduction(source.production, replayDay);

  return {
    mortality: ALL_ZONES.flatMap((zone) =>
      production.mortality.map((record) => ({
        cycleId: cyclesByZone[zone].id,
        zone,
        date: record.date,
        count: record.count,
      }))
    ),
    consumptions: ALL_ZONES.flatMap((zone) =>
      production.feedWater.map((record) => ({
        cycleId: cyclesByZone[zone].id,
        zone,
        date: record.date,
        feedKg: record.feedKgPerBird,
        waterL: record.waterLPerBird,
      }))
    ),
    weights: ALL_ZONES.flatMap((zone) =>
      production.weights.map((record) => ({
        cycleId: cyclesByZone[zone].id,
        zone,
        day: record.day,
        stdWeightKg:
          record.standardWeightKg ?? standardBroilerWeight(record.day),
        actualWeightKg: record.actualWeightKg,
      }))
    ),
  };
}
