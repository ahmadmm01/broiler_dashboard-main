import { standardBroilerWeight } from "./broilerStandard";
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
    for (let day = 1; day <= 30; day++) {
      const stdWeight = standardBroilerWeight(day);
      let variance = (seededUnit(day, zone) - 0.5) * 0.06;
      if (zone === "B") variance += 0.01;
      if (zone === "C") variance -= 0.01;

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
    { zone: "A", date: weekly[0], count: 2, notes: "Heat stress" },
    { zone: "B", date: weekly[0], count: 1 },
    { zone: "C", date: weekly[0], count: 0 },

    { zone: "A", date: weekly[1], count: 0 },
    { zone: "B", date: weekly[1], count: 3, notes: "Ventilation issue" },
    { zone: "C", date: weekly[1], count: 1 },

    { zone: "A", date: weekly[2], count: 1 },
    { zone: "B", date: weekly[2], count: 1 },
    { zone: "C", date: weekly[2], count: 0 },

    { zone: "A", date: weekly[3], count: 0 },
    { zone: "B", date: weekly[3], count: 2 },
    { zone: "C", date: weekly[3], count: 1, notes: "High NH3 levels" },

    { zone: "A", date: weekly[4], count: 1 },
    { zone: "B", date: weekly[4], count: 0 },
    { zone: "C", date: weekly[4], count: 2, notes: "Feed contamination" },

    { zone: "A", date: weekly[5], count: 0 },
    { zone: "B", date: weekly[5], count: 1 },
    { zone: "C", date: weekly[5], count: 0 },

    { zone: "A", date: weekly[6], count: 2, notes: "Heat wave" },
    { zone: "B", date: weekly[6], count: 2 },
    { zone: "C", date: weekly[6], count: 1 },
  ];
}

export function createDemoConsumptionEntries(): ConsumptionEntry[] {
  const startDate = getDemoWindowStart();
  const dates = Array.from({ length: 5 }, (_, index) =>
    formatDate(addDays(startDate, index))
  );

  return [
    { zone: "A", date: dates[0], feedKg: 0.06, waterL: 0.13 },
    { zone: "B", date: dates[0], feedKg: 0.061, waterL: 0.131 },
    { zone: "C", date: dates[0], feedKg: 0.059, waterL: 0.129 },

    { zone: "A", date: dates[1], feedKg: 0.07, waterL: 0.15 },
    { zone: "B", date: dates[1], feedKg: 0.071, waterL: 0.152 },
    { zone: "C", date: dates[1], feedKg: 0.069, waterL: 0.148 },

    { zone: "A", date: dates[2], feedKg: 0.08, waterL: 0.18 },
    { zone: "B", date: dates[2], feedKg: 0.081, waterL: 0.182 },
    { zone: "C", date: dates[2], feedKg: 0.079, waterL: 0.178 },

    { zone: "A", date: dates[3], feedKg: 0.1, waterL: 0.21 },
    { zone: "B", date: dates[3], feedKg: 0.102, waterL: 0.212 },
    { zone: "C", date: dates[3], feedKg: 0.098, waterL: 0.208 },

    { zone: "A", date: dates[4], feedKg: 0.12, waterL: 0.25 },
    { zone: "B", date: dates[4], feedKg: 0.121, waterL: 0.252 },
    { zone: "C", date: dates[4], feedKg: 0.119, waterL: 0.248 },
  ];
}
