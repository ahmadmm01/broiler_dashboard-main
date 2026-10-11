/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { standardBroilerWeight } from "./lib/broilerStandard";
import {
  addDays,
  dateToDayNumber,
  formatDate,
  formatDateTime,
} from "./lib/dateUtils";
import {
  createNextRealtimeSensorPoint,
  createZoneData,
  getZonePoint,
  interpolateSensorSeries,
} from "./lib/sensorData";
import {
  createHistoricalCycles,
  type HistoricalCycle,
  type HistoricalProductionData,
} from "./lib/historicalCycles";
import type {
  ConsumptionEntry,
  DataPoint,
  LiveCard,
  MortalityEntry,
  ProductionCycle,
  SensorApiResponse,
  SensorMetric,
  WeightEntry,
  Zone,
} from "./lib/types";
import { usePersistentState } from "./lib/usePersistentState";
import { createInitialCurrentCycleRecords } from "./lib/currentCycleSeed";
import CameraFeed from "./components/CameraFeed";
import DailyProductionLog, {
  type DailyProductionLogInput,
} from "./components/DailyProductionLog";
import ProductionCyclePanel from "./components/ProductionCyclePanel";
import CurrentCyclePrediction, {
  type CurrentCyclePredictionInput,
} from "./components/CurrentCyclePrediction";
import CurrentCycleSensorTrends from "./components/CurrentCycleSensorTrends";
import SensorTrendCard from "./components/SensorTrendCard";
import HistoricalCycleAiAnalysis from "./components/HistoricalCycleAiAnalysis";
import HistoricalProductionOverview from "./components/HistoricalProductionOverview";
import OverviewReplayInsight from "./components/OverviewReplayInsight";
import ProductionPerformanceCharts, {
  type ProductionPerformanceSeries,
} from "./components/ProductionPerformanceCharts";
import { SENSOR_ALERT_RULES } from "./lib/alertRules";
import {
  calculateHarvestSummary,
  createDraftProductionCycles,
  createInitialProductionCycles,
  type HarvestSummary,
} from "./lib/cycleAnalytics";
import {
  buildHistoricalCycleSnapshot,
  completeProductionCycle,
  normalizeProductionCycle,
  reopenProductionCycle,
  startProductionCycle,
  updateProductionCycle,
  type CompleteCycleInput,
  type StartCycleInput,
} from "./lib/cycleLifecycle";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardNavigationProvider, {
  useDashboardNavigation,
} from "./components/dashboard/DashboardNavigationProvider";
import DashboardShell from "./components/dashboard/DashboardShell";
import DashboardTabPanel from "./components/dashboard/DashboardTabPanel";
import DashboardToolbar from "./components/dashboard/DashboardToolbar";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ScatterChart,
  Scatter,
} from "recharts";
import {
  assessCurrentCycleRisk,
  type CycleRiskAssessment,
} from "./lib/cyclePrediction";
import { downloadCycleReportPdf } from "./lib/reportPdf";
import {
  buildCurrentCycleReportModel,
  buildHistoricalCycleReportModel,
} from "./lib/cycleReportModels";
import type {
  CurrentCycleReportAnalysisSnapshot,
  HistoricalCycleReportAnalysisSnapshot,
} from "./lib/reportAnalysis";
import { useCycleAlerts } from "./hooks/useCycleAlerts";
import {
  createReplayCycles,
  createReplayProductionRecords,
  sliceReplayProduction,
} from "./lib/replayCycle";

// ========= Helpers =========

const configuredReplayInterval = Number(
  process.env.NEXT_PUBLIC_SENSOR_REPLAY_INTERVAL_MS ?? 60_000
);
const REALTIME_INTERVAL_MS =
  Number.isFinite(configuredReplayInterval) && configuredReplayInterval >= 60_000
    ? configuredReplayInterval
    : 60_000;
const OPERATIONAL_STATUS =
  process.env.NEXT_PUBLIC_OPERATIONAL_STATUS?.trim().toLowerCase() ===
  "inactive"
    ? "inactive"
    : "active";
const IS_OPERATIONAL = OPERATIONAL_STATUS === "active";
const IS_REPLAY_MODE = !IS_OPERATIONAL;
const REPLAY_INTERVAL_MS = 1_800;
const SENSOR_LAST_RECORDED_AT =
  process.env.NEXT_PUBLIC_SENSOR_LAST_RECORDED_AT?.trim() ?? "";
const ALL_ZONES: Zone[] = ["A", "B", "C"];
const SENSOR_METRICS: SensorMetric[] = [
  "temp",
  "humidity",
  "co2",
  "nh3",
  "pm25",
];
const SENSOR_METRIC_COLORS: Record<SensorMetric, string> = {
  temp: "#ef4444",
  humidity: "#2563eb",
  co2: "#7c3aed",
  nh3: "#d97706",
  pm25: "#475569",
};
const configuredZones = (process.env.NEXT_PUBLIC_ACTIVE_ZONES ?? "A,B,C")
  .split(",")
  .map((zone) => zone.trim().toUpperCase())
  .filter((zone): zone is Zone => ALL_ZONES.includes(zone as Zone));
const ACTIVE_ZONES: Zone[] = Array.from(new Set(configuredZones));
if (ACTIVE_ZONES.length === 0) ACTIVE_ZONES.push(...ALL_ZONES);
const IS_SINGLE_ZONE = ACTIVE_ZONES.length === 1;

type AggregationMode = "all" | "hourly" | "daily" | "weekly" | "monthly";
type TrendDatum = {
  ts: number;
  time: string;
  dayLabel: string;
  [key: string]: number | string | undefined;
};

function readingClass(label: string, value: number, limit: number) {
  if (value <= limit) return "text-gray-900";
  if (label === "NH₃") return "text-orange-600";
  if (label === "PM2.5") return "text-yellow-700";
  return "text-red-600";
}

const aggregationDescriptions: Record<AggregationMode, string> = {
  all: "Stored source readings are sampled to a maximum of 2,000 plotted points for responsive review.",
  hourly: "Average of all stored readings within each clock hour.",
  daily: "Average of all readings for each calendar date.",
  weekly: "Average of available readings in each Monday–Sunday calendar week.",
  monthly: "Average of all readings for each calendar month.",
};

function getTrendPeriodStart(date: Date, mode: AggregationMode) {
  if (mode === "all") return new Date(date);

  if (mode === "hourly") {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours()
    );
  }

  const periodStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  if (mode === "weekly") {
    const daysSinceMonday = (periodStart.getDay() + 6) % 7;
    periodStart.setDate(periodStart.getDate() - daysSinceMonday);
  }

  if (mode === "monthly") {
    periodStart.setDate(1);
  }

  return periodStart;
}

const formatTrendTick = (
  value: number | string,
  mode: AggregationMode
) => {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return String(value);

  if (mode === "hourly") {
    return `${String(date.getDate()).padStart(2, "0")}/${String(
      date.getMonth() + 1
    ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:00`;
  }

  if (mode === "daily") {
    return `${String(date.getDate()).padStart(2, "0")}/${String(
      date.getMonth() + 1
    ).padStart(2, "0")}/${date.getFullYear()}`;
  }

  if (mode === "weekly") {
    const weekEnd = addDays(date, 6);
    const shortDate = (item: Date) =>
      `${String(item.getDate()).padStart(2, "0")}/${String(
        item.getMonth() + 1
      ).padStart(2, "0")}`;
    return `${shortDate(date)}–${shortDate(weekEnd)}`;
  }

  if (mode === "monthly") {
    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      year: "numeric",
    }).format(date);
  }

  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

const formatTrendTooltipLabel = (
  value: number | string,
  mode: AggregationMode
) => {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return String(value);

  if (mode === "hourly") return formatDateTime(date);
  if (mode === "daily") return formatDate(date);
  if (mode === "weekly") {
    return `Week: ${formatDate(date)} – ${formatDate(addDays(date, 6))}`;
  }
  if (mode === "monthly") {
    return `Month: ${new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
    }).format(date)}`;
  }

  return formatDateTime(date);
};

const trendCursor = { stroke: "#94a3b8", strokeWidth: 1 };
const trendTooltipWrapper = { pointerEvents: "none" as const };

function aggregateTrendRecords<T extends TrendDatum>(
  data: T[],
  mode: AggregationMode
): T[] {
  if (data.length === 0) return data;
  if (mode === "all") {
    const maxPoints = 2_000;
    if (data.length <= maxPoints) return data;
    const stride = Math.ceil(data.length / maxPoints);
    const sampled = data.filter(
      (_item, index) => index % stride === 0 || index === data.length - 1
    );
    return sampled;
  }

  const groups = new Map<number, T[]>();

  data.forEach((item) => {
    const periodStart = getTrendPeriodStart(new Date(item.ts), mode);
    const key = periodStart.getTime();

    groups.set(key, [...(groups.get(key) ?? []), item]);
  });

  return Array.from(groups.entries()).map(([periodStartTs, items]) => {
    const first = items[0];
    const averaged: TrendDatum = { ...first };

    Object.keys(first).forEach((key) => {
      if (key === "ts") return;

      const values = items
        .map((item) => item[key])
        .filter((value): value is number => typeof value === "number");

      if (values.length > 0) {
        averaged[key] = +(
          values.reduce((sum, value) => sum + value, 0) / values.length
        ).toFixed(2);
      }
    });

    averaged.ts = periodStartTs;
    averaged.time = formatTrendTooltipLabel(periodStartTs, mode);
    averaged.dayLabel = formatTrendTick(periodStartTs, mode);
    return averaged as T;
  });
}

