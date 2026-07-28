import { standardBroilerWeight } from "./broilerStandard";
import { createInitialProductionCycles } from "./cycleAnalytics";
import { addDays, formatDate, parseDateOnly } from "./dateUtils";
import { createHistoricalCycles } from "./historicalCycles";
import type {
  ConsumptionEntry,
  MortalityEntry,
  WeightEntry,
} from "./types";

const INITIAL_CURRENT_CYCLE_DAY = 10;

export type InitialCurrentCycleRecords = {
  mortality: MortalityEntry[];
  consumptions: ConsumptionEntry[];
  weights: WeightEntry[];
};

export function createInitialCurrentCycleRecords(): InitialCurrentCycleRecords {
  const currentCycle = createInitialProductionCycles().A;
  const latestCompletedCycle = createHistoricalCycles()
    .filter((cycle) => cycle.zone === "A")
    .sort((left, right) => right.endDate.localeCompare(left.endDate))[0];

  if (!latestCompletedCycle) {
    return { mortality: [], consumptions: [], weights: [] };
  }

  const currentStart = parseDateOnly(currentCycle.startDate);
  const dateForDay = (day: number) =>
    formatDate(addDays(currentStart, day - 1));

  return {
    mortality: latestCompletedCycle.production.mortality
      .filter((record) => record.day <= INITIAL_CURRENT_CYCLE_DAY)
      .map((record) => ({
        cycleId: currentCycle.id,
        zone: "A",
        date: dateForDay(record.day),
        count: record.count,
      })),
    consumptions: latestCompletedCycle.production.feedWater
      .filter((record) => record.day <= INITIAL_CURRENT_CYCLE_DAY)
      .map((record) => ({
        cycleId: currentCycle.id,
        zone: "A",
        date: dateForDay(record.day),
        feedKg: record.feedKgPerBird,
        waterL: record.waterLPerBird,
      })),
    weights: latestCompletedCycle.production.weights
      .filter((record) => record.day <= INITIAL_CURRENT_CYCLE_DAY)
      .map((record) => ({
        cycleId: currentCycle.id,
        zone: "A",
        day: record.day,
        stdWeightKg: standardBroilerWeight(record.day),
        actualWeightKg: record.actualWeightKg,
      })),
  };
}
