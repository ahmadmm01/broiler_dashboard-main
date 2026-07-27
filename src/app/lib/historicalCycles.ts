import historicalSnapshot from "../data/zoneACompletedCyclesSource.json";
import { standardBroilerFeedKg } from "./broilerStandard";
import { addDays, formatDate } from "./dateUtils";
import { summarizeData } from "./sensorData";
import type { CycleAuditEvent, DataPoint, Zone } from "./types";

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
  standardWeightKg?: number;
};

export type HistoricalProductionData = {
  initialBirds: number;
  harvestedBirds?: number;
  finalBiomassKg?: number;
  finalAdgGPerDay?: number;
  mortality: HistoricalMortalityRecord[];
  feedWater: HistoricalFeedWaterRecord[];
  weights: HistoricalWeightRecord[];
};

export type HistoricalCycle = {
  key: string;
  id: string;
  zone: Zone;
  label: string;
  status: "Completed";
  harvestDay: number;
  startDate: string;
  endDate: string;
  completedAt?: string;
  completionNotes?: string;
  sourceLabel?: string;
  dataIntervalMinutes?: number;
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
  productionZone?: Zone;
  productionByZone?: Partial<Record<Zone, HistoricalProductionData>>;
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
  standardWeightKg?: number,
];

const estimatedFeedWaterProfiles: Record<
  string,
  { targetFcr: number; waterFeedRatio: number }
> = {
  "excel-zone-a-cycle-1": { targetFcr: 1.7, waterFeedRatio: 2.12 },
  "excel-zone-a-cycle-2": { targetFcr: 1.62, waterFeedRatio: 2.08 },
};

function createEstimatedFeedWater(
  cycleKey: string,
  startDate: string,
  weights: HistoricalWeightRecord[]
): HistoricalFeedWaterRecord[] {
  const profile = estimatedFeedWaterProfiles[cycleKey];
  const finalWeightKg = weights.at(-1)?.actualWeightKg;
  if (!profile || !finalWeightKg || weights.length === 0) return [];

  const baseline = weights.map(({ day }) => standardBroilerFeedKg(day));
  const baselineTotal = baseline.reduce((total, value) => total + value, 0);
  const targetFeedTotal = Number(
    (finalWeightKg * profile.targetFcr).toFixed(3)
  );
  const records = weights.map(({ day }, index) => {
    const feedKgPerBird = Number(
      ((baseline[index] / baselineTotal) * targetFeedTotal).toFixed(3)
    );

    return {
      day,
      date: formatDate(addDays(new Date(`${startDate}T00:00:00`), day - 1)),
      feedKgPerBird,
      waterLPerBird: Number(
        (feedKgPerBird * profile.waterFeedRatio).toFixed(3)
      ),
    };
  });
  const roundedTotal = records.reduce(
    (total, record) => total + record.feedKgPerBird,
    0
  );
  const finalRecord = records.at(-1);
  if (finalRecord) {
    finalRecord.feedKgPerBird = Number(
      (finalRecord.feedKgPerBird + targetFeedTotal - roundedTotal).toFixed(3)
    );
    finalRecord.waterLPerBird = Number(
      (finalRecord.feedKgPerBird * profile.waterFeedRatio).toFixed(3)
    );
  }

  return records;
}

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
  return historicalSnapshot.cycles.map((cycle) => {
    const weights = cycle.production.weights.map((row) => {
      const [day, actualWeightKg, standardWeightKg] =
        row as unknown as HistoricalWeightRow;
      return { day, actualWeightKg, standardWeightKg };
    });
    const storedFeedWater = cycle.production.feedWater.map((row) => {
      const [day, date, feedKgPerBird, waterLPerBird] =
        row as unknown as HistoricalFeedWaterRow;
      return { day, date, feedKgPerBird, waterLPerBird };
    });
    const production: HistoricalProductionData = {
      initialBirds: cycle.production.initialBirds,
      harvestedBirds: cycle.production.harvestedBirds,
      finalBiomassKg: cycle.production.finalBiomassKg,
      finalAdgGPerDay: cycle.production.finalAdgGPerDay,
      mortality: cycle.production.mortality.map((row) => {
        const [day, date, count] = row as unknown as HistoricalMortalityRow;
        return { day, date, count };
      }),
      feedWater:
        storedFeedWater.length > 0
          ? storedFeedWater
          : createEstimatedFeedWater(cycle.key, cycle.startDate, weights),
      weights,
    };
    const data = cycle.data.map((row) =>
      toDataPoint(row as unknown as HistoricalDataRow)
    );
    const summary = summarizeData(data);

    return {
      key: cycle.key,
      id: cycle.id,
      zone: "A",
      label: `Zone A · ${cycle.label}`,
      status: "Completed" as const,
      harvestDay: cycle.harvestDay,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      completedAt: cycle.completedAt,
      sourceLabel: cycle.sourceLabel,
      dataIntervalMinutes: cycle.dataIntervalMinutes,
      averages: {
        temp: summary?.temp.avg ?? cycle.averages.temp,
        humidity: summary?.humidity.avg ?? cycle.averages.humidity,
        co2: summary?.co2.avg ?? cycle.averages.co2,
        nh3: summary?.nh3.avg ?? cycle.averages.nh3,
        pm25: summary?.pm25.avg ?? cycle.averages.pm25,
      },
      production,
      productionZone: "A",
      data,
    } satisfies HistoricalCycle;
  });
}