function buildCards(latest: DataPoint, zoneLabel: string): LiveCard[] {
  return [
    {
      label: `Temperature (${zoneLabel})`,
      value: latest.temp,
      unit: "°C",
      limit: 32,
      icon: "🌡️",
      color: latest.temp > 32 ? "red" : "green",
    },
    {
      label: `Humidity (${zoneLabel})`,
      value: latest.humidity,
      unit: "%",
      limit: 85,
      icon: "💧",
      color: latest.humidity > 85 ? "red" : "green",
    },
    {
      label: `CO₂ (${zoneLabel})`,
      value: latest.co2,
      unit: "ppm",
      limit: 1200,
      icon: "🌫️",
      color: latest.co2 > 1200 ? "red" : "green",
    },
    {
      label: `NH₃ (${zoneLabel})`,
      value: latest.nh3,
      unit: "ppm",
      limit: 5,
      icon: "⚗️",
      color: latest.nh3 > 5 ? "orange" : "green",
    },
    {
      label: `PM2.5 (${zoneLabel})`,
      value: latest.pm25,
      unit: "µg/m³",
      limit: 35,
      icon: "🫁",
      color: latest.pm25 > 35 ? "yellow" : "green",
    },
  ];
}

const ZONE_COLORS = {
  A: "#f97316",
  B: "#3b82f6",
  C: "#10b981",
} as const;

// ================= Tooltip Types =================
type ScatterTooltipProps = {
  active?: boolean;
  payload?: any[];
};

function SensorPairLegend({
  metrics,
}: {
  metrics: [SensorMetric, SensorMetric];
}) {
  return (
    <div className="mt-3 flex justify-center gap-6 text-sm">
      {metrics.map((metric) => (
        <span
          key={metric}
          className="flex items-center gap-2 text-slate-600"
        >
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: SENSOR_METRIC_COLORS[metric] }}
          />
          {SENSOR_ALERT_RULES[metric].label}
        </span>
      ))}
    </div>
  );
}

// ---------- Temp vs CO2 ----------
function TempCo2Tooltip({ active, payload }: ScatterTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-white p-2 border rounded text-xs shadow">
      <div>🌡 Temperature: {d.temp.toFixed(1)} °C</div>
      <div>🌫 CO₂: {d.co2.toFixed(0)} ppm</div>
    </div>
  );
}

// ---------- Temp vs NH3 ----------
function TempNh3Tooltip({ active, payload }: ScatterTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-white p-2 border rounded text-xs shadow">
      <div>🌡 Temperature: {d.temp.toFixed(1)} °C</div>
      <div>⚗️ NH₃: {d.nh3.toFixed(2)} ppm</div>
    </div>
  );
}

// ---------- Humidity vs PM2.5 ----------
function HumiPm25Tooltip({ active, payload }: ScatterTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-white p-2 border rounded text-xs shadow">
      <div>💧 Humidity: {d.humidity.toFixed(1)} %</div>
      <div>🫁 PM2.5: {d.pm25.toFixed(1)} µg/m³</div>
    </div>
  );
}
type CardItemProps = {
  item: {
    label: string;
    value: number;
    unit: string;
    limit: number;
    icon: string;
    color: "red" | "orange" | "yellow" | "green";
  };
};

function CardItem({ item }: CardItemProps) {
  return (
    <div
      className={`p-4 rounded-2xl shadow-sm border ${
        item.color === "red"
          ? "bg-red-50 border-red-300"
          : item.color === "orange"
            ? "bg-orange-50 border-orange-300"
            : item.color === "yellow"
              ? "bg-yellow-50 border-yellow-300"
              : "bg-green-50 border-green-200"
      } transition`}
    >
      <div className="text-3xl mb-2">{item.icon}</div>
      <p className="text-sm text-gray-600">{item.label}</p>
      <p className="text-xl font-bold">
        {item.value} {item.unit}
      </p>
      {item.value > item.limit && (
        <p className="text-xs mt-1 text-red-600">⚠️ Above limit!</p>
      )}
    </div>
  );
}

const INACTIVE_SENSOR_CARDS = [
  { label: "Temperature", icon: "🌡️" },
  { label: "Humidity", icon: "💧" },
  { label: "CO₂", icon: "🌫️" },
  { label: "NH₃", icon: "⚗️" },
  { label: "PM2.5", icon: "🫁" },
] as const;

