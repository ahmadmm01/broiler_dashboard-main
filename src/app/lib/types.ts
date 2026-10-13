export type Zone = "A" | "B" | "C";

export type VideoSourceMode = "dummy" | "rtsp";

export type VideoSourceConfigResponse = {
  mode: VideoSourceMode;
  streamEndpoint: string;
  zones: Record<Zone, { configured: boolean }>;
};

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
  cycleId?: string;
  zone: Zone;
  day: number;
  stdWeightKg: number;
  actualWeightKg: number;
};

export type MortalityEntry = {
  cycleId?: string;
  zone: Zone;
  date: string;
  count: number;
  notes?: string;
};

export type ConsumptionEntry = {
  cycleId?: string;
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
    sourceRecords: number;
    intervalMinutes: number;
  };
};

export type SensorMetric = "temp" | "humidity" | "co2" | "nh3" | "pm25";

export type AlertSeverity = "warning" | "critical";
export type AlertStatus = "active" | "acknowledged" | "resolved";

export type AlertEvent = {
  id: string;
  cycleId?: string;
  zone: Zone;
  metric: SensorMetric;
  label: string;
  timestamp: string;
  value: number;
  threshold: number;
  unit: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  valueLabel?: string;
};

export type CycleStatus = "draft" | "active" | "completed";

export type CycleAuditEvent = {
  id: string;
  type: "started" | "updated" | "completed" | "reopened";
  timestamp: string;
  reason?: string;
};

export type ProductionCycle = {
  id: string;
  zone: Zone;
  houseName: string;
  startDate: string;
  targetHarvestDay: number;
  initialBirds: number;
  initialAverageWeightKg: number;
  harvestedBirds: number;
  notes: string;
  status: CycleStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  actualHarvestDate?: string;
  completionNotes?: string;
  revision: number;
  auditLog: CycleAuditEvent[];
};
