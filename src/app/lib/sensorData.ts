import {
  addDays,
  dayLabel,
  diffDays,
  formatDate,
  getRollingSensorRange,
  parseDateOnly,
} from "./dateUtils";
import type { DataPoint, RawSensorItem } from "./types";

export function mapRawSensorItems(
  json: RawSensorItem[],
  targetDate = new Date()
): DataPoint[] {
  const rollingRange =
    json.length > 0 ? getRollingSensorRange(json, targetDate) : null;

  return json.map((item) => {
    const sourceDate = parseDateOnly(item.Timestamp);
    const date = rollingRange
      ? addDays(
          rollingRange.targetStart,
          diffDays(rollingRange.sourceStart, sourceDate)
        )
      : sourceDate;
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
