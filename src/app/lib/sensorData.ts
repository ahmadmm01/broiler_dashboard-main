import {
  addDays,
  dayLabel,
  diffDays,
  formatDateTime,
  getRollingSensorRange,
  parseDateOnly,
} from "./dateUtils";
import type { DataPoint, RawSensorItem, Zone } from "./types";

const SENSOR_MINUTE_MS = 60 * 1000;
const SENSOR_METRICS = ["temp", "humidity", "co2", "nh3", "pm25"] as const;

const metricAmplitude: Record<(typeof SENSOR_METRICS)[number], number> = {
  temp: 0.08,
  humidity: 0.18,
  co2: 5,
  nh3: 0.015,
  pm25: 0.08,
};

const metricPhase: Record<(typeof SENSOR_METRICS)[number], number> = {
  temp: 0.4,
  humidity: 1.2,
  co2: 2.1,
  nh3: 2.8,
  pm25: 3.6,
};

const roundSensorMetric = (
  metric: (typeof SENSOR_METRICS)[number],
  value: number
) => (metric === "co2" ? Math.round(value) : round(value, 2));

const clampSensorMetric = (
  metric: (typeof SENSOR_METRICS)[number],
  value: number
) => {
  if (metric === "humidity") return clamp(value, 0, 100);
  if (metric === "temp") return clamp(value, -20, 60);
  return Math.max(0, value);
};

export function mapRawSensorItems(
  json: RawSensorItem[],
  targetDate = new Date()
): DataPoint[] {
  const rollingRange =
    json.length > 0 ? getRollingSensorRange(json, targetDate) : null;
  const timestampTotals = new Map<string, number>();
  const timestampSeen = new Map<string, number>();

  json.forEach((item) => {
    timestampTotals.set(
      item.Timestamp,
      (timestampTotals.get(item.Timestamp) ?? 0) + 1
    );
  });

  return json.map((item) => {
    const sourceDate = parseDateOnly(item.Timestamp);
    const date = rollingRange
      ? addDays(
          rollingRange.targetStart,
          diffDays(rollingRange.sourceStart, sourceDate)
        )
      : sourceDate;
    const duplicateCount = timestampTotals.get(item.Timestamp) ?? 1;
    const duplicateIndex = timestampSeen.get(item.Timestamp) ?? 0;
    timestampSeen.set(item.Timestamp, duplicateIndex + 1);

    if (duplicateCount > 1) {
      date.setMinutes(
        date.getMinutes() + Math.round((duplicateIndex * 24 * 60) / duplicateCount)
      );
    }

    const timestamp = formatDateTime(date);

    return {
      time: timestamp,
      dayLabel: dayLabel(date),
      ts: date.getTime(),
      temp: Number(item["Temperature (°C)"]),
      humidity: Number(item["Humidity (%)"]),
      co2: Number(item["CO₂ (ppm)"] ?? item["CO2 (ppm)"] ?? 0),
      nh3: Number(item["Ammonia (ppm)"]),
      pm25: Number(item["PM2.5 (µg/m³)"]),
    };
  });
}

export function alignSensorSeriesEnd(
  data: DataPoint[],
  targetDate = new Date()
): DataPoint[] {
  const latest = data.at(-1);
  if (!latest) return data;

  const alignedEnd = new Date(targetDate);
  alignedEnd.setSeconds(0, 0);
  const shiftMs = alignedEnd.getTime() - latest.ts;

  return data.map((point) => {
    const shiftedDate = new Date(point.ts + shiftMs);
    return {
      ...point,
      ts: shiftedDate.getTime(),
      time: formatDateTime(shiftedDate),
      dayLabel: dayLabel(shiftedDate),
    };
  });
}

export function interpolateSensorSeries(
  data: DataPoint[],
  intervalMinutes = 1
): DataPoint[] {
  if (data.length <= 1) return data;

  const intervalMs = Math.max(1, intervalMinutes) * SENSOR_MINUTE_MS;
  const sorted = [...data].sort((left, right) => left.ts - right.ts);
  const interpolated: DataPoint[] = [];
  let generatedIndex = 0;

  for (let pairIndex = 0; pairIndex < sorted.length - 1; pairIndex += 1) {
    const current = sorted[pairIndex];
    const next = sorted[pairIndex + 1];
    const gapMs = next.ts - current.ts;

    if (gapMs <= 0) continue;

    for (
      let timestamp = current.ts;
      timestamp < next.ts;
      timestamp += intervalMs
    ) {
      const progress = (timestamp - current.ts) / gapMs;
      const smoothProgress = progress * progress * (3 - 2 * progress);
      const envelope = Math.sin(Math.PI * progress);
      const date = new Date(timestamp);
      const point: DataPoint = {
        time: formatDateTime(date),
        dayLabel: dayLabel(date),
        ts: timestamp,
        temp: 0,
        humidity: 0,
        co2: 0,
        nh3: 0,
        pm25: 0,
      };

      SENSOR_METRICS.forEach((metric) => {
        const baseline =
          current[metric] + (next[metric] - current[metric]) * smoothProgress;
        const microVariation =
          envelope *
          Math.sin(generatedIndex * 0.19 + metricPhase[metric]) *
          metricAmplitude[metric];
        point[metric] = roundSensorMetric(
          metric,
          clampSensorMetric(metric, baseline + microVariation)
        );
      });

      interpolated.push(point);
      generatedIndex += 1;
    }
  }

  interpolated.push(sorted.at(-1)!);
  return interpolated;
}

