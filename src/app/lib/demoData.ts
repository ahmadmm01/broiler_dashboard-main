import {
  standardBroilerFeedKg,
  standardBroilerWaterL,
  standardBroilerWeight,
} from "./broilerStandard";
import { addDays, formatDate, getDemoWindowStart } from "./dateUtils";
import type { ConsumptionEntry, MortalityEntry, WeightEntry, Zone } from "./types";

const ZONES: Zone[] = ["A", "B", "C"];

function seededUnit(day: number, zone: Zone) {
  const seed = Math.sin(day * 12.9898 + zone.charCodeAt(0) * 78.233) * 43758.5453;
  return seed - Math.floor(seed);
}

export function createDemoWeightEntries(): WeightEntry[] {
  const dummyWeights: WeightEntry[] = [];

  ZONES.forEach((zone) => {
    for (let day = 1; day <= 37; day++) {
      const stdWeight = standardBroilerWeight(day);
      let variance = (seededUnit(day, zone) - 0.5) * 0.025;
      if (zone === "A") variance += 0.006;
      if (zone === "B") variance += 0.025;
      if (zone === "C") variance -= 0.032;

      dummyWeights.push({
        zone,
        day,
        stdWeightKg: stdWeight,
        actualWeightKg: +(stdWeight * (1 + variance)).toFixed(3),
      });
    }
  });

  return dummyWeights;
}

export function createDemoMortalityEntries(): MortalityEntry[] {
  const startDate = getDemoWindowStart();
  const weekly = [0, 7, 14, 21, 28, 35, 36].map((offset) =>
    formatDate(addDays(startDate, offset))
  );

  return [
    { zone: "A", date: weekly[0], count: 1 },
    { zone: "B", date: weekly[0], count: 1 },
    { zone: "C", date: weekly[0], count: 0 },
    { zone: "A", date: weekly[1], count: 0 },
    { zone: "B", date: weekly[1], count: 2, notes: "Ventilation issue" },
    { zone: "C", date: weekly[1], count: 1 },
    { zone: "A", date: weekly[2], count: 1 },
    { zone: "B", date: weekly[2], count: 1 },
    { zone: "C", date: weekly[2], count: 0 },
    { zone: "A", date: weekly[3], count: 0 },
    { zone: "B", date: weekly[3], count: 2 },
    { zone: "C", date: weekly[3], count: 1, notes: "Dust build-up" },
    { zone: "A", date: weekly[4], count: 1 },
    { zone: "B", date: weekly[4], count: 0 },
    { zone: "C", date: weekly[4], count: 2, notes: "Feed contamination" },
    { zone: "A", date: weekly[5], count: 0 },
    { zone: "B", date: weekly[5], count: 1 },
    { zone: "C", date: weekly[5], count: 0 },
    { zone: "A", date: weekly[6], count: 2, notes: "Heat wave" },
    {
      zone: "B",
      date: weekly[6],
      count: 2,
      notes: "Heat and ventilation stress",
    },
    { zone: "C", date: weekly[6], count: 1 },
  ];
}

export function createDemoConsumptionEntries(): ConsumptionEntry[] {
  const startDate = getDemoWindowStart();
  const dates = Array.from({ length: 37 }, (_, index) =>
    formatDate(addDays(startDate, index))
  );

  return dates.flatMap((date, index) => {
    const day = index + 1;
    const feedStd = standardBroilerFeedKg(day);
    const waterStd = standardBroilerWaterL(day);

    return [
      {
        zone: "A" as const,
        date,
        feedKg: +(feedStd * (0.99 + seededUnit(day, "A") * 0.02)).toFixed(3),
        waterL: +(waterStd * (0.99 + seededUnit(day + 10, "A") * 0.02)).toFixed(3),
      },
      {
        zone: "B" as const,
        date,
        feedKg: +(feedStd * (1.03 + seededUnit(day, "B") * 0.025)).toFixed(3),
        waterL: +(waterStd * (1.04 + seededUnit(day + 10, "B") * 0.025)).toFixed(3),
      },
      {
        zone: "C" as const,
        date,
        feedKg: +(feedStd * (0.91 + seededUnit(day, "C") * 0.025)).toFixed(3),
        waterL: +(waterStd * (0.92 + seededUnit(day + 10, "C") * 0.025)).toFixed(3),
      },
    ];
  });
}
