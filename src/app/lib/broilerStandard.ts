export function standardBroilerWeight(day: number): number {
  const standardWeightGram: Record<number, number> = {
    1: 62, 2: 80, 3: 101, 4: 125, 5: 151, 6: 181, 7: 214,
    8: 250, 9: 289, 10: 333, 11: 379, 12: 429, 13: 483,
    14: 540, 15: 601, 16: 665, 17: 732, 18: 803, 19: 876,
    20: 953, 21: 1033, 22: 1115, 23: 1200, 24: 1287,
    25: 1377, 26: 1468, 27: 1562, 28: 1657, 29: 1754,
    30: 1853, 31: 1952, 32: 2053, 33: 2154, 34: 2257,
    35: 2360, 36: 2463, 37: 2567,
  };

  const safeDay = Math.max(1, Math.min(day, 37));
  return +(standardWeightGram[safeDay] / 1000).toFixed(3);
}

// Ross 308 AP as-hatched performance objective (2022), daily intake per living bird.
// Replace this configured pilot baseline if the farm uses another breed objective.
const DAILY_FEED_GRAM: Record<number, number> = {
  1: 12, 2: 16, 3: 20, 4: 24, 5: 27, 6: 31, 7: 35, 8: 39,
  9: 44, 10: 48, 11: 53, 12: 58, 13: 63, 14: 68, 15: 73,
  16: 79, 17: 84, 18: 90, 19: 96, 20: 101, 21: 107, 22: 113,
  23: 119, 24: 125, 25: 131, 26: 137, 27: 142, 28: 148,
  29: 154, 30: 159, 31: 164, 32: 170, 33: 175, 34: 180,
  35: 184, 36: 189, 37: 193,
};

export function standardBroilerFeedKg(day: number): number {
  const safeDay = Math.max(1, Math.min(day, 37));
  return +(DAILY_FEED_GRAM[safeDay] / 1000).toFixed(3);
}

export function standardBroilerWaterL(day: number): number {
  return +(standardBroilerFeedKg(day) * 2.2).toFixed(3);
}
