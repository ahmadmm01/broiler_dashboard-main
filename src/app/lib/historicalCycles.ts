import historicalSnapshot from "../data/historicalCycles.json";
import type { CycleAuditEvent, DataPoint } from "./types";

export type HistoricalMortalityRecord = {
  day: number;
  date: string;
  count: number;
};

export type HistoricalFeedWaterRecord = {
  day: number;
  date: string;
  feedKgPerBird: number;
  waterLPerBird: number;
};

export type HistoricalWeightRecord = {
  day: number;
  actualWeightKg: number;
  standardWeightKg: number;
};

export type HistoricalProductionData = {
  initialBirds: number;
  harvestedBirds?: number;
  mortality: HistoricalMortalityRecord[];
  feedWater: HistoricalFeedWaterRecord[];
  weights: HistoricalWeightRecord[];
};

export type HistoricalCycle = {
  key: string;
  id: string;
  label: string;
  status: "Completed";
  harvestDay: number;
  startDate: string;
  endDate: string;
  completedAt?: string;
  completionNotes?: string;
  revision?: number;
  auditLog?: CycleAuditEvent[];
  averages: {
    temp: number;
    humidity: number;
    co2: number;
    nh3: number;
    pm25: number;
  };
  production: HistoricalProductionData;
  data: DataPoint[];
};

type HistoricalDataRow = [
  time: string,
  dayLabel: string,
  ts: number,
  temp: number,
  humidity: number,
  co2: number,
  nh3: number,
  pm25: number,
];

type HistoricalMortalityRow = [day: number, date: string, count: number];
type HistoricalFeedWaterRow = [
  day: number,
  date: string,
  feedKgPerBird: number,
  waterLPerBird: number,
];
type HistoricalWeightRow = [
  day: number,
  actualWeightKg: number,
  standardWeightKg: number,
];

function toDataPoint(row: HistoricalDataRow): DataPoint {
  const [time, pointDayLabel, ts, temp, humidity, co2, nh3, pm25] = row;

  return {
    time,
    dayLabel: pointDayLabel,
    ts,
    temp,
    humidity,
    co2,
    nh3,
    pm25,
  };
}

export function createHistoricalCycles(): HistoricalCycle[] {
  return historicalSnapshot.cycles.map((cycle) => ({
    ...cycle,
    key: cycle.key as HistoricalCycle["key"],
    status: "Completed",
    production: {
      initialBirds: cycle.production.initialBirds,
      harvestedBirds: undefined,
      mortality: cycle.production.mortality.map((row) => {
        const [day, date, count] = row as unknown as HistoricalMortalityRow;
        return { day, date, count };
      }),
      feedWater: cycle.production.feedWater.map((row) => {
        const [day, date, feedKgPerBird, waterLPerBird] =
          row as unknown as HistoricalFeedWaterRow;
        return { day, date, feedKgPerBird, waterLPerBird };
      }),
      weights: cycle.production.weights.map((row) => {
        const [day, actualWeightKg, standardWeightKg] =
          row as unknown as HistoricalWeightRow;
        return { day, actualWeightKg, standardWeightKg };
      }),
    },
    data: cycle.data.map((row) =>
      toDataPoint(row as unknown as HistoricalDataRow)
    ),
  }));
}
