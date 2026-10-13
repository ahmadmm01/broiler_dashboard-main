import source from "../data/zoneACompletedCyclesSource.json";
import { SENSOR_ALERT_RULES, isSensorAtOrAboveLimit } from "./alertRules";
import { dateToDayNumber } from "./dateUtils";
import { aggregateSensorReadings } from "./sensorTrendData";
import type { HistoricalCycle } from "./historicalCycles";
import type { SensorMetric } from "./types";

export const RESEARCH_METRICS: SensorMetric[] = [
  "temp",
  "humidity",
  "co2",
  "nh3",
  "pm25",
];

export const RESEARCH_METRIC_META: Record<
  SensorMetric,
  { label: string; shortLabel: string; unit: string; color: string; decimals: number }
> = {
  temp: {
    label: "Temperature",
    shortLabel: "Temp.",
    unit: "°C",
    color: "#ef4444",
    decimals: 2,
  },
  humidity: {
    label: "Humidity",
    shortLabel: "RH",
    unit: "% RH",
    color: "#2563eb",
    decimals: 2,
  },
  co2: {
    label: "Carbon dioxide",
    shortLabel: "CO₂",
    unit: "ppm",
    color: "#7c3aed",
    decimals: 0,
  },
  nh3: {
    label: "Ammonia",
    shortLabel: "NH₃",
    unit: "ppm",
    color: "#d97706",
    decimals: 2,
  },
  pm25: {
    label: "Particulate matter",
    shortLabel: "PM2.5",
    unit: "µg/m³",
    color: "#475569",
    decimals: 2,
  },
};

type SourceDataRow = [
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
];

type SourceDailySummaryRow = [
  number,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number | null,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type ResearchReading = {
  day: number;
  time: string;
  ts: number;
  temp: number;
  humidity: number;
  co2: number;
  nh3: number;
  pm25: number;
};

export type ResearchDailyRecord = {
  day: number;
  date: string;
  dailyMortality: number;
  cumulativeMortality: number;
  cumulativeMortalityPercent: number;
  averageWeightKg: number | null;
  adgGPerDay: number | null;
  temp: number;
  humidity: number;
  co2: number;
  nh3: number;
  pm25: number;
};

export type ResearchCycle = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  harvestDay: number;
  intervalMinutes: number;
  readingsPerDay: number;
  readings: ResearchReading[];
  daily: ResearchDailyRecord[];
  mode?: "past" | "replay";
  targetDay?: number;
};

export function createDashboardAnalysisCycle(cycle: HistoricalCycle, mode: "past" | "replay" = "past", replayDay = cycle.harvestDay): ResearchCycle {
  const readings = cycle.data.map((point) => ({ ...point, day: dateToDayNumber(point.time, cycle.startDate) }));
  const dailyAverages = aggregateSensorReadings(cycle.data, "daily");
  let cumulativeMortality = 0;
  const daily: ResearchDailyRecord[] = dailyAverages.map((point) => {
    const day = dateToDayNumber(point.time, cycle.startDate);
    const dailyMortality = cycle.production.mortality.filter((record) => record.day === day).reduce((total, record) => total + record.count, 0);
    cumulativeMortality += dailyMortality;
    const weight = cycle.production.weights.find((record) => record.day === day);
    const previousWeight = [...cycle.production.weights].reverse().find((record) => record.day < day);
    return {
      day,
      date: point.time.slice(0, 10),
      dailyMortality,
      cumulativeMortality,
      cumulativeMortalityPercent: cycle.production.initialBirds ? cumulativeMortality / cycle.production.initialBirds * 100 : 0,
      averageWeightKg: weight?.actualWeightKg ?? null,
      adgGPerDay: weight && previousWeight ? (weight.actualWeightKg - previousWeight.actualWeightKg) * 1000 / (weight.day - previousWeight.day) : null,
      temp: point.temp,
      humidity: point.humidity,
      co2: point.co2,
      nh3: point.nh3,
      pm25: point.pm25,
    };
  });
  const intervalMinutes = cycle.dataIntervalMinutes ?? 1;
  return {
    id: cycle.id,
    label: `${cycle.label} · ${mode === "past" ? "Past cycle" : `Replay · Day ${replayDay}`}`,
    startDate: cycle.startDate,
    endDate: mode === "replay" ? cycle.data.at(-1)?.time.slice(0, 10) ?? cycle.startDate : cycle.endDate,
    harvestDay: mode === "replay" ? replayDay : cycle.harvestDay,
    targetDay: cycle.harvestDay,
    intervalMinutes,
    readingsPerDay: 1440 / intervalMinutes,
    readings,
    daily,
    mode,
  };
}

const metricIndex: Record<SensorMetric, number> = {
  temp: 3,
  humidity: 4,
  co2: 5,
  nh3: 6,
  pm25: 7,
};

