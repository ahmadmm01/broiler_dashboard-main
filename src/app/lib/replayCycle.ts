import type {
  HistoricalCycle,
  HistoricalProductionData,
} from "./historicalCycles";
import { getZonePoint } from "./sensorData";
import type {
  DataPoint,
  ConsumptionEntry,
  MortalityEntry,
  ProductionCycle,
  WeightEntry,
  Zone,
} from "./types";

const ALL_ZONES: Zone[] = ["A", "B", "C"];

export function getReplayZonePoint(point: DataPoint, index: number, total: number, zone: Zone, sourceZone: Zone = "A") {
  return zone === sourceZone ? point : getZonePoint(point, index, total, zone);
}

export function createReplayCycles(
  source: HistoricalCycle
): Record<Zone, ProductionCycle> {
  const sourceSummary = source.production.sourceSummary;
  const startedAt = `${source.startDate}T00:00:00.000Z`;

  return Object.fromEntries(
    ALL_ZONES.map((zone) => [
      zone,
      {
        id: `BATCH-${sourceSummary?.batch ?? source.id}-${zone}`,
        zone,
        houseName: "Poultry House 1",
        startDate: source.startDate,
        targetHarvestDay: sourceSummary?.averageAgeDays ?? source.harvestDay,
        initialBirds: source.production.initialBirds,
        initialAverageWeightKg: 0.044,
        harvestedBirds: 0,
        notes: "Last cycle production monitoring data.",
        status: "active",
        createdAt: startedAt,
        updatedAt: startedAt,
        revision: 1,
        auditLog: [
          {
            id: `replay-started-${zone}-${startedAt}`,
            type: "started",
            timestamp: startedAt,
            reason: `Cycle monitoring initialized for Zone ${zone}.`,
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
        // The supplied farm summary includes actual average weight but no
        // standard-weight curve. Keep that reference unavailable during replay
        // instead of introducing an unrelated Ross target into the risk score.
        stdWeightKg: record.standardWeightKg ?? 0,
        actualWeightKg: record.actualWeightKg,
      }))
    ),
  };
}
