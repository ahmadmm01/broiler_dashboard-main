import {
  standardBroilerFeedKg,
  standardBroilerWaterL,
  standardBroilerWeight,
} from "./broilerStandard";
import {
  addDays,
  dateToDayNumber,
  formatDate,
} from "./dateUtils";
import { createDemoProductionCycles } from "./cycleAnalytics";
import type { ConsumptionEntry, MortalityEntry, WeightEntry, Zone } from "./types";

const ZONES: Zone[] = ["A", "B", "C"];

function seededUnit(day: number, zone: Zone) {
  const seed = Math.sin(day * 12.9898 + zone.charCodeAt(0) * 78.233) * 43758.5453;
  return seed - Math.floor(seed);
}

export function createDemoWeightEntries(): WeightEntry[] {
  const dummyWeights: WeightEntry[] = [];
  const cycles = createDemoProductionCycles();
  const currentDate = formatDate(new Date());

  ZONES.forEach((zone) => {
    const cycle = cycles[zone];
    const currentDay = dateToDayNumber(currentDate, cycle.startDate);
    for (let day = 1; day <= currentDay; day++) {
      const stdWeight = standardBroilerWeight(day);
      let variance = (seededUnit(day, zone) - 0.5) * 0.025;
      if (zone === "A") variance += 0.006;
      if (zone === "B") variance += 0.025;
      if (zone === "C") variance -= 0.032;

      dummyWeights.push({
        cycleId: cycle.id,
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
  const cycles = createDemoProductionCycles();
  const currentDate = formatDate(new Date());
  const counts: Record<Zone, number[]> = {
    A: [1, 0, 1, 0, 1, 2],
    B: [1, 2, 1, 2, 0, 2],
    C: [0, 1, 0, 1, 2, 1],
  };
  const notes: Partial<Record<Zone, Record<number, string>>> = {
    A: { 29: "Heat wave" },
    B: { 8: "Ventilation issue", 22: "Heat and ventilation stress" },
    C: { 8: "Dust build-up", 13: "Feed contamination" },
  };

  return ZONES.flatMap((zone) => {
    const cycle = cycles[zone];
    const currentDay = dateToDayNumber(currentDate, cycle.startDate);
    const offsets = Array.from(
      new Set([0, 7, 14, 21, 28, currentDay - 1].filter((offset) => offset >= 0 && offset < currentDay))
    ).sort((left, right) => left - right);

    return offsets.map((offset, index) => ({
      cycleId: cycle.id,
      zone,
      date: formatDate(addDays(new Date(`${cycle.startDate}T00:00:00`), offset)),
      count: counts[zone][Math.min(index, counts[zone].length - 1)],
      notes: notes[zone]?.[offset + 1],
    }));
  });
}

export function createDemoConsumptionEntries(): ConsumptionEntry[] {
  const cycles = createDemoProductionCycles();
  const currentDate = formatDate(new Date());
  const feedBase: Record<Zone, number> = { A: 0.99, B: 1.03, C: 0.91 };
  const waterBase: Record<Zone, number> = { A: 0.99, B: 1.04, C: 0.92 };

  return ZONES.flatMap((zone) => {
    const cycle = cycles[zone];
    const currentDay = dateToDayNumber(currentDate, cycle.startDate);

    return Array.from({ length: currentDay }, (_, index) => {
      const day = index + 1;
      const feedStd = standardBroilerFeedKg(day);
      const waterStd = standardBroilerWaterL(day);

      return {
        cycleId: cycle.id,
        zone,
        date: formatDate(addDays(new Date(`${cycle.startDate}T00:00:00`), index)),
        feedKg: +(feedStd * (feedBase[zone] + seededUnit(day, zone) * 0.025)).toFixed(3),
        waterL: +(waterStd * (waterBase[zone] + seededUnit(day + 10, zone) * 0.025)).toFixed(3),
      };
    });
  });
}
