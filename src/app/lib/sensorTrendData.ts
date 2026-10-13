import { isSensorAtOrAboveLimit } from "./alertRules";
import type { DataPoint, SensorMetric } from "./types";

export type SensorTrendMode = "raw" | "hourly" | "daily" | "weekly" | "monthly";
export type SensorTrendPoint = DataPoint & {
  label: string;
  rawCount: number;
  peaks: Record<SensorMetric, number>;
};

const metrics: SensorMetric[] = ["temp", "humidity", "co2", "nh3", "pm25"];

function displayedTimeAsUtc(time: string) {
  const calendarTime = time.slice(0, 16).replace(" ", "T");
  return Date.parse(`${calendarTime}${calendarTime.length === 10 ? "T00:00:00" : ":00"}Z`);
}

function periodKey(point: DataPoint, mode: Exclude<SensorTrendMode, "raw">) {
  const date = point.time.slice(0, 10);
  if (mode === "hourly") return `${date} ${point.time.slice(11, 13)}:00`;
  if (mode === "monthly") return `${date.slice(0, 7)}-01`;
  if (mode === "weekly") {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day.toISOString().slice(0, 10);
  }
  return date;
}

export function aggregateSensorReadings(data: DataPoint[], mode: SensorTrendMode): SensorTrendPoint[] {
  if (mode === "raw") {
    return data.map((point) => ({
      ...point,
      label: point.time.slice(5, 16).replace("-", "/"),
      rawCount: 1,
      peaks: Object.fromEntries(metrics.map((metric) => [metric, point[metric]])) as Record<SensorMetric, number>,
    }));
  }

  const groups = new Map<string, { first: DataPoint; count: number; sums: Record<SensorMetric, number>; peaks: Record<SensorMetric, number> }>();
  for (const point of data) {
    const key = periodKey(point, mode);
    let group = groups.get(key);
    if (!group) {
      group = {
        first: point,
        count: 0,
        sums: { temp: 0, humidity: 0, co2: 0, nh3: 0, pm25: 0 },
        peaks: { temp: -Infinity, humidity: -Infinity, co2: -Infinity, nh3: -Infinity, pm25: -Infinity },
      };
      groups.set(key, group);
    }
    group.count += 1;
    for (const metric of metrics) {
      group.sums[metric] += point[metric];
      group.peaks[metric] = Math.max(group.peaks[metric], point[metric]);
    }
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => ({
    ...group.first,
    ts: group.first.ts + displayedTimeAsUtc(key) - displayedTimeAsUtc(group.first.time),
    time: key,
    dayLabel: key.slice(5, 10).replace("-", "/"),
    label: mode === "hourly" ? `${key.slice(5, 10).replace("-", "/")} ${key.slice(11)}` : key.slice(5, 10).replace("-", "/"),
    ...Object.fromEntries(metrics.map((metric) => [metric, group.sums[metric] / group.count])),
    rawCount: group.count,
    peaks: group.peaks,
  }));
}

// Retain every bucket's extrema so a plotted raw sample cannot hide its peak.
export function sampleSensorTrend(points: SensorTrendPoint[], maxPoints = 2000): SensorTrendPoint[] {
  if (points.length <= maxPoints) return points;
  const bucketCount = Math.max(1, Math.floor(maxPoints / (metrics.length * 2 + 2)));
  const stride = Math.ceil(points.length / bucketCount);
  const selected = new Set<number>();
  for (let start = 0; start < points.length; start += stride) {
    const end = Math.min(points.length, start + stride);
    selected.add(start);
    selected.add(end - 1);
    for (const metric of metrics) {
      let minimum = start;
      let maximum = start;
      for (let index = start + 1; index < end; index += 1) {
        if (points[index][metric] < points[minimum][metric]) minimum = index;
        if (points[index][metric] > points[maximum][metric]) maximum = index;
      }
      selected.add(minimum);
      selected.add(maximum);
    }
  }
  return [...selected].sort((left, right) => left - right).map((index) => points[index]);
}

export function summarizeSensorMetric(data: DataPoint[], plotted: DataPoint[], metric: SensorMetric) {
  let total = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  let exceedances = 0;
  let episodeCount = 0;
  let wasOutside = false;
  for (const point of data) {
    total += point[metric];
    minimum = Math.min(minimum, point[metric]);
    maximum = Math.max(maximum, point[metric]);
    const outside = isSensorAtOrAboveLimit(metric, point[metric]);
    if (outside) exceedances += 1;
    if (outside && !wasOutside) episodeCount += 1;
    wasOutside = outside;
  }
  return {
    average: data.length ? total / data.length : 0,
    minimum: data.length ? minimum : 0,
    maximum: data.length ? maximum : 0,
    latest: data.at(-1)?.[metric] ?? 0,
    exceedances,
    episodeCount,
    plottedExceedances: plotted.filter((point) => isSensorAtOrAboveLimit(metric, point[metric])).length,
  };
}
