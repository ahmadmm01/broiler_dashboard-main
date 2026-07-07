export type Zone = "A" | "B" | "C";

export type DataPoint = {
  time: string;
  dayLabel: string;
  ts: number;
  temp: number;
  humidity: number;
  co2: number;
  nh3: number;
  pm25: number;
};

export type WeightEntry = {
  zone: Zone;
  day: number;
  stdWeightKg: number;
  actualWeightKg: number;
};

export type MortalityEntry = {
  zone: Zone;
  date: string;
  count: number;
  notes?: string;
};

export type ConsumptionEntry = {
  zone: Zone;
  date: string;
  feedKg: number;
  waterL: number;
};

export type LiveCard = {
  label: string;
  value: number;
  unit: string;
  limit: number;
  icon: string;
  color: "red" | "orange" | "yellow" | "green";
};

export type RawSensorItem = {
  Timestamp: string;
  "Temperature (°C)": string | number;
  "Humidity (%)": string | number;
  "CO2 (ppm)"?: string | number;
  "CO₂ (ppm)"?: string | number;
  "Ammonia (ppm)": string | number;
  "PM2.5 (µg/m³)": string | number;
};

export type MortalitySummaryRow = {
  date: string;
  A: number;
  B: number;
  C: number;
};

export type SensorApiResponse = {
  data: DataPoint[];
  meta: {
    sourceStart: string;
    sourceEnd: string;
    runtimeStart: string;
    runtimeEnd: string;
    records: number;
  };
};
