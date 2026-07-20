import historicalSnapshot from "../data/historicalCycles.json";
import {
  addDays,
  DAY_MS,
  dayLabel,
  formatDate,
  formatDateTime,
  parseDateOnly,
} from "./dateUtils";
import { interpolateSensorSeries, summarizeData } from "./sensorData";
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
  zone: Zone;
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
  standardWeightKg: number,
];

function toDataPoint(
  row: HistoricalDataRow,
  zone: Zone,
  dateOffset: number
): DataPoint {
  const [time, pointDayLabel, ts, temp, humidity, co2, nh3, pm25] = row;
  const shiftedTs = ts + dateOffset * DAY_MS;
  const shiftedDate = new Date(shiftedTs);
  const sensorOffset = historicalZoneProfiles[zone].sensorOffset;

  return {
    time: dateOffset === 0 ? time : formatDateTime(shiftedDate),
    dayLabel: dateOffset === 0 ? pointDayLabel : dayLabel(shiftedDate),
    ts: shiftedTs,
    temp: Number((temp + sensorOffset.temp).toFixed(2)),
    humidity: Number((humidity + sensorOffset.humidity).toFixed(2)),
    co2: Math.round(co2 + sensorOffset.co2),
    nh3: Number((nh3 + sensorOffset.nh3).toFixed(2)),
    pm25: Number((pm25 + sensorOffset.pm25).toFixed(2)),
  };
}

const historicalZoneProfiles: Record<
  Zone,
  {
    mortalityScale: number;
    mortalityPulseModulo: number;
    feedScale: number;
    waterScale: number;
    weightScale: number;
    sensorOffset: {
      temp: number;
      humidity: number;
      co2: number;
      nh3: number;
      pm25: number;
    };
  }
> = {
  A: {
    mortalityScale: 0.92,
    mortalityPulseModulo: 6,
    feedScale: 0.98,
    waterScale: 0.99,
    weightScale: 0.99,
    sensorOffset: { temp: -0.35, humidity: -1.1, co2: -42, nh3: -0.2, pm25: -1.4 },
  },
  B: {
    mortalityScale: 1.12,
    mortalityPulseModulo: 4,
    feedScale: 1.04,
    waterScale: 1.05,
    weightScale: 1.015,
    sensorOffset: { temp: 0.55, humidity: 1.3, co2: 95, nh3: 0.35, pm25: 1.8 },
  },
  C: {
    mortalityScale: 0.84,
    mortalityPulseModulo: 5,
    feedScale: 0.94,
    waterScale: 0.95,
    weightScale: 0.97,
    sensorOffset: { temp: -0.1, humidity: 0.4, co2: -18, nh3: -0.08, pm25: 2.6 },
  },
};

const historicalZoneDateOffsets: Record<Zone, number> = {
  A: -18,
  B: -9,
  C: 0,
};

function shiftDate(value: string, offset: number) {
  return formatDate(addDays(parseDateOnly(value), offset));
}

function createHistoricalZoneProduction(
  production: HistoricalProductionData,
  zone: Zone,
  dateOffset: number
): HistoricalProductionData {
  const profile = historicalZoneProfiles[zone];

  return {
    initialBirds: production.initialBirds,
    harvestedBirds: production.harvestedBirds,
    mortality: production.mortality.map((record) => ({
      ...record,
      date: shiftDate(record.date, dateOffset),
      count:
        record.count === 0
          ? 0
          : Math.max(
              1,
              Math.round(
                record.count * profile.mortalityScale +
                  (record.day % profile.mortalityPulseModulo === 0 ? 1 : 0)
              )
            ),
    })),
    feedWater: production.feedWater.map((record) => ({
      ...record,
      date: shiftDate(record.date, dateOffset),
      feedKgPerBird: Number(
        (record.feedKgPerBird * profile.feedScale).toFixed(3)
      ),
      waterLPerBird: Number(
        (record.waterLPerBird * profile.waterScale).toFixed(3)
      ),
    })),
    weights: production.weights.map((record) => ({
      ...record,
      actualWeightKg: Number(
        (record.actualWeightKg * profile.weightScale).toFixed(3)
      ),
    })),
  };
}

export function createHistoricalCycles(): HistoricalCycle[] {
  return historicalSnapshot.cycles.flatMap((cycle) => {
    const production: HistoricalProductionData = {
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
    };

    return (["A", "B", "C"] as Zone[]).map((zone) => {
      const dateOffset = historicalZoneDateOffsets[zone];
      const startDate = shiftDate(cycle.startDate, dateOffset);
      const endDate = shiftDate(cycle.endDate, dateOffset);
      const zoneProduction = createHistoricalZoneProduction(
        production,
        zone,
        dateOffset
      );
      const data = interpolateSensorSeries(
        cycle.data.map((row) =>
          toDataPoint(row as unknown as HistoricalDataRow, zone, dateOffset)
        ),
        1
      );
      const summary = summarizeData(data);

      return {
        ...cycle,
        key: `${cycle.key}:${zone}`,
        id: `CYCLE-${zone}-${startDate.replaceAll("-", "")}`,
        zone,
        label: `Zone ${zone} · ${cycle.label}`,
        status: "Completed" as const,
        startDate,
        endDate,
        averages: {
          temp: summary?.temp.avg ?? cycle.averages.temp,
          humidity: summary?.humidity.avg ?? cycle.averages.humidity,
          co2: summary?.co2.avg ?? cycle.averages.co2,
          nh3: summary?.nh3.avg ?? cycle.averages.nh3,
          pm25: summary?.pm25.avg ?? cycle.averages.pm25,
        },
        production: zoneProduction,
        productionZone: zone,
        data,
      } satisfies HistoricalCycle;
    });
  });
}