function DashboardContent() {
  const { activeTab, selectedZone } = useDashboardNavigation();
  const isAllZone = selectedZone === "ALL";

  // ====== Sensor data ======
  const [allData, setAllData] = useState<DataPoint[]>([]);
  //const [index, setIndex] = useState(0);
  //const [lastUpdate, setLastUpdate] = useState<string>("");
  const [weights, setWeights] = usePersistentState<WeightEntry[]>(
    "broiler-dashboard:v11:current-weights",
    () => createInitialCurrentCycleRecords().weights
  );
  // ====== Health & Behavior (prototype) ======
  // Mortality
  const [mortality, setMortality] = usePersistentState<MortalityEntry[]>(
    "broiler-dashboard:v11:current-mortality",
    () => createInitialCurrentCycleRecords().mortality
  );
  const [storedCycles, setCycles] = usePersistentState<
    Record<Zone, ProductionCycle>
  >(
    "broiler-dashboard:v11:current-zone-cycles",
    createInitialProductionCycles
  );
  const cyclesByZone = useMemo<Record<Zone, ProductionCycle>>(
    () =>
      Object.fromEntries(
        ALL_ZONES.map((zone) => [
          zone,
          normalizeProductionCycle(
            storedCycles[zone] ?? createDraftProductionCycles()[zone],
            zone
          ),
        ])
      ) as Record<Zone, ProductionCycle>,
    [storedCycles]
  );
  const selectedCycleZone: Zone =
    selectedZone === "ALL" ? (ACTIVE_ZONES[0] ?? "A") : selectedZone;
  const storedCycle = cyclesByZone[selectedCycleZone];

  useEffect(() => {
    const needsNormalization = ALL_ZONES.some((zone) => {
      const stored = storedCycles[zone];
      const normalized = cyclesByZone[zone];
      return (
        !stored ||
        stored.zone !== zone ||
        !stored.status ||
        !stored.createdAt ||
        !stored.updatedAt ||
        !Array.isArray(stored.auditLog) ||
        stored.id !== normalized.id
      );
    });

    if (needsNormalization) setCycles(cyclesByZone);
  }, [cyclesByZone, setCycles, storedCycles]);

  // Consumption
  const [consumptions, setConsumptions] = usePersistentState<ConsumptionEntry[]>(
    "broiler-dashboard:v11:current-consumptions",
    () => createInitialCurrentCycleRecords().consumptions
  );

  const cycleMortality = useMemo(
    () =>
      mortality.filter((entry) => {
        const zoneCycle = cyclesByZone[entry.zone];
        return (
          entry.cycleId === zoneCycle.id &&
          entry.date >= zoneCycle.startDate &&
          (!zoneCycle.actualHarvestDate ||
            entry.date <= zoneCycle.actualHarvestDate)
        );
      }),
    [cyclesByZone, mortality]
  );
  const cycleConsumptions = useMemo(
    () =>
      consumptions.filter((entry) => {
        const zoneCycle = cyclesByZone[entry.zone];
        return (
          entry.cycleId === zoneCycle.id &&
          entry.date >= zoneCycle.startDate &&
          (!zoneCycle.actualHarvestDate ||
            entry.date <= zoneCycle.actualHarvestDate)
        );
      }),
    [consumptions, cyclesByZone]
  );
  const cycleWeights = useMemo(
    () =>
      weights.filter(
        (entry) => entry.cycleId === cyclesByZone[entry.zone].id
      ),
    [cyclesByZone, weights]
  );
  // ===== Visualization Controls =====
  // ===== Visualization Controls =====
  const [selectedParam, setSelectedParam] = useState<
    "all" | "temp" | "humidity" | "co2" | "nh3" | "pm25"
  >("all");
  // ===== PDF Report Download =====
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingHistoricalPDF, setIsDownloadingHistoricalPDF] =
    useState(false);
  const [currentReportAnalysis, setCurrentReportAnalysis] =
    useState<CurrentCycleReportAnalysisSnapshot | null>(null);
  const [historicalReportAnalyses, setHistoricalReportAnalyses] = useState<
    Record<string, HistoricalCycleReportAnalysisSnapshot>
  >({});
  const handleCurrentReportAnalysisChange = useCallback(
    (snapshot: CurrentCycleReportAnalysisSnapshot) => {
      setCurrentReportAnalysis(snapshot);
    },
    []
  );
  const handleHistoricalReportAnalysisChange = useCallback(
    (snapshot: HistoricalCycleReportAnalysisSnapshot) => {
      setHistoricalReportAnalyses((current) => ({
        ...current,
        [snapshot.cycleId]: snapshot,
      }));
    },
    []
  );

  const [aggregation, setAggregation] = useState<AggregationMode>("daily");
  const [selectedHistoricalCycleKey, setSelectedHistoricalCycleKey] =
    useState<HistoricalCycle["key"]>("");
  const [isHistoricalDataOpen, setIsHistoricalDataOpen] = useState(false);
  const [managedHistoricalCycles, setManagedHistoricalCycles] =
    usePersistentState<HistoricalCycle[]>(
      "broiler-dashboard:v9:audit-managed-historical-cycles",
      () => []
    );
  // ================= APPLY FILTER STATE =================
  const [appliedParam, setAppliedParam] = useState(selectedParam);
  const [appliedAggregation, setAppliedAggregation] = useState(aggregation);
  const [isApplying, setIsApplying] = useState(false);

  const allHistoricalCycles = useMemo(() => {
    const managedIds = new Set(
      managedHistoricalCycles.map((historicalCycle) => historicalCycle.id)
    );
    const denseManagedCycles = managedHistoricalCycles.map(
      (historicalCycle) => ({
        ...historicalCycle,
        data: interpolateSensorSeries(historicalCycle.data, 1),
      })
    );
    const seededCycles = createHistoricalCycles().filter(
      (historicalCycle) => !managedIds.has(historicalCycle.id)
    );
    return [...denseManagedCycles, ...seededCycles];
  }, [managedHistoricalCycles]);
  const historicalCycles = useMemo(
    () =>
      selectedZone === "ALL"
        ? []
        : allHistoricalCycles.filter(
            (historicalCycle) =>
              historicalCycle.zone === selectedZone &&
              (!IS_REPLAY_MODE ||
                historicalCycle.production.sourceSummary?.batch !== 7)
          ),
    [allHistoricalCycles, selectedZone]
  );
  const overviewReplayCycle = useMemo(
    () =>
      allHistoricalCycles.find(
        (historicalCycle) =>
          historicalCycle.zone === "A" &&
          historicalCycle.production.sourceSummary?.batch === 7 &&
          historicalCycle.data.length > 0
      ) ?? allHistoricalCycles.find((historicalCycle) => historicalCycle.data.length > 0),
    [allHistoricalCycles]
  );
  const replayData = useMemo(
    () => overviewReplayCycle?.data ?? [],
    [overviewReplayCycle]
  );
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(true);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const replayMaximumIndex = Math.max(0, replayData.length - 1);
  const replayPoint = replayData[Math.min(replayIndex, replayMaximumIndex)];
  const replayCycleDay =
    overviewReplayCycle && replayPoint
      ? Math.min(
          overviewReplayCycle.harvestDay,
          dateToDayNumber(
            replayPoint.time.slice(0, 10),
            overviewReplayCycle.startDate
          )
        )
      : 1;
  const replayCyclesByZone = useMemo(
    () =>
      overviewReplayCycle
        ? createReplayCycles(overviewReplayCycle)
        : createDraftProductionCycles(),
    [overviewReplayCycle]
  );
  const dashboardCyclesByZone = IS_REPLAY_MODE
    ? replayCyclesByZone
    : cyclesByZone;
  const cycle = IS_REPLAY_MODE
    ? dashboardCyclesByZone[selectedCycleZone]
    : storedCycle;
  const replayProductionRecords = useMemo(
    () =>
      overviewReplayCycle
        ? createReplayProductionRecords(
            overviewReplayCycle,
            replayCycleDay,
            replayCyclesByZone
          )
        : { mortality: [], consumptions: [], weights: [] },
    [overviewReplayCycle, replayCycleDay, replayCyclesByZone]
  );
  const dashboardMortality = IS_REPLAY_MODE
    ? replayProductionRecords.mortality
    : cycleMortality;
  const dashboardConsumptions = IS_REPLAY_MODE
    ? replayProductionRecords.consumptions
    : cycleConsumptions;
  const dashboardWeights = IS_REPLAY_MODE
    ? replayProductionRecords.weights
    : cycleWeights;
  const replayRecentPoints = useMemo(
    () => replayData.slice(Math.max(0, replayIndex - 15), replayIndex + 1),
    [replayData, replayIndex]
  );

  useEffect(() => {
    if (!IS_REPLAY_MODE || !isReplayPlaying || replayData.length === 0) return;
    const interval = window.setInterval(() => {
      setReplayIndex((current) =>
        current >= replayMaximumIndex
          ? current
          : Math.min(replayMaximumIndex, current + replaySpeed)
      );
    }, REPLAY_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isReplayPlaying, replayData.length, replayMaximumIndex, replaySpeed]);
  useEffect(() => {
    if (IS_REPLAY_MODE && replayIndex >= replayMaximumIndex) {
      setIsReplayPlaying(false);
    }
  }, [replayIndex, replayMaximumIndex]);
  const selectedHistoricalCycle = useMemo(
    () =>
      historicalCycles.find(
        (historicalCycle) =>
          historicalCycle.key === selectedHistoricalCycleKey
      ) ?? historicalCycles[0],
    [historicalCycles, selectedHistoricalCycleKey]
  );
  useEffect(() => {
    if (selectedZone === "ALL" || historicalCycles.length === 0) {
      setIsHistoricalDataOpen(false);
      setSelectedHistoricalCycleKey("");
      return;
    }

    if (
      !historicalCycles.some(
        (historicalCycle) =>
          historicalCycle.key === selectedHistoricalCycleKey
      )
    ) {
      setSelectedHistoricalCycleKey(historicalCycles[0]?.key ?? "");
    }
  }, [historicalCycles, selectedHistoricalCycleKey, selectedZone]);
  const chartData = useMemo(
    () => selectedHistoricalCycle?.data ?? [],
    [selectedHistoricalCycle]
  );
  const [sensorMeta, setSensorMeta] = useState<SensorApiResponse["meta"] | null>(
    null
  );
  const [sensorError, setSensorError] = useState<string | null>(null);

  const zoneData = useMemo(() => {
    return createZoneData(chartData);
  }, [chartData]);
  // =====================================================
  // ✅ TARUH aggregatedData DI SINI (WAJIB DI SINI)
  // =====================================================
  const aggregatedData = useMemo<DataPoint[]>(
    () => aggregateTrendRecords(chartData, appliedAggregation),
    [appliedAggregation, chartData]
  );
  const historicalTrendSummaries = useMemo(
    () =>
      Object.fromEntries(
        SENSOR_METRICS.map((metric) => {
          const values = chartData.map((point) => point[metric]);
          const rule = SENSOR_ALERT_RULES[metric];
          return [
            metric,
            {
              average: values.length
                ? values.reduce((total, value) => total + value, 0) /
                  values.length
                : 0,
              minimum: values.length ? Math.min(...values) : 0,
              maximum: values.length ? Math.max(...values) : 0,
              latest: values.at(-1) ?? 0,
              exceedances: values.filter(
                (value) => value > rule.threshold
              ).length,
            },
          ];
        })
      ) as Record<
        SensorMetric,
        {
          average: number;
          minimum: number;
          maximum: number;
          latest: number;
          exceedances: number;
        }
      >,
    [chartData]
  );

  // =====================================================
  // ✅ showParam JUGA HARUS DI SINI
  // =====================================================
  const showParam = (
    param: "temp" | "humidity" | "co2" | "nh3" | "pm25"
  ): boolean => {
    return appliedParam === "all" || appliedParam === param;
  };

  const correlationSeries = useMemo(() => {
    const applyAgg = (data: DataPoint[]) =>
      aggregateTrendRecords(data, appliedAggregation);

    if (selectedZone === "ALL") {
      return ACTIVE_ZONES.map((zone) => ({
        zone,
        data: applyAgg(zoneData[zone]),
      }));
    }

    return [
      {
        zone: selectedZone,
        data: aggregatedData,
      },
    ];
  }, [selectedZone, appliedAggregation, aggregatedData, zoneData]);

  // Append one deterministic one-minute sensor reading while the demo is open.
  useEffect(() => {
    if (!IS_OPERATIONAL || allData.length === 0) return;

    const interval = setInterval(() => {
      setAllData((previous) => {
        const latest = previous.at(-1);
        if (!latest) return previous;
        return [
          ...previous,
          createNextRealtimeSensorPoint(latest, previous.length),
        ];
      });
    }, REALTIME_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [allData.length]);
  const monitoringData = useMemo(
    () =>
      IS_REPLAY_MODE ? replayData.slice(0, replayIndex + 1) : allData,
    [allData, replayData, replayIndex]
  );
  const livePoint = IS_REPLAY_MODE ? replayPoint : allData.at(-1);
  const liveZoneData = useMemo(() => {
    if (!livePoint) return null;

    const latestIndex = IS_REPLAY_MODE
      ? Math.min(replayIndex, replayMaximumIndex)
      : Math.max(0, allData.length - 1);
    const totalPoints = IS_REPLAY_MODE ? replayData.length : allData.length;
    return {
      A: getZonePoint(livePoint, latestIndex, totalPoints, "A"),
      B: getZonePoint(livePoint, latestIndex, totalPoints, "B"),
      C: getZonePoint(livePoint, latestIndex, totalPoints, "C"),
    };
  }, [allData.length, livePoint, replayData.length, replayIndex, replayMaximumIndex]);
  const {
    cycleAlerts,
    visibleAlerts,
    latestToast,
    soundEnabled,
    toggleSound,
    acknowledgeAlert,
    resetZoneAlerts,
  } = useCycleAlerts({
    activeZones: ACTIVE_ZONES,
    cyclesByZone: dashboardCyclesByZone,
    liveZoneData: IS_OPERATIONAL || IS_REPLAY_MODE ? liveZoneData : null,
    selectedZone,
  });

  // ====== Fetch sensor data from local data API ======
  useEffect(() => {
    if (IS_REPLAY_MODE) {
      setSensorError(null);
      return;
    }

    let isMounted = true;

    fetch("/api/sensors")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch broiler data");
        return res.json();
      })
      .then((payload: SensorApiResponse) => {
        if (!isMounted) return;

        const mapped =
          !IS_OPERATIONAL && SENSOR_LAST_RECORDED_AT
            ? payload.data.filter(
                (point) => point.time <= SENSOR_LAST_RECORDED_AT
              )
            : payload.data;
        const finalReading = mapped.at(-1);
        setAllData(mapped);
        setSensorMeta({
          ...payload.meta,
          runtimeEnd: finalReading?.time ?? payload.meta.runtimeEnd,
          records: mapped.length,
        });
        setSensorError(null);
      })
      .catch((err) => {
        console.error("Error loading broiler data:", err);
        setSensorError("Failed to load sensor data");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // ==== SAFE derivations tanpa early-return ====
  const liveByZone = useMemo(() => {
    if (!liveZoneData) return null;

    return [
      {
        label: "Temperature",
        unit: "°C",
        limit: 32,
        icon: "🌡️",
        values: [
          { zone: "A", value: liveZoneData.A.temp },
          { zone: "B", value: liveZoneData.B.temp },
          { zone: "C", value: liveZoneData.C.temp },
        ],
      },
      {
        label: "Humidity",
        unit: "%",
        limit: 85,
        icon: "💧",
        values: [
          { zone: "A", value: liveZoneData.A.humidity },
          { zone: "B", value: liveZoneData.B.humidity },
          { zone: "C", value: liveZoneData.C.humidity },
        ],
      },
      {
        label: "CO₂",
        unit: "ppm",
        limit: 1200,
        icon: "🌫️",
        values: [
          { zone: "A", value: liveZoneData.A.co2 },
          { zone: "B", value: liveZoneData.B.co2 },
          { zone: "C", value: liveZoneData.C.co2 },
        ],
      },
      {
        label: "NH₃",
        unit: "ppm",
        limit: 5,
        icon: "⚗️",
        values: [
          { zone: "A", value: liveZoneData.A.nh3 },
          { zone: "B", value: liveZoneData.B.nh3 },
          { zone: "C", value: liveZoneData.C.nh3 },
        ],
      },
      {
        label: "PM2.5",
        unit: "µg/m³",
        limit: 35,
        icon: "🫁",
        values: [
          { zone: "A", value: liveZoneData.A.pm25 },
          { zone: "B", value: liveZoneData.B.pm25 },
          { zone: "C", value: liveZoneData.C.pm25 },
        ],
      },
    ];
  }, [liveZoneData]);

  // ===== Latest safe data (ANTI ERROR) =====
  const zoneLatest = useMemo(() => {
    if (selectedZone === "ALL") return livePoint;
    return liveZoneData?.[selectedZone] ?? livePoint;
  }, [selectedZone, livePoint, liveZoneData]);

  const latestSafe: DataPoint = zoneLatest ?? {
    time: "-",
    dayLabel: "-",
    ts: 0,
    temp: 0,
    humidity: 0,
    co2: 0,
    nh3: 0,
    pm25: 0,
  };

  const allZoneCombinedData = useMemo(() => {
    return chartData.map((d, i) => ({
      time: d.time,
      dayLabel: d.dayLabel, // ✅ INI KUNCINYA
      ts: d.ts,

      tempA: zoneData.A[i]?.temp,
      tempB: zoneData.B[i]?.temp,
      tempC: zoneData.C[i]?.temp,

      humidityA: zoneData.A[i]?.humidity,
      humidityB: zoneData.B[i]?.humidity,
      humidityC: zoneData.C[i]?.humidity,

      co2A: zoneData.A[i]?.co2,
      co2B: zoneData.B[i]?.co2,
      co2C: zoneData.C[i]?.co2,

      nh3A: zoneData.A[i]?.nh3,
      nh3B: zoneData.B[i]?.nh3,
      nh3C: zoneData.C[i]?.nh3,

      pm25A: zoneData.A[i]?.pm25,
      pm25B: zoneData.B[i]?.pm25,
      pm25C: zoneData.C[i]?.pm25,
    }));
  }, [chartData, zoneData]);

  // ====== Chart data for consumption vs standard ======
  const aggregatedAllZoneData = useMemo(() => {
    return aggregateTrendRecords(allZoneCombinedData, appliedAggregation);
  }, [allZoneCombinedData, appliedAggregation]);

  const trendChartData = useMemo(
    () => (selectedZone === "ALL" ? aggregatedAllZoneData : aggregatedData),
    [aggregatedAllZoneData, aggregatedData, selectedZone]
  );

  const visibleConsumptions = useMemo(() => {
    if (selectedZone === "ALL") return cycleConsumptions;
    return cycleConsumptions.filter((c) => c.zone === selectedZone);
  }, [cycleConsumptions, selectedZone]);

  const visibleMortality = useMemo(() => {
    if (selectedZone === "ALL") return cycleMortality;
    return cycleMortality.filter((m) => m.zone === selectedZone);
  }, [cycleMortality, selectedZone]);

  const visibleWeights = useMemo(() => {
    if (selectedZone === "ALL") return cycleWeights;
    return cycleWeights.filter((w) => w.zone === selectedZone);
  }, [cycleWeights, selectedZone]);

  const saveDailyProductionLog = (input: DailyProductionLogInput) => {
    if (
      !IS_OPERATIONAL ||
      cycle.status !== "active" ||
      selectedZone === "ALL" ||
      input.date < cycle.startDate
    )
      return;

    const zone = selectedZone;

    if (input.mortalityCount !== undefined) {
      setMortality((previous) => [
        ...previous.filter(
          (entry) =>
            !(
              entry.cycleId === cycle.id &&
              entry.zone === zone &&
              entry.date === input.date
            )
        ),
        {
          cycleId: cycle.id,
          zone,
          date: input.date,
          count: input.mortalityCount!,
          notes: input.mortalityNotes || undefined,
        },
      ]);
    }

    if (input.feedKg !== undefined && input.waterL !== undefined) {
      setConsumptions((previous) => {
        const existingIndex = previous.findIndex(
          (entry) =>
            entry.cycleId === cycle.id &&
            entry.zone === zone &&
            entry.date === input.date
        );
        const nextEntry: ConsumptionEntry = {
          cycleId: cycle.id,
          zone,
          date: input.date,
          feedKg: input.feedKg!,
          waterL: input.waterL!,
        };

        if (existingIndex === -1) return [...previous, nextEntry];
        return previous.map((entry, index) =>
          index === existingIndex ? nextEntry : entry
        );
      });
    }

    if (input.averageWeightKg !== undefined) {
      const day = dateToDayNumber(input.date, cycle.startDate);
      setWeights((previous) => {
        const existingIndex = previous.findIndex(
          (entry) =>
            entry.cycleId === cycle.id &&
            entry.zone === zone &&
            entry.day === day
        );
        const nextEntry: WeightEntry = {
          cycleId: cycle.id,
          zone,
          day,
          stdWeightKg: standardBroilerWeight(day),
          actualWeightKg: input.averageWeightKg!,
        };
        const next =
          existingIndex === -1
            ? [...previous, nextEntry]
            : previous.map((entry, index) =>
                index === existingIndex ? nextEntry : entry
              );

        return next.sort(
          (left, right) =>
            left.day - right.day || left.zone.localeCompare(right.zone)
        );
      });
    }
  };

  const reportZones = useMemo<Zone[]>(
    () => (selectedZone === "ALL" ? ACTIVE_ZONES : [selectedZone]),
    [selectedZone]
  );
  const hasStartedCycle = reportZones.some(
    (zone) => dashboardCyclesByZone[zone].status !== "draft"
  );
  const hasActiveCycle = reportZones.some(
    (zone) => dashboardCyclesByZone[zone].status === "active"
  );
  const reportDatasets = useMemo<Record<Zone, DataPoint[]>>(() => {
    return Object.fromEntries(
      ALL_ZONES.map((zone) => {
        const zoneCycle = dashboardCyclesByZone[zone];
        return [
          zone,
          monitoringData
          .map((point, index) =>
            getZonePoint(
              point,
              index,
              IS_REPLAY_MODE ? replayData.length : monitoringData.length,
              zone
            )
          )
          .filter((point) => {
            if (IS_REPLAY_MODE) return true;
            const pointDate = point.time.slice(0, 10);
            return (
              pointDate >= zoneCycle.startDate &&
              (!zoneCycle.actualHarvestDate ||
                pointDate <= zoneCycle.actualHarvestDate)
            );
          }),
        ];
      })
    ) as Record<Zone, DataPoint[]>;
  }, [dashboardCyclesByZone, monitoringData, replayData.length]);
  const visibleSensorSeries = useMemo(
    () =>
      reportZones.map((zone) => ({
        zone,
        cycle: dashboardCyclesByZone[zone],
        data: reportDatasets[zone],
      })),
    [dashboardCyclesByZone, reportDatasets, reportZones]
  );
  const reportZone: Zone = reportZones[0] ?? "A";
  const reportDataset = reportDatasets[reportZone];
  const productionReportZones = useMemo(
    () =>
      reportZones.filter(
        (zone) => dashboardCyclesByZone[zone].status !== "draft"
      ),
    [dashboardCyclesByZone, reportZones]
  );
  const productionReportZone = productionReportZones[0] ?? reportZone;
  const currentProductionByZone = useMemo<Record<Zone, HistoricalProductionData>>(() => {
    return Object.fromEntries(
      ALL_ZONES.map((zone) => {
        const zoneCycle = dashboardCyclesByZone[zone];
        if (IS_REPLAY_MODE && overviewReplayCycle) {
          return [
            zone,
            sliceReplayProduction(
              overviewReplayCycle.production,
              replayCycleDay
            ),
          ];
        }
        const mortalityByDate = new Map<string, number>();
        dashboardMortality
          .filter((entry) => entry.zone === zone)
          .forEach((entry) => {
            mortalityByDate.set(
              entry.date,
              (mortalityByDate.get(entry.date) ?? 0) + entry.count
            );
          });

        const production: HistoricalProductionData = {
          initialBirds: zoneCycle.initialBirds,
          harvestedBirds:
            zoneCycle.status === "completed" && zoneCycle.harvestedBirds > 0
              ? zoneCycle.harvestedBirds
              : undefined,
          mortality: Array.from(mortalityByDate.entries())
            .map(([date, count]) => ({
              day: dateToDayNumber(date, zoneCycle.startDate),
              date,
              count,
            }))
            .sort((left, right) => left.day - right.day),
          feedWater: dashboardConsumptions
            .filter((entry) => entry.zone === zone)
            .map((entry) => ({
              day: dateToDayNumber(entry.date, zoneCycle.startDate),
              date: entry.date,
              feedKgPerBird: entry.feedKg,
              waterLPerBird: entry.waterL,
            }))
            .sort((left, right) => left.day - right.day),
          weights: dashboardWeights
            .filter((entry) => entry.zone === zone)
            .map((entry) => ({
              day: entry.day,
              actualWeightKg: entry.actualWeightKg,
              standardWeightKg: entry.stdWeightKg,
            }))
            .sort((left, right) => left.day - right.day),
        };

        return [zone, production];
      })
    ) as Record<Zone, HistoricalProductionData>;
  }, [
    dashboardConsumptions,
    dashboardCyclesByZone,
    dashboardMortality,
    dashboardWeights,
    overviewReplayCycle,
    replayCycleDay,
  ]);
  const currentProductionSeries = useMemo<ProductionPerformanceSeries[]>(
    () =>
      productionReportZones.map((zone) => ({
        key: zone,
        label: `Zone ${zone}`,
        color: ZONE_COLORS[zone],
        production: currentProductionByZone[zone],
      })),
    [currentProductionByZone, productionReportZones]
  );

  const harvestSummariesByZone = useMemo<Record<Zone, HarvestSummary>>(
    () =>
      Object.fromEntries(
        ALL_ZONES.map((zone) => [
          zone,
          calculateHarvestSummary({
            cycle: dashboardCyclesByZone[zone],
            mortality: dashboardMortality,
            consumptions: dashboardConsumptions,
            weights: dashboardWeights,
            sensorData: reportDatasets[zone],
            alerts: cycleAlerts.filter((entry) => entry.zone === zone),
            zone,
          }),
        ])
      ) as Record<Zone, HarvestSummary>,
    [
      cycleAlerts,
      dashboardConsumptions,
      dashboardCyclesByZone,
      dashboardMortality,
      dashboardWeights,
      reportDatasets,
    ]
  );
  const harvestSummary = harvestSummariesByZone[reportZone];
  const cycleRiskAssessmentsByZone = useMemo<Record<
    Zone,
    CycleRiskAssessment
  >>(
    () =>
      Object.fromEntries(
        ALL_ZONES.map((zone) => [
          zone,
          assessCurrentCycleRisk({
            harvest: harvestSummariesByZone[zone],
            sensorData: reportDatasets[zone],
          }),
        ])
      ) as Record<Zone, CycleRiskAssessment>,
    [harvestSummariesByZone, reportDatasets]
  );
  const currentPredictionInputs = useMemo<CurrentCyclePredictionInput[]>(
    () =>
      reportZones
        .filter((zone) => dashboardCyclesByZone[zone].status === "active")
        .map((zone) => ({
          zone,
          cycle: dashboardCyclesByZone[zone],
          summary: harvestSummariesByZone[zone],
          sensorData: reportDatasets[zone],
        })),
    [dashboardCyclesByZone, harvestSummariesByZone, reportDatasets, reportZones]
  );

  const handleCycleChange = (changes: ProductionCycle) => {
    if (!IS_OPERATIONAL || selectedZone === "ALL" || cycle.status !== "active")
      return;
    const zone = selectedZone;
    setCycles((current) => ({
      ...current,
      [zone]: updateProductionCycle(
        normalizeProductionCycle(current[zone], zone),
        changes
      ),
    }));
  };

  const handleStartCycle = (input: StartCycleInput) => {
    if (!IS_OPERATIONAL || selectedZone === "ALL") return;
    const zone = selectedZone;
    const cycleId = input.id.trim();
    if (!cycleId) return;
    if (
      allHistoricalCycles.some(
        (historicalCycle) => historicalCycle.id === cycleId
      ) ||
      ALL_ZONES.some(
        (candidateZone) => cyclesByZone[candidateZone].id === cycleId
      )
    ) {
      window.alert(
        `Cycle ID ${cycleId} already exists. Use a unique Cycle ID for the new flock.`
      );
      return;
    }

    const nextCycle = startProductionCycle({ ...input, id: cycleId }, zone);
    setCycles((current) => ({ ...current, [zone]: nextCycle }));
    resetZoneAlerts(zone);
  };

  const handleCompleteCycle = (input: CompleteCycleInput) => {
    if (!IS_OPERATIONAL || selectedZone === "ALL" || cycle.status !== "active")
      return;
    const zone = selectedZone;
    const completedCycle = completeProductionCycle(cycle, input);
    const completedSummary = {
      ...harvestSummary,
      harvestedBirds: input.harvestedBirds,
      totalLiveWeightKg:
        input.harvestedBirds * harvestSummary.finalAverageWeightKg,
    };
    const snapshot = buildHistoricalCycleSnapshot({
      cycle: completedCycle,
      summary: completedSummary,
      sensorData: reportDataset,
      mortality: cycleMortality,
      consumptions: cycleConsumptions,
      weights: cycleWeights,
      alerts: cycleAlerts,
      zone,
    });

    setCycles((current) => ({ ...current, [zone]: completedCycle }));
    setManagedHistoricalCycles((previous) => [
      snapshot,
      ...previous.filter(
        (historicalCycle) => historicalCycle.id !== cycle.id
      ),
    ]);
    setSelectedHistoricalCycleKey(snapshot.key);
    setIsHistoricalDataOpen(true);
  };

  const handleResetCycle = () => {
    if (!IS_OPERATIONAL || selectedZone === "ALL" || cycle.status !== "active")
      return;

    const zone = selectedZone;
    const cycleId = cycle.id;
    const confirmed = window.confirm(
      `Reset ${cycleId} for Zone ${zone}?\n\nThis permanently deletes the current cycle's mortality, feed, water, body-weight, and alert records. The cycle will return to Not started and will not be added to Cycle Completed.`
    );
    if (!confirmed) return;

    const draftCycle = createDraftProductionCycles()[zone];
    setCycles((current) => ({ ...current, [zone]: draftCycle }));
    setMortality((current) =>
      current.filter(
        (entry) => entry.zone !== zone || entry.cycleId !== cycleId
      )
    );
    setConsumptions((current) =>
      current.filter(
        (entry) => entry.zone !== zone || entry.cycleId !== cycleId
      )
    );
    setWeights((current) =>
      current.filter(
        (entry) => entry.zone !== zone || entry.cycleId !== cycleId
      )
    );
    resetZoneAlerts(zone, cycleId);
  };

  const handleReopenCycle = (reason: string) => {
    if (
      !IS_OPERATIONAL ||
      selectedZone === "ALL" ||
      cycle.status !== "completed" ||
      !reason.trim()
    ) return;
    const zone = selectedZone;
    setCycles((current) => ({
      ...current,
      [zone]: reopenProductionCycle(
        normalizeProductionCycle(current[zone], zone),
        reason
      ),
    }));
    setManagedHistoricalCycles((previous) =>
      previous.filter((historicalCycle) => historicalCycle.id !== cycle.id)
    );
    setSelectedHistoricalCycleKey(
      historicalCycles.find((historicalCycle) => historicalCycle.id !== cycle.id)
        ?.key ?? ""
    );
  };

  const generatePDFReport = async () => {
    try {
      setIsDownloadingPDF(true);
      await downloadCycleReportPdf(
        buildCurrentCycleReportModel({
          cycle,
          zone: reportZone,
          sensorData: reportDataset,
          harvestSummary,
          riskAssessment: cycleRiskAssessmentsByZone[reportZone],
          activeAlertCount: cycleAlerts.filter(
            (entry) =>
              entry.zone === reportZone && entry.status === "active"
          ).length,
          analysisSnapshot: currentReportAnalysis,
        })
      );
    } catch (error) {
      console.error("Error generating current-cycle PDF:", error);
      alert("Failed to generate the current-cycle PDF report.");
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const generateHistoricalPDFReport = async () => {
    if (!selectedHistoricalCycle) return;

    try {
      setIsDownloadingHistoricalPDF(true);
      await downloadCycleReportPdf(
        buildHistoricalCycleReportModel({
          historicalCycle: selectedHistoricalCycle,
          cyclesByZone,
          analysisSnapshot:
            historicalReportAnalyses[selectedHistoricalCycle.id],
        })
      );
    } catch (error) {
      console.error("Error generating completed-cycle PDF:", error);
      alert("Failed to generate the completed-cycle PDF report.");
    } finally {
      setIsDownloadingHistoricalPDF(false);
    }
  };

  return (
    <DashboardShell
      toolbar={
        <DashboardToolbar
          activeZones={ACTIVE_ZONES}
          isSingleZone={IS_SINGLE_ZONE}
          cycle={cycle}
          cyclesByZone={dashboardCyclesByZone}
          reportZones={reportZones}
          harvestSummariesByZone={harvestSummariesByZone}
          cycleRiskAssessmentsByZone={cycleRiskAssessmentsByZone}
          latestTime={latestSafe.time}
          refreshIntervalMs={IS_REPLAY_MODE ? REPLAY_INTERVAL_MS : REALTIME_INTERVAL_MS}
          alerts={visibleAlerts}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          onAcknowledge={acknowledgeAlert}
          operationalStatus={IS_REPLAY_MODE ? "replay" : OPERATIONAL_STATUS}
        />
      }
      globalControls={
        IS_REPLAY_MODE && overviewReplayCycle && replayPoint ? (
          <section
            aria-label="Replay data monitoring controls"
            className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">
                  Replay Data Monitoring
                </div>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                  Historical Monitoring Replay
                </h2>
              </div>
              <p className="max-w-2xl text-sm text-slate-600 lg:text-right">
                Values, CCTV, trends, production, and AI insight follow the
                selected replay timestamp across every dashboard tab.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-violet-200 bg-white/90 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsReplayPlaying((current) => !current)}
                    className="min-w-24 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                  >
                    {isReplayPlaying ? "Pause replay" : "Play replay"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsReplayPlaying(false);
                      setReplayIndex(0);
                    }}
                    className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                  >
                    Restart
                  </button>
                </div>
                <input
                  type="range"
                  aria-label="Global dashboard replay position"
                  min={0}
                  max={replayMaximumIndex}
                  value={replayIndex}
                  onChange={(event) => {
                    setIsReplayPlaying(false);
                    setReplayIndex(Number(event.target.value));
                  }}
                  className="min-w-0 flex-1 accent-violet-600"
                />
                <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600">
                  Speed
                  <select
                    value={replaySpeed}
                    onChange={(event) =>
                      setReplaySpeed(Number(event.target.value))
                    }
                    className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 font-semibold text-slate-800"
                  >
                    <option value={1}>1×</option>
                    <option value={4}>4×</option>
                    <option value={12}>12×</option>
                  </select>
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>{overviewReplayCycle.label}</span>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-700">
                  Cycle Day {replayCycleDay} of {cycle.targetHarvestDay}
                </span>
                <span className="font-semibold text-violet-700">
                  Replay timestamp: {replayPoint.time}
                </span>
                <span>
                  {replayIndex + 1} / {replayData.length} readings
                </span>
              </div>
            </div>
          </section>
        ) : null
      }
    >

      {(IS_OPERATIONAL || IS_REPLAY_MODE) && latestToast && (
        <div className={`fixed top-24 right-6 z-[80] max-w-sm rounded-2xl border shadow-2xl p-4 ${latestToast.severity === "critical" ? "bg-red-50 border-red-300" : "bg-amber-50 border-amber-300"}`}>
          <div className="font-semibold">⚠️ {latestToast.label} alert</div>
          <div className="text-sm mt-1">{latestToast.message}</div>
          <div className="text-xs text-gray-500 mt-2">{latestToast.timestamp}</div>
        </div>
      )}

      <DashboardTabPanel>
      {activeTab === "overview" && (
        <>
      {!IS_REPLAY_MODE && (
      <section className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">
          Current Data Monitoring
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">
          {isAllZone
            ? hasActiveCycle
              ? "Independent Zone Cycles"
              : "Production Cycles Not Started"
            : cycle.status === "draft"
            ? "No Active Production Cycle"
            : cycle.status === "completed"
            ? "Completed Cycle Review"
            : "Active Production Cycle"}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {isAllZone
            ? hasActiveCycle
              ? "Each active zone keeps its own cycle timeline, production records, and environmental data."
              : "No flock cycle has been started. Environmental sensors remain available in Zone A, B, and C."
            : cycle.status === "draft"
            ? `Zone ${cycle.zone} has no active flock cycle. Environmental monitoring remains available until placement is confirmed.`
            : cycle.status === "completed"
            ? "This cycle is locked. Its production and sensor snapshot is available in Historical Data, while lifecycle actions remain available below."
            : "Realtime CCTV, sensor readings, production records, cycle progress, system health, and on-demand AI summary for the cycle in progress."}
        </p>
      </section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(420px,2fr)]">
        {/* CCTV Section */}
        <section className="min-w-0">
          <h2 className="mb-4 text-2xl font-semibold">CCTV Monitoring</h2>

          {/* Show single zone CCTV when zone is selected */}
          {selectedZone !== "ALL" && (
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950 shadow-lg">
              <div className="relative h-full">
                <CameraFeed
                  zone={selectedZone}
                  available={selectedZone === "A"}
                  disconnected={false}
                  replay={IS_REPLAY_MODE}
                  replayPlaying={isReplayPlaying}
                  replayProgress={
                    replayMaximumIndex > 0
                      ? replayIndex / replayMaximumIndex
                      : 0
                  }
                  // dummySrc="/video/cctv ayam 1_tracked-stay.mp4"
                  dummySrc="/video/raw_video_dataset_seg1.mp4"
                  className="h-full w-full object-cover"
                />
                <div className="absolute right-4 top-4 rounded-lg bg-black/50 px-3 py-1 text-sm font-medium text-white">
                  {cycle.houseName}
                </div>
              </div>
            </div>
          )}

          {/* Show all zones CCTV when ALL is selected */}
          {selectedZone === "ALL" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {ACTIVE_ZONES.map((zone) => (
                <div
                  key={zone}
                  className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950 shadow-lg"
                >
                  <div className="relative h-full">
                    <CameraFeed
                      zone={zone}
                      available={zone === "A"}
                      disconnected={false}
                      replay={IS_REPLAY_MODE}
                      replayPlaying={isReplayPlaying}
                      replayProgress={
                        replayMaximumIndex > 0
                          ? replayIndex / replayMaximumIndex
                          : 0
                      }
                      // dummySrc="/video/cctv ayam 1_tracked-stay.mp4"
                      dummySrc="/video/raw_video_dataset_seg1.mp4"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute right-4 top-4 rounded-lg bg-black/50 px-3 py-1 text-sm font-medium text-white">
                      Zone {zone}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          {/* Live Readings */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold">
              {IS_REPLAY_MODE ? "Replay Sensor Readings" : "Realtime Readings"} – {cycle.houseName}
            </h2>

            {/* ================= ALL ZONES ================= */}
            {selectedZone === "ALL" && liveByZone && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {liveByZone.map((item) => {
                  const hasAlert = item.values.some((v) => v.value > item.limit);

                  return (
                    <div
                      key={item.label}
                      className={`rounded-2xl border p-4 shadow-sm ${
                        hasAlert
                          ? "border-amber-200 bg-amber-50"
                          : "border-green-200 bg-green-50"
                      }`}
                    >
                      <div className="mb-2 text-3xl">{item.icon}</div>
                      <p className="mb-2 text-sm text-gray-600">{item.label}</p>

                      <div className="space-y-2 text-sm">
                        {item.values
                          .filter((value) =>
                            ACTIVE_ZONES.includes(value.zone as Zone)
                          )
                          .map((v) => {
                            const isHigh = v.value > item.limit;

                            return (
                              <div
                                key={v.zone}
                                className="grid grid-cols-[70px_auto] items-center"
                              >
                                <span className="text-xs text-gray-400">
                                  Zone {v.zone}
                                </span>
                                <span
                                  className={`text-sm font-semibold ${readingClass(
                                    item.label,
                                    v.value,
                                    item.limit
                                  )}`}
                                >
                                  {v.value.toFixed(2)} {item.unit}
                                  {isHigh && (
                                    <span className="ml-2 text-[10px] uppercase tracking-wide">
                                      High
                                    </span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ================= SINGLE ZONE ================= */}
            {selectedZone !== "ALL" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {IS_OPERATIONAL || IS_REPLAY_MODE
                  ? buildCards(latestSafe, selectedZone).map((item, idx) => (
                      <CardItem key={idx} item={item} />
                    ))
                  : INACTIVE_SENSOR_CARDS.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
                      >
                        <div className="mb-2 text-3xl grayscale">{item.icon}</div>
                        <p className="text-sm text-slate-600">
                          {item.label} ({selectedZone})
                        </p>
                        <p className="text-xl font-bold text-slate-500">—</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Inactive
                        </p>
                      </div>
                    ))}
              </div>
            )}
          </section>

          {/* System Health */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">
              {IS_REPLAY_MODE ? "System & Replay Status" : "System Health & Uptime"}
            </h2>
            <div className="grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-4 text-sm shadow sm:grid-cols-2">
              <div>
                📡 Status: {IS_REPLAY_MODE
                  ? "Replay Mode"
                  : sensorError
                    ? "Error"
                    : allData.length
                      ? "Online"
                      : "Starting…"}
              </div>
              <div>
                🕒 {IS_REPLAY_MODE ? "Replay Timestamp" : "Latest Reading"}: {latestSafe.time}
              </div>
              <div>
                📅 Data Window: {IS_REPLAY_MODE && overviewReplayCycle
                  ? `${overviewReplayCycle.startDate} to ${overviewReplayCycle.endDate}`
                  : sensorMeta
                  ? `${sensorMeta.runtimeStart} to ${sensorMeta.runtimeEnd}`
                  : "-"}
              </div>
              <div>
                📦 Records: {IS_REPLAY_MODE ? `${replayIndex + 1} / ${replayData.length}` : sensorMeta?.records ?? allData.length}
              </div>
              <div>🧪 Data Source: {IS_REPLAY_MODE ? "Stored Cycle Sensors" : "Environmental Sensors"}</div>
              <div>
                ✅ Monitoring: {IS_REPLAY_MODE ? "Replay Data" : "Active"}
              </div>
              {sensorError && (
                <div className="text-sm text-red-600 sm:col-span-2">
                  {sensorError}
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
      {IS_REPLAY_MODE && replayPoint && (
        <OverviewReplayInsight
          point={latestSafe}
          recentPoints={replayRecentPoints}
          cycle={cycle}
          summary={harvestSummary}
          activeAlertCount={visibleAlerts.filter(
            (entry) => entry.status === "active"
          ).length}
          zoneLabel={selectedZone === "ALL" ? "All Zones" : `Zone ${selectedZone}`}
          onGenerateStart={() => setIsReplayPlaying(false)}
        />
      )}
        </>
      )}

      {activeTab === "environment" && (
        <CurrentCycleSensorTrends
          series={visibleSensorSeries}
          disconnected={!IS_OPERATIONAL && !IS_REPLAY_MODE}
          replay={IS_REPLAY_MODE}
        />
      )}

      {activeTab === "production" && (
        selectedZone !== "ALL" ? (
          <ProductionCyclePanel
            key={`${cycle.zone}:${cycle.id}`}
            cycle={cycle}
            summary={harvestSummary}
            onChange={handleCycleChange}
            onStart={handleStartCycle}
            onReset={handleResetCycle}
            onComplete={handleCompleteCycle}
            onReopen={handleReopenCycle}
            onDownload={generatePDFReport}
            isDownloading={isDownloadingPDF}
            readOnly={!IS_OPERATIONAL}
            replay={IS_REPLAY_MODE}
          />
        ) : (
          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            {IS_REPLAY_MODE
              ? `All zones are following Batch ${overviewReplayCycle?.production.sourceSummary?.batch ?? 7} replay at Day ${replayCycleDay}. Select a zone for its synchronized cycle view.`
              : hasActiveCycle
              ? "Multi-zone sensor and production comparisons are shown below. Select a specific zone to manage its cycle."
              : "Environmental sensors remain active across all three zones. Select a specific zone when you are ready to start its production cycle."}
          </section>
        )
      )}

      {/* ================= HISTORICAL TREND ANALYSIS ================= */}
      {activeTab === "history" && (
        <>
      <section
        data-testid="historical-data-section"
        className="order-2"
      >
        <div
          className={`rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-white p-5 shadow-sm ${
            isHistoricalDataOpen ? "mb-6" : ""
          }`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
                Historical Data
              </div>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                Completed Production Cycles
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                {selectedZone === "ALL"
                  ? "Historical cycles are intentionally shown one zone at a time because each zone now has its own start date and flock timeline. Select Zone A, B, or C above to continue."
                  : `Review environmental trends, production outcomes, and lessons from completed flocks for Zone ${selectedZone}.`}
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              {selectedZone === "ALL" ? (
                <span className="rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm">
                  Select one zone to view its history
                </span>
              ) : (
                <>
                  <span className="text-xs font-medium text-violet-700">
                    {historicalCycles.length} Zone {selectedZone} completed cycle
                    {historicalCycles.length === 1 ? "" : "s"} available
                  </span>
                  {historicalCycles.length === 0 ? (
                    <span className="inline-flex min-w-52 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-500">
                      No completed cycle data
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-expanded={isHistoricalDataOpen}
                        aria-controls="historical-data-content"
                        onClick={() =>
                          setIsHistoricalDataOpen((isOpen) => !isOpen)
                        }
                        className="inline-flex min-w-52 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
                      >
                        {isHistoricalDataOpen
                          ? "Hide Historical Data"
                          : "Show Historical Data"}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          fill="none"
                          className={`h-4 w-4 transition-transform ${
                            isHistoricalDataOpen ? "rotate-180" : ""
                          }`}
                        >
                          <path
                            d="m5 7.5 5 5 5-5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={generateHistoricalPDFReport}
                        disabled={
                          isDownloadingHistoricalPDF ||
                          !selectedHistoricalCycle
                        }
                        className="inline-flex min-w-52 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
                      >
                        {isDownloadingHistoricalPDF
                          ? "Generating completed report…"
                          : "Download Completed Cycle Report"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {selectedZone !== "ALL" && isHistoricalDataOpen && (
        <>
          <section
            id="historical-data-content"
            className="order-2 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow"
          >
            <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-fuchsia-50/50 to-white p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                    Completed cycle environment
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                    Historical Cycle Sensor Trends
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm text-slate-600">
                    Complete stored environmental readings for Zone{" "}
                    {selectedZone}. Select a completed cycle and aggregation to
                    review its performance consistently with the Current Cycle
                    view.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-violet-100 bg-white px-2.5 py-1 text-violet-800">
                      Zone {selectedZone} completed records
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                      {selectedHistoricalCycle?.id ?? "Completed cycle"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                      {chartData.length > 0
                        ? `${chartData.length} stored readings`
                        : "Sensor data not provided"}
                    </span>
                  </div>
                </div>
                <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  {selectedHistoricalCycle?.status ?? "Completed"}
                </span>
              </div>
            </div>

            <div className="p-5">

        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <label className="block w-full md:max-w-xl">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Production cycle
              </span>
              <select
                value={selectedHistoricalCycleKey}
                onChange={(event) =>
                  setSelectedHistoricalCycleKey(
                    event.target.value as HistoricalCycle["key"]
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {historicalCycles.map((historicalCycle) => (
                  <option
                    key={historicalCycle.key}
                    value={historicalCycle.key}
                  >
                    {historicalCycle.label} · {historicalCycle.id} ·{" "}
                    {historicalCycle.startDate} – {historicalCycle.endDate}
                  </option>
                ))}
              </select>
            </label>
            <span className="w-fit rounded-full border border-violet-100 bg-white px-2.5 py-1 text-xs font-medium text-violet-700">
              Cycle snapshot
            </span>
          </div>

          {selectedHistoricalCycle && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-4 xl:grid-cols-9">
              {[
                [
                  "Period",
                  `${selectedHistoricalCycle.startDate} – ${selectedHistoricalCycle.endDate}`,
                ],
                ["Harvest", `Day ${selectedHistoricalCycle.harvestDay}`],
                [
                  "Readings",
                  selectedHistoricalCycle.data.length || "Not provided",
                ],
                [
                  "Avg temp",
                  selectedHistoricalCycle.data.length
                    ? `${selectedHistoricalCycle.averages.temp.toFixed(2)} °C`
                    : "Not provided",
                ],
                [
                  "Avg humidity",
                  selectedHistoricalCycle.data.length
                    ? `${selectedHistoricalCycle.averages.humidity.toFixed(2)}%`
                    : "Not provided",
                ],
                [
                  "Avg CO₂",
                  selectedHistoricalCycle.data.length
                    ? `${selectedHistoricalCycle.averages.co2.toFixed(0)} ppm`
                    : "Not provided",
                ],
                [
                  "Avg NH₃",
                  selectedHistoricalCycle.data.length
                    ? `${selectedHistoricalCycle.averages.nh3.toFixed(2)} ppm`
                    : "Not provided",
                ],
                [
                  "Avg PM2.5",
                  selectedHistoricalCycle.data.length
                    ? `${selectedHistoricalCycle.averages.pm25.toFixed(2)} µg/m³`
                    : "Not provided",
                ],
                [
                  "Source",
                  selectedHistoricalCycle.sourceLabel ??
                  (selectedHistoricalCycle.revision
                    ? `#${selectedHistoricalCycle.revision}`
                    : "Stored cycle"),
                ],
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className={`min-w-0 ${index === 0 ? "col-span-2" : ""}`}
                >
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedHistoricalCycle?.completionNotes && (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
              <span className="font-semibold">Completion notes:</span>{" "}
              {selectedHistoricalCycle.completionNotes}
            </div>
          )}
          {selectedHistoricalCycle?.auditLog?.length ? (
            <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                Lifecycle audit trail · {selectedHistoricalCycle.auditLog.length}{" "}
                events
              </summary>
              <div className="mt-3 space-y-2">
                {[...selectedHistoricalCycle.auditLog]
                  .reverse()
                  .map((event) => (
                    <div
                      key={event.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold capitalize">
                          {event.type}
                        </span>
                        <span>{event.timestamp.replace("T", " ").slice(0, 16)}</span>
                      </div>
                      {event.reason && <p className="mt-1">{event.reason}</p>}
                    </div>
                  ))}
              </div>
            </details>
          ) : null}
        </div>

        {selectedHistoricalCycle?.data.length ? (
          <>
        {/* Controls */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="historical-parameter"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Select Parameter
            </label>
            <select
              id="historical-parameter"
              value={selectedParam}
              onChange={(e) => setSelectedParam(e.target.value as any)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
            >
              <option value="all">All Parameters</option>
              <option value="temp">Temperature (°C)</option>
              <option value="humidity">Humidity (%)</option>
              <option value="co2">CO₂ (ppm)</option>
              <option value="nh3">NH₃ (ppm)</option>
              <option value="pm25">PM2.5 (µg/m³)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="historical-aggregation"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Aggregation
            </label>
            <select
              id="historical-aggregation"
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as any)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
            >
              <option value="all">Raw stored readings</option>
              <option value="hourly">Hourly average</option>
              <option value="daily">Daily average (per date)</option>
              <option value="weekly">Weekly average (Mon–Sun)</option>
              <option value="monthly">Monthly average</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => {
              setIsApplying(true);

              // simulasi loading biar keliatan "diproses"
              setTimeout(() => {
                setAppliedParam(selectedParam);
                setAppliedAggregation(aggregation);
                setIsApplying(false);
              }, 600); // 0.6 detik (UX enak)
            }}
            className={`px-5 py-2 rounded-lg font-medium text-white transition
      ${
        isApplying
          ? "bg-gray-400 cursor-not-allowed"
          : "bg-violet-600 hover:bg-violet-700"
      }
    `}
            disabled={isApplying}
          >
            {isApplying ? "Applying..." : "Apply Trend"}
          </button>
        </div>
        {!isApplying && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>{aggregationDescriptions[appliedAggregation]}</span>
            <span className="font-medium text-slate-800">
              {trendChartData.length} plotted points
            </span>
          </div>
        )}
        </div>
        {isApplying && (
          <div className="flex justify-center items-center h-48 text-gray-500">
            <span className="animate-pulse">Loading trend data…</span>
          </div>
        )}
        {!isApplying && (
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {SENSOR_METRICS.filter(showParam).map(
              (metric, index, visibleMetrics) => {
                const rule = SENSOR_ALERT_RULES[metric];
                const summary = historicalTrendSummaries[metric];
                const historicalZone = selectedZone as Zone;

                return (
                  <SensorTrendCard
                    key={metric}
                    title={rule.label}
                    unit={rule.unit}
                    valueDigits={metric === "co2" ? 0 : 2}
                    emphasized={
                      visibleMetrics.length > 1 &&
                      index === visibleMetrics.length - 1
                    }
                    summaries={[
                      {
                        id: historicalZone,
                        label: `Zone ${historicalZone}`,
                        color: ZONE_COLORS[historicalZone],
                        ...summary,
                      },
                    ]}
                  >
                    <div className="h-60">
                      <ResponsiveContainer
                        key={`${metric}-${selectedHistoricalCycleKey}-${appliedAggregation}`}
                        width="100%"
                        height="100%"
                      >
                        <LineChart
                          data={trendChartData}
                          margin={{ top: 8, right: 14, bottom: 4, left: 2 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                          />
                          <XAxis
                            dataKey="ts"
                            type="number"
                            scale="time"
                            domain={["dataMin", "dataMax"]}
                            tickFormatter={(value) =>
                              formatTrendTick(value, appliedAggregation)
                            }
                            minTickGap={55}
                            tickCount={6}
                            tick={{ fontSize: 11 }}
                          />
                          <YAxis
                            width={56}
                            domain={["auto", "auto"]}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip
                            labelFormatter={(value) =>
                              formatTrendTooltipLabel(
                                value,
                                appliedAggregation
                              )
                            }
                            isAnimationActive={false}
                            animationDuration={0}
                            cursor={trendCursor}
                            wrapperStyle={trendTooltipWrapper}
                          />
                          <ReferenceLine
                            y={rule.threshold}
                            stroke="#f59e0b"
                            strokeDasharray="5 4"
                            ifOverflow="extendDomain"
                            label={{
                              value: `Limit ${rule.threshold}`,
                              position: "insideTopRight",
                              fill: "#b45309",
                              fontSize: 10,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey={metric}
                            name={`Zone ${historicalZone}`}
                            stroke={SENSOR_METRIC_COLORS[metric]}
                            strokeWidth={2.25}
                            dot={
                              appliedAggregation === "daily" ||
                              appliedAggregation === "weekly" ||
                              appliedAggregation === "monthly"
                                ? { r: 2.5 }
                                : false
                            }
                            activeDot={{ r: 4 }}
                            connectNulls
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </SensorTrendCard>
                );
              }
            )}
          </div>
        )}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 p-6 text-center">
            <h3 className="font-semibold text-slate-900">
              Environmental sensor data not provided
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              The source summary contains production results for this batch,
              but no stored temperature, humidity, CO₂, NH₃, or PM2.5
              readings. The production performance remains available below.
            </p>
          </div>
        )}
            </div>
      </section>

      {/* ======================= Historical Correlation Insight ======================= */}
      {selectedHistoricalCycle && selectedHistoricalCycle.data.length > 0 && (
      <section className="order-2 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-fuchsia-50/50 to-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
            Relationship analysis
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">
            Historical Correlation Insight
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Correlations calculated from{" "}
            {selectedHistoricalCycle?.label ??
              "the selected historical cycle"}
            .
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2 2xl:grid-cols-3">
          {/* ================= Temperature vs CO₂ ================= */}
          <article className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="font-semibold text-slate-950">
              Temperature vs CO₂
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Relationship between temperature and CO₂ concentration
            </p>

            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                >
                  <defs>
                    <linearGradient
                      id="historical-temp-co2"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop
                        offset="0%"
                        stopColor={SENSOR_METRIC_COLORS.temp}
                      />
                      <stop
                        offset="100%"
                        stopColor={SENSOR_METRIC_COLORS.co2}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                  <XAxis
                    type="number"
                    dataKey="temp"
                    domain={[20, 40]}
                    tick={{ fill: SENSOR_METRIC_COLORS.temp }}
                    label={{
                      value: "Temperature (°C)",
                      position: "bottom",
                      offset: 20,
                      fill: SENSOR_METRIC_COLORS.temp,
                    }}
                  />

                  <YAxis
                    type="number"
                    dataKey="co2"
                    domain={[0, 1500]}
                    tick={{ fill: SENSOR_METRIC_COLORS.co2 }}
                    label={{
                      value: "CO₂ (ppm)",
                      angle: -90,
                      position: "insideLeft",
                      offset: -10,
                      fill: SENSOR_METRIC_COLORS.co2,
                    }}
                  />

                  <Tooltip content={<TempCo2Tooltip />} />

                  {correlationSeries.map((s) => (
                    <Scatter
                      key={`${s.zone}-co2`}
                      data={s.data}
                      fill="url(#historical-temp-co2)"
                      opacity={0.8}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <SensorPairLegend metrics={["temp", "co2"]} />
          </article>

          {/* ================= Temperature vs NH₃ ================= */}
          <article className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="font-semibold text-slate-950">
              Temperature vs NH₃
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Relationship between temperature and ammonia level
            </p>

            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                >
                  <defs>
                    <linearGradient
                      id="historical-temp-nh3"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop
                        offset="0%"
                        stopColor={SENSOR_METRIC_COLORS.temp}
                      />
                      <stop
                        offset="100%"
                        stopColor={SENSOR_METRIC_COLORS.nh3}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                  <XAxis
                    type="number"
                    dataKey="temp"
                    domain={[20, 40]}
                    tick={{ fill: SENSOR_METRIC_COLORS.temp }}
                    label={{
                      value: "Temperature (°C)",
                      position: "bottom",
                      offset: 20,
                      fill: SENSOR_METRIC_COLORS.temp,
                    }}
                  />

                  <YAxis
                    type="number"
                    dataKey="nh3"
                    domain={[0, 6]}
                    tick={{ fill: SENSOR_METRIC_COLORS.nh3 }}
                    label={{
                      value: "NH₃ (ppm)",
                      angle: -90,
                      position: "insideLeft",
                      offset: -10,
                      fill: SENSOR_METRIC_COLORS.nh3,
                    }}
                  />

                  <Tooltip content={<TempNh3Tooltip />} />

                  {correlationSeries.map((s) => (
                    <Scatter
                      key={`${s.zone}-nh3`}
                      data={s.data}
                      fill="url(#historical-temp-nh3)"
                      opacity={0.8}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <SensorPairLegend metrics={["temp", "nh3"]} />
          </article>

          {/* ================= Humidity vs PM2.5 ================= */}
          <article className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 lg:col-span-2 2xl:col-span-1">
            <h3 className="font-semibold text-slate-950">
              Humidity vs PM2.5
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Relationship between humidity and PM2.5 concentration
            </p>

            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                >
                  <defs>
                    <linearGradient
                      id="historical-humidity-pm25"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop
                        offset="0%"
                        stopColor={SENSOR_METRIC_COLORS.humidity}
                      />
                      <stop
                        offset="100%"
                        stopColor={SENSOR_METRIC_COLORS.pm25}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                  <XAxis
                    type="number"
                    dataKey="humidity"
                    domain={[40, 100]}
                    tick={{ fill: SENSOR_METRIC_COLORS.humidity }}
                    label={{
                      value: "Humidity (%)",
                      position: "bottom",
                      offset: 20,
                      fill: SENSOR_METRIC_COLORS.humidity,
                    }}
                  />

                  <YAxis
                    type="number"
                    dataKey="pm25"
                    domain={[0, 50]}
                    tick={{ fill: SENSOR_METRIC_COLORS.pm25 }}
                    label={{
                      value: "PM2.5 (µg/m³)",
                      angle: -90,
                      position: "insideLeft",
                      offset: -10,
                      fill: SENSOR_METRIC_COLORS.pm25,
                    }}
                  />

                  <Tooltip content={<HumiPm25Tooltip />} />

                  {correlationSeries.map((s) => (
                    <Scatter
                      key={`${s.zone}-pm25`}
                      data={s.data}
                      fill="url(#historical-humidity-pm25)"
                      opacity={0.8}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <SensorPairLegend metrics={["humidity", "pm25"]} />
          </article>
        </div>
          </section>
      )}
        </>
      )}

      {selectedZone !== "ALL" && isHistoricalDataOpen && selectedHistoricalCycle && (
        <HistoricalProductionOverview
          cycle={selectedHistoricalCycle}
        />
      )}

      {selectedZone !== "ALL" && isHistoricalDataOpen && selectedHistoricalCycle && (
        <section className="order-2">
          <HistoricalCycleAiAnalysis
            cycle={selectedHistoricalCycle}
            onReportAnalysisChange={handleHistoricalReportAnalysisChange}
          />
        </section>
      )}
        </>
      )}

      {/* ============ Production Monitoring ============ */}
      {activeTab === "production" && (
        <>
      {hasStartedCycle ? (
        <section>
        {!isAllZone && cycle.status === "completed" && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            This cycle is completed and production entry is locked. Review its
            fixed snapshot in Historical Data, or reopen it with a reason to
            make corrections.
          </div>
        )}
        {isAllZone && (
          <p className="-mt-2 mb-4 text-sm text-gray-500">
            Showing production data for zones with a started cycle. Select a
            specific zone to manage its daily records.
          </p>
        )}

        <ProductionPerformanceCharts
          title="Current Production Performance"
          description={
            productionReportZones.length === 1
              ? `Mortality, feed, water, and body-weight records for Zone ${productionReportZone} · ${dashboardCyclesByZone[productionReportZone].id}.`
              : `Each zone uses its own active cycle: ${productionReportZones
                  .map(
                    (zone) =>
                      `Zone ${zone} ${dashboardCyclesByZone[zone].id} (Day ${harvestSummariesByZone[zone].cycleDay})`
                  )
                  .join(" · ")}.`
          }
          periodLabel={
            productionReportZones.length === 1
              ? `${dashboardCyclesByZone[productionReportZone].startDate} – ${
                  dashboardCyclesByZone[productionReportZone].actualHarvestDate ??
                  reportDatasets[productionReportZone]
                    .at(-1)
                    ?.time.slice(0, 10) ??
                  "Current"
                }`
              : "Independent per-zone cycle periods"
          }
          series={currentProductionSeries}
        />

        {IS_OPERATIONAL && !isAllZone && cycle.status === "active" && (
          <DailyProductionLog
            cycleId={cycle.id}
            startDate={cycle.startDate}
            targetHarvestDay={cycle.targetHarvestDay}
            initialBirds={cycle.initialBirds}
            zone={selectedZone}
            mortalityEntries={visibleMortality}
            consumptionEntries={visibleConsumptions}
            weightEntries={visibleWeights}
            onSave={saveDailyProductionLog}
          />
        )}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-xl font-semibold text-slate-900">
            Current Production Performance
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            No production cycle has started. Mortality, feed, water, body
            weight, FCR, and cycle prediction will appear after a flock cycle
            is started for the selected zone.
          </p>
        </section>
      )}

      {(IS_OPERATIONAL || IS_REPLAY_MODE) && hasActiveCycle && (
        <CurrentCyclePrediction
          inputs={currentPredictionInputs}
          onReportAnalysisChange={handleCurrentReportAnalysisChange}
          replay={IS_REPLAY_MODE}
        />
      )}
        </>
      )}
      </DashboardTabPanel>
    </DashboardShell>
  );
}

export default function DashboardPage() {
  return (
    <DashboardNavigationProvider activeZones={ACTIVE_ZONES}>
      <DashboardContent />
    </DashboardNavigationProvider>
  );
}