export const RESEARCH_CYCLES: ResearchCycle[] = source.cycles.map((cycle) => {
  const readings = (cycle.data as SourceDataRow[]).map((row, index) => ({
    day: Math.floor(index / source.source.readingsPerDay) + 1,
    time: row[0],
    ts: row[2],
    temp: row[3],
    humidity: row[4],
    co2: row[5],
    nh3: row[6],
    pm25: row[7],
  }));
  const daily = (cycle.production.dailySummary as SourceDailySummaryRow[]).map(
    (row) => ({
      day: row[0],
      date: row[1],
      dailyMortality: row[3],
      cumulativeMortality: row[4],
      cumulativeMortalityPercent: row[5],
      averageWeightKg: row[7],
      adgGPerDay: row[8],
      temp: row[10],
      humidity: row[11],
      co2: row[12],
      nh3: row[13],
      pm25: row[14],
    })
  );

  return {
    id: cycle.id,
    label: cycle.label,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    harvestDay: cycle.harvestDay,
    intervalMinutes: cycle.dataIntervalMinutes,
    readingsPerDay: source.source.readingsPerDay,
    readings,
    daily,
  };
});

export function mean(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

export function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
      (values.length - 1)
  );
}

export function pearsonCorrelation(x: number[], y: number[]) {
  const size = Math.min(x.length, y.length);
  if (size < 3) return null;
  const xValues = x.slice(0, size);
  const yValues = y.slice(0, size);
  const xMean = mean(xValues);
  const yMean = mean(yValues);
  let numerator = 0;
  let xSquares = 0;
  let ySquares = 0;

  for (let index = 0; index < size; index += 1) {
    const xDelta = xValues[index] - xMean;
    const yDelta = yValues[index] - yMean;
    numerator += xDelta * yDelta;
    xSquares += xDelta ** 2;
    ySquares += yDelta ** 2;
  }

  const denominator = Math.sqrt(xSquares * ySquares);
  return denominator ? numerator / denominator : null;
}

export function getCorrelationMatrix(cycle: ResearchCycle) {
  return Object.fromEntries(
    RESEARCH_METRICS.map((rowMetric) => [
      rowMetric,
      Object.fromEntries(
        RESEARCH_METRICS.map((columnMetric) => [
          columnMetric,
          pearsonCorrelation(
            cycle.readings.map((reading) => reading[rowMetric]),
            cycle.readings.map((reading) => reading[columnMetric])
          ),
        ])
      ),
    ])
  ) as Record<SensorMetric, Record<SensorMetric, number | null>>;
}

export function getDailyThresholdMap(cycle: ResearchCycle) {
  return RESEARCH_METRICS.map((metric) => ({
    metric,
    days: Array.from({ length: cycle.harvestDay }, (_, dayIndex) => {
      const readings = cycle.readings.filter(
        (reading) => reading.day === dayIndex + 1
      );
      const exceedances = readings.filter(
        (reading) => isSensorAtOrAboveLimit(metric, reading[metric])
      ).length;
      return {
        day: dayIndex + 1,
        exceedances,
        total: readings.length,
        share: readings.length ? exceedances / readings.length : 0,
      };
    }),
  }));
}

export function getEpisodeSummary(cycle: ResearchCycle) {
  return RESEARCH_METRICS.map((metric) => {
    const threshold = SENSOR_ALERT_RULES[metric].threshold;
    let episodes = 0;
    let currentRun = 0;
    let longestRun = 0;
    let readingsAbove = 0;

    cycle.readings.forEach((reading) => {
      if (isSensorAtOrAboveLimit(metric, reading[metric])) {
        readingsAbove += 1;
        currentRun += 1;
        if (currentRun === 1) episodes += 1;
        longestRun = Math.max(longestRun, currentRun);
      } else {
        currentRun = 0;
      }
    });

    return {
      metric,
      threshold,
      readingsAbove,
      exceedancePercent: cycle.readings.length
        ? (readingsAbove / cycle.readings.length) * 100
        : 0,
      episodes,
      longestRun,
    };
  });
}

export function getCycleMetricSummary(cycle: ResearchCycle, metric: SensorMetric) {
  const values = cycle.readings.map((reading) => reading[metric]);
  const average = mean(values);
  const deviation = standardDeviation(values);
  const readingsAbove = values.filter(
    (value) => isSensorAtOrAboveLimit(metric, value)
  ).length;
  return {
    average,
    deviation,
    coefficientOfVariation: average ? (deviation / average) * 100 : 0,
    minimum: values.length ? Math.min(...values) : 0,
    maximum: values.length ? Math.max(...values) : 0,
    readingsAbove,
    exceedancePercent: values.length ? (readingsAbove / values.length) * 100 : 0,
  };
}

export function getDatasetCoverage(cycle: ResearchCycle) {
  const expected = cycle.readings.length > 0
    ? Math.round((cycle.readings.at(-1)!.ts - cycle.readings[0].ts) / (cycle.intervalMinutes * 60 * 1000)) + 1
    : 0;
  return {
    expected,
    received: cycle.readings.length,
    completeness: expected ? (cycle.readings.length / expected) * 100 : 0,
  };
}

export function getOutcomeAssociations(cycle: ResearchCycle) {
  return RESEARCH_METRICS.map((metric) => {
    const adgRows = cycle.daily.filter(
      (row): row is ResearchDailyRecord & { adgGPerDay: number } =>
        typeof row.adgGPerDay === "number"
    );
    return {
      metric,
      mortality: pearsonCorrelation(
        cycle.daily.map((row) => row[metric]),
        cycle.daily.map((row) => row.dailyMortality)
      ),
      adg: pearsonCorrelation(
        adgRows.map((row) => row[metric]),
        adgRows.map((row) => row.adgGPerDay)
      ),
    };
  });
}

export function getSourceMetricIndex(metric: SensorMetric) {
  return metricIndex[metric];
}
