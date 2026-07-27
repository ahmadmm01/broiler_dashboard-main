import type { HarvestSummary } from "./cycleAnalytics";
import { dateToDayNumber } from "./dateUtils";
import { summarizeData } from "./sensorData";
import type {
  HistoricalCycle,
  HistoricalProductionData,
} from "./historicalCycles";
import type {
  AlertEvent,
  ConsumptionEntry,
  DataPoint,
  MortalityEntry,
  ProductionCycle,
  WeightEntry,
  Zone,
} from "./types";

export type StartCycleInput = {
  id: string;
  houseName: string;
  startDate: string;
  targetHarvestDay: number;
  initialBirds: number;
  initialAverageWeightKg: number;
  notes: string;
};

export type CompleteCycleInput = {
  harvestDate: string;
  harvestedBirds: number;
  notes: string;
};

function auditId(type: string, timestamp: string) {
  return `${type}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeProductionCycle(
  value: ProductionCycle,
  fallbackZone: Zone = value.zone ?? "A"
): ProductionCycle {
  const fallbackTimestamp = `${value.startDate}T00:00:00.000Z`;
  const createdAt = value.createdAt || fallbackTimestamp;
  const legacyDemoId = `CYCLE-${value.startDate.replaceAll("-", "")}`;
  const normalizedId =
    value.id === legacyDemoId &&
    value.notes === "Pilot cycle prepared for operational review."
      ? `CYCLE-ACTIVE-${value.startDate.replaceAll("-", "")}`
      : value.id;

  return {
    ...value,
    zone: value.zone ?? fallbackZone,
    id: normalizedId,
    status: value.status ?? "active",
    createdAt,
    updatedAt: value.updatedAt || createdAt,
    revision:
      value.status === "draft"
        ? Math.max(0, value.revision || 0)
        : Math.max(1, value.revision || 1),
    auditLog:
      value.status === "draft"
        ? value.auditLog ?? []
        : value.auditLog?.length > 0
          ? value.auditLog
          : [
              {
                id: `started-${createdAt}`,
                type: "started",
                timestamp: createdAt,
                reason: "Legacy cycle migrated into lifecycle management.",
              },
            ],
  };
}

export function startProductionCycle(
  input: StartCycleInput,
  zone: Zone,
  timestamp = new Date().toISOString()
): ProductionCycle {
  return {
    id: input.id.trim(),
    zone,
    houseName: input.houseName.trim(),
    startDate: input.startDate,
    targetHarvestDay: Math.max(1, input.targetHarvestDay),
    initialBirds: Math.max(0, input.initialBirds),
    initialAverageWeightKg: Math.max(0, input.initialAverageWeightKg),
    harvestedBirds: 0,
    notes: input.notes.trim(),
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
    auditLog: [
      {
        id: auditId("started", timestamp),
        type: "started",
        timestamp,
        reason: "Production cycle started.",
      },
    ],
  };
}

export function updateProductionCycle(
  current: ProductionCycle,
  changes: ProductionCycle,
  timestamp = new Date().toISOString()
): ProductionCycle {
  return {
    ...current,
    ...changes,
    id: current.id,
    status: current.status,
    createdAt: current.createdAt,
    completedAt: current.completedAt,
    actualHarvestDate: current.actualHarvestDate,
    completionNotes: current.completionNotes,
    updatedAt: timestamp,
    revision: current.revision + 1,
    auditLog: [
      ...current.auditLog,
      {
        id: auditId("updated", timestamp),
        type: "updated",
        timestamp,
        reason: "Cycle metadata updated.",
      },
    ],
  };
}

export function completeProductionCycle(
  current: ProductionCycle,
  input: CompleteCycleInput,
  timestamp = new Date().toISOString()
): ProductionCycle {
  return {
    ...current,
    status: "completed",
    harvestedBirds: Math.max(0, input.harvestedBirds),
    actualHarvestDate: input.harvestDate,
    completionNotes: input.notes.trim(),
    completedAt: timestamp,
    updatedAt: timestamp,
    revision: current.revision + 1,
    auditLog: [
      ...current.auditLog,
      {
        id: auditId("completed", timestamp),
        type: "completed",
        timestamp,
        reason: input.notes.trim() || "Cycle completion confirmed.",
      },
    ],
  };
}

export function reopenProductionCycle(
  current: ProductionCycle,
  reason: string,
  timestamp = new Date().toISOString()
): ProductionCycle {
  return {
    ...current,
    status: "active",
    harvestedBirds: 0,
    completedAt: undefined,
    actualHarvestDate: undefined,
    completionNotes: undefined,
    updatedAt: timestamp,
    revision: current.revision + 1,
    auditLog: [
      ...current.auditLog,
      {
        id: auditId("reopened", timestamp),
        type: "reopened",
        timestamp,
        reason: reason.trim(),
      },
    ],
  };
}

export function buildHistoricalCycleSnapshot({
  cycle,
  summary,
  sensorData,
  mortality,
  consumptions,
  weights,
  zone,
}: {
  cycle: ProductionCycle;
  summary: HarvestSummary;
  sensorData: DataPoint[];
  mortality: MortalityEntry[];
  consumptions: ConsumptionEntry[];
  weights: WeightEntry[];
  alerts: AlertEvent[];
  zone: Zone;
}): HistoricalCycle {
  const sensor = summarizeData(sensorData);
  const endDate =
    cycle.actualHarvestDate ??
    cycle.completedAt?.slice(0, 10) ??
    sensorData.at(-1)?.time.slice(0, 10) ??
    cycle.startDate;
  const harvestDay = Math.max(
    1,
    cycle.actualHarvestDate
      ? dateToDayNumber(cycle.actualHarvestDate, cycle.startDate)
      : summary.cycleDay
  );
  const buildZoneProduction = (): HistoricalProductionData => {
    const mortalityByDate = new Map<string, number>();

    mortality
      .filter(
        (entry) =>
          entry.cycleId === cycle.id &&
          entry.zone === zone &&
          entry.date >= cycle.startDate &&
          entry.date <= endDate
      )
      .forEach((entry) => {
        mortalityByDate.set(
          entry.date,
          (mortalityByDate.get(entry.date) ?? 0) + entry.count
        );
      });

    return {
      initialBirds: cycle.initialBirds,
      harvestedBirds: cycle.harvestedBirds || summary.survivingBirds,
      mortality: Array.from(mortalityByDate.entries())
        .map(([date, count]) => ({
          day: dateToDayNumber(date, cycle.startDate),
          date,
          count,
        }))
        .sort((a, b) => a.day - b.day),
      feedWater: consumptions
        .filter(
          (entry) =>
            entry.cycleId === cycle.id &&
            entry.zone === zone &&
            entry.date >= cycle.startDate &&
            entry.date <= endDate
        )
        .map((entry) => ({
          day: dateToDayNumber(entry.date, cycle.startDate),
          date: entry.date,
          feedKgPerBird: entry.feedKg,
          waterLPerBird: entry.waterL,
        }))
        .sort((a, b) => a.day - b.day),
      weights: weights
        .filter(
          (entry) =>
            entry.cycleId === cycle.id &&
            entry.zone === zone &&
            entry.day <= harvestDay
        )
        .map((entry) => ({
          day: entry.day,
          actualWeightKg: entry.actualWeightKg,
          standardWeightKg: entry.stdWeightKg,
        }))
        .sort((a, b) => a.day - b.day),
    };
  };
  const production = buildZoneProduction();

  return {
    key: `managed:${zone}:${cycle.id}`,
    id: cycle.id,
    zone,
    label: `Zone ${zone} · Managed cycle`,
    status: "Completed",
    harvestDay,
    startDate: cycle.startDate,
    endDate,
    completedAt: cycle.completedAt,
    completionNotes: cycle.completionNotes,
    revision: cycle.revision,
    auditLog: cycle.auditLog.map((event) => ({ ...event })),
    averages: {
      temp: sensor?.temp.avg ?? 0,
      humidity: sensor?.humidity.avg ?? 0,
      co2: Math.round(sensor?.co2.avg ?? 0),
      nh3: sensor?.nh3.avg ?? 0,
      pm25: sensor?.pm25.avg ?? 0,
    },
    production,
    productionZone: zone,
    data: sensorData.map((point) => ({ ...point })),
  };
}
