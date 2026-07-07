import type { RawSensorItem } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEMO_SENSOR_SPAN_DAYS = 36;

export const startOfDay = (date = new Date()) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseDateOnly = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const diffDays = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);

export const getDemoWindowStart = () =>
  addDays(startOfDay(), -DEMO_SENSOR_SPAN_DAYS);

export const dateToDayNumber = (date: string, startDate: string) =>
  Math.max(1, diffDays(parseDateOnly(startDate), parseDateOnly(date)) + 1);

export const dayLabel = (date: Date) =>
  `${date.getDate()}/${date.getMonth() + 1}`;

export const compareDateStrings = (a: string, b: string) =>
  parseDateOnly(a).getTime() - parseDateOnly(b).getTime();

export function getRollingSensorRange(json: RawSensorItem[], target = new Date()) {
  const dates = json.map((item) => parseDateOnly(item.Timestamp));
  const sourceStart = new Date(Math.min(...dates.map((date) => date.getTime())));
  const sourceEnd = new Date(Math.max(...dates.map((date) => date.getTime())));
  const targetEnd = startOfDay(target);
  const targetStart = addDays(targetEnd, -diffDays(sourceStart, sourceEnd));

  return { sourceStart, sourceEnd, targetStart, targetEnd };
}
