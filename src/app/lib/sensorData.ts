import {
  addDays,
  dayLabel,
  diffDays,
  formatDate,
  getRollingSensorRange,
  parseDateOnly,
} from "./dateUtils";
import type { DataPoint, RawSensorItem, Zone } from "./types";

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

    const timestamp = formatDate(date);

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
      nh3: round(clamp(point.nh3 + 0.02 + wave * 0.03, 0, 5.8)),
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
        clamp(point.nh3 + 0.18 + wave * 0.05 + lateCyclePulse * 1.15, 0, 5.8)
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
    nh3: round(clamp(point.nh3 - 0.08 + wave * 0.04, 0, 5.8)),
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