export function createNextRealtimeSensorPoint(
  previous: DataPoint,
  sequence: number
): DataPoint {
  const date = new Date(previous.ts + SENSOR_MINUTE_MS);
  const next: DataPoint = {
    ...previous,
    ts: date.getTime(),
    time: formatDateTime(date),
    dayLabel: dayLabel(date),
  };

  SENSOR_METRICS.forEach((metric) => {
    const phase = metricPhase[metric];
    const frequency = metric === "co2" ? 0.11 : 0.08;
    const boundedDelta =
      metricAmplitude[metric] *
      (Math.sin((sequence + 1) * frequency + phase) -
        Math.sin(sequence * frequency + phase));
    next[metric] = roundSensorMetric(
      metric,
      clampSensorMetric(metric, previous[metric] + boundedDelta)
    );
  });

  return next;
}

export function summarizeData(data: DataPoint[]) {
  if (data.length === 0) return null;

  const avg = (key: keyof DataPoint) =>
    data.reduce((a, b) => a + (b[key] as number), 0) / data.length;

  const max = (key: keyof DataPoint) =>
    Math.max(...data.map((d) => d[key] as number));

  const min = (key: keyof DataPoint) =>
    Math.min(...data.map((d) => d[key] as number));

  return {
    temp: { avg: avg("temp"), min: min("temp"), max: max("temp") },
    humidity: {
      avg: avg("humidity"),
      min: min("humidity"),
      max: max("humidity"),
    },
    co2: { avg: avg("co2"), max: max("co2") },
    nh3: { avg: avg("nh3"), max: max("nh3") },
    pm25: { avg: avg("pm25"), max: max("pm25") },
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const round = (value: number, decimals = 2) =>
  +value.toFixed(decimals);

export function getZonePoint(
  point: DataPoint,
  index: number,
  total: number,
  zone: Zone
): DataPoint {
  const progress = total <= 1 ? 1 : index / (total - 1);
  const lateCyclePulse = Math.pow(progress, 4);
  const wave = Math.sin(index * 0.45 + zone.charCodeAt(0));

  if (zone === "A") {
    return {
      ...point,
      temp: round(clamp(point.temp + wave * 0.15, 24, 34.5)),
      humidity: round(clamp(point.humidity - 0.5 + wave * 0.35, 50, 88)),
      co2: Math.round(clamp(point.co2 + 8 + wave * 8, 350, 1350)),
      nh3: round(
        Math.max(0, point.nh3 + 0.02 + wave * 0.03)
      ),
      pm25: round(clamp(point.pm25 - 0.4 + wave * 0.35, 0, 42)),
    };
  }

  if (zone === "B") {
    return {
      ...point,
      temp: round(
        clamp(point.temp + 0.65 + wave * 0.25 + lateCyclePulse * 3.35, 24, 34.5)
      ),
      humidity: round(
        clamp(point.humidity + 1.8 + wave * 0.45 + lateCyclePulse * 3, 50, 88)
      ),
      co2: Math.round(
        clamp(point.co2 + 65 + wave * 15 + lateCyclePulse * 570, 350, 1350)
      ),
      nh3: round(
        Math.max(
          0,
          point.nh3 + 0.18 + wave * 0.05 + lateCyclePulse * 1.15
        )
      ),
      pm25: round(
        clamp(point.pm25 + 1.2 + wave * 0.45 + lateCyclePulse * 1.2, 0, 42)
      ),
    };
  }

  return {
    ...point,
    temp: round(clamp(point.temp - 0.45 + wave * 0.18, 24, 34.5)),
    humidity: round(clamp(point.humidity - 2.2 + wave * 0.4, 50, 88)),
    co2: Math.round(clamp(point.co2 - 35 + wave * 10, 350, 1350)),
    nh3: round(
      Math.max(0, point.nh3 - 0.08 + wave * 0.04)
    ),
    pm25: round(
      clamp(point.pm25 + 1.8 + wave * 0.55 + lateCyclePulse * 9.5, 0, 42)
    ),
  };
}

export function createZoneData(data: DataPoint[]): Record<Zone, DataPoint[]> {
  return {
    A: data.map((point, index) => getZonePoint(point, index, data.length, "A")),
    B: data.map((point, index) => getZonePoint(point, index, data.length, "B")),
    C: data.map((point, index) => getZonePoint(point, index, data.length, "C")),
  };
}
