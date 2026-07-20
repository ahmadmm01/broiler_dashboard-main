/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { standardBroilerWeight } from "./lib/broilerStandard";
import {
  createDemoConsumptionEntries,
  createDemoMortalityEntries,
  createDemoWeightEntries,
} from "./lib/demoData";
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
  summarizeData,
} from "./lib/sensorData";
import {
  createHistoricalCycles,
  type HistoricalCycle,
  type HistoricalProductionData,
} from "./lib/historicalCycles";
import type {
  AlertEvent,
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
import CameraFeed from "./components/CameraFeed";
import DailyProductionLog, {
  type DailyProductionLogInput,
} from "./components/DailyProductionLog";
import NotificationCenter from "./components/NotificationCenter";
import ProductionCyclePanel from "./components/ProductionCyclePanel";
import CurrentCyclePrediction, {
  type CurrentCyclePredictionInput,
} from "./components/CurrentCyclePrediction";
import CurrentCycleSensorTrends from "./components/CurrentCycleSensorTrends";
import HistoricalCycleAiAnalysis from "./components/HistoricalCycleAiAnalysis";
import HistoricalProductionOverview from "./components/HistoricalProductionOverview";
import ProductionPerformanceCharts, {
  type ProductionPerformanceSeries,
} from "./components/ProductionPerformanceCharts";
import { getSensorAlertConditions } from "./lib/alertRules";
import {
  buildDeterministicCycleSummary,
  calculateHarvestSummary,
  createDemoProductionCycles,
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
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  ScatterChart,
  Scatter,
} from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ========= Helpers =========

const configuredReplayInterval = Number(
  process.env.NEXT_PUBLIC_SENSOR_REPLAY_INTERVAL_MS ?? 60_000
);
const REALTIME_INTERVAL_MS =
  Number.isFinite(configuredReplayInterval) && configuredReplayInterval >= 60_000
    ? configuredReplayInterval
    : 60_000;
const ALL_ZONES: Zone[] = ["A", "B", "C"];
const configuredZones = (process.env.NEXT_PUBLIC_ACTIVE_ZONES ?? "A,B,C")
  .split(",")
  .map((zone) => zone.trim().toUpperCase())
  .filter((zone): zone is Zone => ALL_ZONES.includes(zone as Zone));
const ACTIVE_ZONES: Zone[] = Array.from(new Set(configuredZones));
if (ACTIVE_ZONES.length === 0) ACTIVE_ZONES.push(...ALL_ZONES);
const IS_SINGLE_ZONE = ACTIVE_ZONES.length === 1;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type SelectableZone = "ALL" | Zone;
type AggregationMode = "all" | "hourly" | "daily" | "weekly" | "monthly";
const isAllZoneSelected = (zone: SelectableZone): zone is "ALL" =>
  zone === "ALL";
type TrendDatum = {
  ts: number;
  time: string;
  dayLabel: string;
  [key: string]: number | string | undefined;
};

function dedupeAlertsById(alerts: AlertEvent[]) {
  const seenIds = new Set<string>();

  return alerts.filter((alert) => {
    if (seenIds.has(alert.id)) return false;
    seenIds.add(alert.id);
    return true;
  });
}

function readingClass(label: string, value: number, limit: number) {
  if (value <= limit) return "text-gray-900";
  if (label === "NH₃") return "text-orange-600";
  if (label === "PM2.5") return "text-yellow-700";
  return "text-red-600";
}

const aggregationDescriptions: Record<AggregationMode, string> = {
  all: "One-minute readings are sampled to a maximum of 2,000 plotted points for responsive review.",
  hourly: "Average of all one-minute readings within each clock hour.",
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

function metricStatus(value: number, limit: number, highText = "High") {
  return value > limit ? highText : "Normal";
}

function buildReportActions(summary: ReturnType<typeof summarizeData>) {
  if (!summary) return ["No sensor data is available for this report window."];

  const actions: string[] = [];
  if (summary.temp.max > 32) {
    actions.push("Check ventilation and cooling because temperature exceeded 32°C.");
  }
  if (summary.co2.max > 1200) {
    actions.push("Increase air exchange because CO₂ exceeded 1200 ppm.");
  }
  if (summary.nh3.max > 5) {
    actions.push("Inspect litter condition and airflow because NH₃ exceeded 5 ppm.");
  }
  if (summary.pm25.max > 35) {
    actions.push("Review dust sources, feed handling, and cleaning because PM2.5 exceeded 35 µg/m³.");
  }
  if (summary.humidity.max > 85) {
    actions.push("Reduce moisture sources because humidity exceeded 85%.");
  }

  return actions.length
    ? actions
    : ["Current readings are within configured thresholds. Continue routine monitoring."];
}

function buildReportMetricRows(latestData: DataPoint | undefined) {
  return latestData
    ? [
        ["Temperature", `${latestData.temp.toFixed(2)} °C`, "≤ 32 °C", metricStatus(latestData.temp, 32)],
        ["Humidity", `${latestData.humidity.toFixed(2)} %`, "≤ 85 %", metricStatus(latestData.humidity, 85)],
        ["CO₂", `${latestData.co2.toFixed(0)} ppm`, "≤ 1200 ppm", metricStatus(latestData.co2, 1200)],
        ["NH₃", `${latestData.nh3.toFixed(2)} ppm`, "≤ 5 ppm", metricStatus(latestData.nh3, 5)],
        ["PM2.5", `${latestData.pm25.toFixed(2)} µg/m³`, "≤ 35 µg/m³", metricStatus(latestData.pm25, 35)],
      ]
    : [];
}

function countLatestAlerts(latestData: DataPoint | undefined) {
  if (!latestData) return 0;
  return [
    latestData.temp > 32,
    latestData.humidity > 85,
    latestData.co2 > 1200,
    latestData.nh3 > 5,
    latestData.pm25 > 35,
  ].filter(Boolean).length;
}

function reportStatus(alertCount: number, actions: string[]) {
  return alertCount > 0
    ? "Attention Required"
    : actions.length > 1
      ? "Watchlist"
      : "Normal";
}

function reportStatusColor(status: string) {
  if (status === "Normal") return "#15803d";
  if (status === "Watchlist") return "#b45309";
  return "#b91c1c";
}

function buildZoneReportSection(
  label: string,
  dataset: DataPoint[],
  dateWindow: string,
  options: { compact?: boolean } = {}
) {
  const latestData = dataset.at(-1);
  const summary = summarizeData(dataset);
  const actions = buildReportActions(summary);
  const alertCount = countLatestAlerts(latestData);
  const status = reportStatus(alertCount, actions);
  const statusColor = reportStatusColor(status);
  const metricRows = buildReportMetricRows(latestData);
  const sectionBreak = options.compact ? "page-break-inside: avoid;" : "";

  return `
    <section style="${sectionBreak} margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
      <div style="display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom: 14px;">
        <div>
          <h2 style="color: #111827; font-size: 20px; margin: 0;">${label}</h2>
          <p style="margin: 4px 0 0; color:#64748b; font-size: 13px;">Data window: ${dateWindow}</p>
        </div>
        <div style="text-align:right;">
          <div style="display:inline-block; padding: 6px 12px; border-radius:999px; background:${statusColor}; color:#fff; font-size:12px; font-weight:700;">${status}</div>
          <div style="margin-top:5px; color:#64748b; font-size:12px;">Records: ${dataset.length} · Alerts: ${alertCount}</div>
        </div>
      </div>

      ${
        metricRows.length > 0
          ? `
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <tr style="background-color: #eff6ff;">
            <th style="border: 1px solid #dbeafe; padding: 10px; text-align: left;">Parameter</th>
            <th style="border: 1px solid #dbeafe; padding: 10px; text-align: left;">Latest Value</th>
            <th style="border: 1px solid #dbeafe; padding: 10px; text-align: left;">Threshold</th>
            <th style="border: 1px solid #dbeafe; padding: 10px; text-align: left;">Status</th>
          </tr>
          ${metricRows
            .map(
              ([name, value, threshold, rowStatus], index) => `
              <tr style="background-color: ${index % 2 ? "#f8fafc" : "#ffffff"};">
                <td style="border: 1px solid #e5e7eb; padding: 10px;">${name}</td>
                <td style="border: 1px solid #e5e7eb; padding: 10px; font-weight: 700;">${value}</td>
                <td style="border: 1px solid #e5e7eb; padding: 10px;">${threshold}</td>
                <td style="border: 1px solid #e5e7eb; padding: 10px; color: ${rowStatus === "Normal" ? "#15803d" : "#b91c1c"}; font-weight: 700;">${rowStatus}</td>
              </tr>`
            )
            .join("")}
        </table>`
          : "<p style='color: #dc2626;'>No data available</p>"
      }

      ${
        summary
          ? `
        <table style="width: 100%; border-collapse: collapse; margin-top: 14px;">
          <tr style="background-color: #f8fafc;">
            <th style="border: 1px solid #e5e7eb; padding: 9px; text-align: left;">Statistic</th>
            <th style="border: 1px solid #e5e7eb; padding: 9px; text-align: left;">Temperature</th>
            <th style="border: 1px solid #e5e7eb; padding: 9px; text-align: left;">Humidity</th>
            <th style="border: 1px solid #e5e7eb; padding: 9px; text-align: left;">CO₂</th>
            <th style="border: 1px solid #e5e7eb; padding: 9px; text-align: left;">NH₃</th>
            <th style="border: 1px solid #e5e7eb; padding: 9px; text-align: left;">PM2.5</th>
          </tr>
          <tr>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">Average</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.temp.avg.toFixed(2)} °C</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.humidity.avg.toFixed(2)} %</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.co2.avg.toFixed(0)} ppm</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.nh3.avg.toFixed(2)} ppm</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.pm25.avg.toFixed(2)} µg/m³</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="border: 1px solid #e5e7eb; padding: 9px;">Peak</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.temp.max.toFixed(2)} °C</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.humidity.max.toFixed(2)} %</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.co2.max.toFixed(0)} ppm</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.nh3.max.toFixed(2)} ppm</td>
            <td style="border: 1px solid #e5e7eb; padding: 9px;">${summary.pm25.max.toFixed(2)} µg/m³</td>
          </tr>
        </table>`
          : ""
      }

      <div style="margin-top: 14px; background:#fff7ed; border:1px solid #fed7aa; border-radius: 10px; padding: 13px;">
        <h3 style="color: #111827; font-size: 15px; margin: 0 0 8px;">Recommended Actions</h3>
        <ol style="margin: 0; padding-left: 20px;">
          ${actions.map((action) => `<li style="margin-bottom: 6px;">${action}</li>`).join("")}
        </ol>
      </div>
    </section>
  `;
}

const zoneLegendConfig = {
  A: { label: "Zone A", dot: "bg-red-500", text: "text-red-500" },
  B: { label: "Zone B", dot: "bg-blue-500", text: "text-blue-500" },
  C: { label: "Zone C", dot: "bg-green-500", text: "text-green-500" },
} as const;

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

export default function DashboardPage() {
  const [selectedZone, setSelectedZone] = useState<SelectableZone>(
    IS_SINGLE_ZONE ? (ACTIVE_ZONES[0] ?? "A") : "ALL"
  );
  const isAllZone = selectedZone === "ALL";

  // ====== Sensor data ======
  const [allData, setAllData] = useState<DataPoint[]>([]);
  //const [index, setIndex] = useState(0);
  //const [lastUpdate, setLastUpdate] = useState<string>("");
  const [weights, setWeights] = usePersistentState<WeightEntry[]>(
    "broiler-dashboard:v8:weights",
    createDemoWeightEntries
  );
  // ====== Health & Behavior (prototype) ======
  // Mortality
  const [mortality, setMortality] = usePersistentState<MortalityEntry[]>(
    "broiler-dashboard:v8:mortality",
    createDemoMortalityEntries
  );
  const [storedCycles, setCycles] = usePersistentState<
    Record<Zone, ProductionCycle>
  >(
    "broiler-dashboard:v8:zone-cycles",
    createDemoProductionCycles
  );
  const cyclesByZone = useMemo<Record<Zone, ProductionCycle>>(
    () =>
      Object.fromEntries(
        ALL_ZONES.map((zone) => [
          zone,
          normalizeProductionCycle(
            storedCycles[zone] ?? createDemoProductionCycles()[zone],
            zone
          ),
        ])
      ) as Record<Zone, ProductionCycle>,
    [storedCycles]
  );
  const selectedCycleZone: Zone =
    selectedZone === "ALL" ? (ACTIVE_ZONES[0] ?? "A") : selectedZone;
  const cycle = cyclesByZone[selectedCycleZone];

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

  const [alerts, setAlerts] = usePersistentState<AlertEvent[]>(
    "broiler-dashboard:v8:alerts",
    () => []
  );
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [latestToast, setLatestToast] = useState<AlertEvent | null>(null);
  const alertFlagsRef = useRef<Record<Zone, Record<SensorMetric, boolean>>>({
    A: { temp: false, humidity: false, co2: false, nh3: false, pm25: false },
    B: { temp: false, humidity: false, co2: false, nh3: false, pm25: false },
    C: { temp: false, humidity: false, co2: false, nh3: false, pm25: false },
  });

  // Consumption
  const [consumptions, setConsumptions] = usePersistentState<ConsumptionEntry[]>(
    "broiler-dashboard:v8:consumptions",
    createDemoConsumptionEntries
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
  const cycleAlerts = useMemo(
    () =>
      dedupeAlertsById(
        alerts.filter(
          (entry) => entry.cycleId === cyclesByZone[entry.zone].id
        )
      ),
    [alerts, cyclesByZone]
  );
  const visibleAlerts = useMemo(
    () =>
      selectedZone === "ALL"
        ? cycleAlerts
        : cycleAlerts.filter((entry) => entry.zone === selectedZone),
    [cycleAlerts, selectedZone]
  );

  // ===== Visualization Controls =====
  // ===== Visualization Controls =====
  const [selectedParam, setSelectedParam] = useState<
    "all" | "temp" | "humidity" | "co2" | "nh3" | "pm25"
  >("all");
  // ===== PDF Report Download =====
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  const [aggregation, setAggregation] = useState<AggregationMode>("daily");
  const [selectedHistoricalCycleKey, setSelectedHistoricalCycleKey] =
    useState<HistoricalCycle["key"]>("");
  const [isHistoricalDataOpen, setIsHistoricalDataOpen] = useState(false);
  const [managedHistoricalCycles, setManagedHistoricalCycles] =
    usePersistentState<HistoricalCycle[]>(
      "broiler-dashboard:v8:managed-historical-cycles",
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
            (historicalCycle) => historicalCycle.zone === selectedZone
          ),
    [allHistoricalCycles, selectedZone]
  );
  const selectedHistoricalCycle = useMemo(
    () =>
      historicalCycles.find(
        (historicalCycle) =>
          historicalCycle.key === selectedHistoricalCycleKey
      ) ?? historicalCycles[0],
    [historicalCycles, selectedHistoricalCycleKey]
  );
  useEffect(() => {
    if (selectedZone === "ALL") {
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
        color: ZONE_COLORS[zone],
        data: applyAgg(zoneData[zone]),
      }));
    }

    return [
      {
        zone: selectedZone,
        color: ZONE_COLORS[selectedZone],
        data: aggregatedData,
      },
    ];
  }, [selectedZone, appliedAggregation, aggregatedData, zoneData]);

  // Append one deterministic one-minute sensor reading while the demo is open.
  useEffect(() => {
    if (allData.length === 0) return;

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
  const livePoint = allData.at(-1);
  const liveZoneData = useMemo(() => {
    if (!livePoint) return null;

    const latestIndex = Math.max(0, allData.length - 1);
    return {
      A: getZonePoint(livePoint, latestIndex, allData.length, "A"),
      B: getZonePoint(livePoint, latestIndex, allData.length, "B"),
      C: getZonePoint(livePoint, latestIndex, allData.length, "C"),
    };
  }, [allData.length, livePoint]);

  // ====== Fetch sensor data from local data API ======
  useEffect(() => {
    let isMounted = true;

    fetch("/api/sensors")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch broiler data");
        return res.json();
      })
      .then((payload: SensorApiResponse) => {
        if (!isMounted) return;

        const mapped = payload.data;
        setAllData(mapped);
        setSensorMeta(payload.meta);
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

  useEffect(() => {
    if (!liveZoneData) return;

    const nextFlags = Object.fromEntries(
      ALL_ZONES.map((zone) => [zone, { ...alertFlagsRef.current[zone] }])
    ) as Record<Zone, Record<SensorMetric, boolean>>;
    const newAlerts: AlertEvent[] = [];
    const resolvedConditions: Array<{ zone: Zone; metric: SensorMetric }> = [];

    ACTIVE_ZONES.forEach((zone) => {
      const zoneCycle = cyclesByZone[zone];
      if (zoneCycle.status !== "active") return;

      const point = liveZoneData[zone];
      getSensorAlertConditions(point).forEach((condition) => {
        const isAbove = condition.value > condition.threshold;
        const wasAbove = alertFlagsRef.current[zone][condition.metric];

        if (isAbove && !wasAbove) {
          newAlerts.push({
            id: `${zoneCycle.id}-${zone}-${condition.metric}-${point.ts}`,
            cycleId: zoneCycle.id,
            zone,
            metric: condition.metric,
            label: condition.label,
            timestamp: point.time,
            value: condition.value,
            threshold: condition.threshold,
            unit: condition.unit,
            severity:
              condition.value >= condition.criticalThreshold
                ? "critical"
                : "warning",
            status: "active",
            message: `Zone ${zone}: ${condition.label} crossed its configured limit. ${condition.action}`,
          });
        }

        if (!isAbove && wasAbove) {
          resolvedConditions.push({ zone, metric: condition.metric });
        }
        nextFlags[zone][condition.metric] = isAbove;
      });
    });

    alertFlagsRef.current = nextFlags;
    const existingAlertIds = new Set(alerts.map((alert) => alert.id));
    const uniqueNewAlerts = newAlerts.filter(
      (alert) => !existingAlertIds.has(alert.id)
    );

    if (uniqueNewAlerts.length || resolvedConditions.length) {
      setAlerts((previous) => {
        const resolved = previous.map((alert) => {
          const shouldResolve = resolvedConditions.some(
            ({ zone, metric }) =>
              alert.zone === zone &&
              alert.cycleId === cyclesByZone[zone].id &&
              alert.metric === metric
          );
          return shouldResolve && alert.status !== "resolved"
            ? { ...alert, status: "resolved" as const }
            : alert;
        });
        return dedupeAlertsById([...uniqueNewAlerts, ...resolved]).slice(0, 100);
      });
    }

    if (uniqueNewAlerts.length) {
      setLatestToast(uniqueNewAlerts[0]);
      if (soundEnabled) {
        void new Audio("/sound/alert.mp3").play().catch(() => undefined);
      }
    }
  }, [alerts, cyclesByZone, liveZoneData, setAlerts, soundEnabled]);

  useEffect(() => {
    if (!latestToast) return;
    const timeout = window.setTimeout(() => setLatestToast(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [latestToast]);

  const acknowledgeAlert = (id: string) => {
    setAlerts((previous) =>
      previous.map((alert) =>
        alert.id === id && alert.status === "active"
          ? { ...alert, status: "acknowledged" }
          : alert
      )
    );
  };

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
  const reportDatasets = useMemo<Record<Zone, DataPoint[]>>(() => {
    return Object.fromEntries(
      ALL_ZONES.map((zone) => {
        const zoneCycle = cyclesByZone[zone];
        return [
          zone,
          allData
          .map((point, index) =>
            getZonePoint(point, index, allData.length, zone)
          )
          .filter((point) => {
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
  }, [allData, cyclesByZone]);
  const visibleSensorSeries = useMemo(
    () =>
      reportZones.map((zone) => ({
        zone,
        cycle: cyclesByZone[zone],
        data: reportDatasets[zone],
      })),
    [cyclesByZone, reportDatasets, reportZones]
  );
  const reportZone: Zone = reportZones[0] ?? "A";
  const reportDataset = reportDatasets[reportZone];
  const currentProductionByZone = useMemo<Record<Zone, HistoricalProductionData>>(() => {
    return Object.fromEntries(
      ALL_ZONES.map((zone) => {
        const zoneCycle = cyclesByZone[zone];
        const mortalityByDate = new Map<string, number>();
        cycleMortality
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
          feedWater: cycleConsumptions
            .filter((entry) => entry.zone === zone)
            .map((entry) => ({
              day: dateToDayNumber(entry.date, zoneCycle.startDate),
              date: entry.date,
              feedKgPerBird: entry.feedKg,
              waterLPerBird: entry.waterL,
            }))
            .sort((left, right) => left.day - right.day),
          weights: cycleWeights
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
    cycleConsumptions,
    cycleMortality,
    cycleWeights,
    cyclesByZone,
  ]);
  const currentProductionSeries = useMemo<ProductionPerformanceSeries[]>(
    () =>
      reportZones.map((zone) => ({
        key: zone,
        label: `Zone ${zone}`,
        color: ZONE_COLORS[zone],
        production: currentProductionByZone[zone],
      })),
    [currentProductionByZone, reportZones]
  );

  const harvestSummariesByZone = useMemo<Record<Zone, HarvestSummary>>(
    () =>
      Object.fromEntries(
        ALL_ZONES.map((zone) => [
          zone,
          calculateHarvestSummary({
            cycle: cyclesByZone[zone],
            mortality: cycleMortality,
            consumptions: cycleConsumptions,
            weights: cycleWeights,
            sensorData: reportDatasets[zone],
            alerts: cycleAlerts.filter((entry) => entry.zone === zone),
            zone,
          }),
        ])
      ) as Record<Zone, HarvestSummary>,
    [
      cycleAlerts,
      cycleConsumptions,
      cycleMortality,
      cycleWeights,
      cyclesByZone,
      reportDatasets,
    ]
  );
  const harvestSummary = harvestSummariesByZone[reportZone];
  const currentPredictionInputs = useMemo<CurrentCyclePredictionInput[]>(
    () =>
      reportZones.map((zone) => ({
        zone,
        cycle: cyclesByZone[zone],
        summary: harvestSummariesByZone[zone],
        sensorData: reportDatasets[zone],
      })),
    [cyclesByZone, harvestSummariesByZone, reportDatasets, reportZones]
  );

  const handleCycleChange = (changes: ProductionCycle) => {
    if (selectedZone === "ALL" || cycle.status !== "active") return;
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
    if (selectedZone === "ALL") return;
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
    setLatestToast(null);
    alertFlagsRef.current[zone] = {
      temp: false,
      humidity: false,
      co2: false,
      nh3: false,
      pm25: false,
    };
  };

  const handleCompleteCycle = (input: CompleteCycleInput) => {
    if (selectedZone === "ALL" || cycle.status !== "active") return;
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
  };

  const handleReopenCycle = (reason: string) => {
    if (
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

  const deterministicSummary = useMemo(
    () => buildDeterministicCycleSummary(cycle, harvestSummary, reportDataset),
    [cycle, harvestSummary, reportDataset]
  );

  const reportSummary = useMemo(() => summarizeData(reportDataset), [reportDataset]);

  const reportActions = useMemo(() => {
    return buildReportActions(reportSummary);
  }, [reportSummary]);

  // ===== PDF Report Generation =====
  const generatePDFReport = async () => {
    try {
      setIsDownloadingPDF(true);

      // Create a temporary container for report content
      const reportContainer = document.createElement("div");
      reportContainer.style.position = "absolute";
      reportContainer.style.left = "-9999px";
      reportContainer.style.width = "1000px";
      reportContainer.style.padding = "40px";
      reportContainer.style.backgroundColor = "white";
      reportContainer.style.fontFamily = "Arial, sans-serif";

      // Generate report HTML
      const reportDate = new Date().toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const selectedZoneLabel = `${cycle.houseName} · Zone ${reportZone}`;

      const latestData = reportDataset.at(-1);
      const generatedAt = new Date().toLocaleString("id-ID");
      const dateWindow =
        sensorMeta?.runtimeStart && sensorMeta?.runtimeEnd
          ? `${sensorMeta.runtimeStart} to ${sensorMeta.runtimeEnd}`
          : `${reportDataset[0]?.time ?? "-"} to ${latestData?.time ?? "-"}`;
      const alertCount = harvestSummary.alertCount;
      const overallStatus = reportStatus(alertCount, reportActions);
      const statusColor = reportStatusColor(overallStatus);
      const zoneSections = buildZoneReportSection(
        selectedZoneLabel,
        reportDataset,
        dateWindow
      );
      const reportNarrative = escapeHtml(deterministicSummary).replaceAll(
        "\n",
        "<br/>"
      );
      const safeCycleId = cycle.id.replace(/[^a-zA-Z0-9_-]/g, "_");

      const reportHTML = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #172033;">
          <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; border-bottom: 3px solid #2563eb; padding-bottom: 18px;">
            <div>
              <h1 style="margin: 0; color: #111827; font-size: 30px;">Broiler End-of-Cycle Report</h1>
              <p style="margin: 6px 0 0; color: #64748b; font-size: 14px;">iSENS-COOP Smart Sensing System</p>
            </div>
            <div style="text-align: right;">
              <div style="display: inline-block; padding: 8px 14px; border-radius: 999px; background: ${statusColor}; color: #fff; font-weight: 700;">${overallStatus}</div>
              <p style="margin: 10px 0 0; color: #64748b; font-size: 12px;">${reportDate}</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 26px;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 10px; padding: 14px;">
              <div style="font-size: 11px; color:#64748b; text-transform: uppercase;">House</div>
              <div style="font-size: 20px; font-weight: 700;">${escapeHtml(selectedZoneLabel)}</div>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 10px; padding: 14px;">
              <div style="font-size: 11px; color:#64748b; text-transform: uppercase;">Cycle</div>
              <div style="font-size: 16px; font-weight: 700;">${escapeHtml(cycle.id)}</div>
              <div style="margin-top:4px; font-size:11px; color:#64748b; text-transform:uppercase;">${cycle.status} · revision ${cycle.revision}</div>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 10px; padding: 14px;">
              <div style="font-size: 11px; color:#64748b; text-transform: uppercase;">Birds Remaining</div>
              <div style="font-size: 20px; font-weight: 700;">${harvestSummary.survivingBirds.toLocaleString()}</div>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius: 10px; padding: 14px;">
              <div style="font-size: 11px; color:#64748b; text-transform: uppercase;">Generated</div>
              <div style="font-size: 13px; font-weight: 700;">${generatedAt}</div>
            </div>
          </div>

          <section style="page-break-inside: avoid; margin-bottom: 28px;">
            <h2 style="font-size:20px; margin:0 0 12px;">Production & Harvest KPI</h2>
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
              <tr style="background:#eff6ff;">
                <th style="border:1px solid #dbeafe; padding:9px; text-align:left;">Birds placed</th>
                <th style="border:1px solid #dbeafe; padding:9px; text-align:left;">Mortality</th>
                <th style="border:1px solid #dbeafe; padding:9px; text-align:left;">Mortality rate</th>
                <th style="border:1px solid #dbeafe; padding:9px; text-align:left;">Final avg weight</th>
              </tr>
              <tr>
                <td style="border:1px solid #e5e7eb; padding:9px;">${cycle.initialBirds.toLocaleString()}</td>
                <td style="border:1px solid #e5e7eb; padding:9px;">${harvestSummary.totalMortality}</td>
                <td style="border:1px solid #e5e7eb; padding:9px;">${harvestSummary.mortalityRate.toFixed(2)}%</td>
                <td style="border:1px solid #e5e7eb; padding:9px;">${harvestSummary.finalAverageWeightKg.toFixed(3)} kg</td>
              </tr>
              <tr style="background:#eff6ff;">
                <th style="border:1px solid #dbeafe; padding:9px; text-align:left;">Feed / bird</th>
                <th style="border:1px solid #dbeafe; padding:9px; text-align:left;">Water / bird</th>
                <th style="border:1px solid #dbeafe; padding:9px; text-align:left;">FCR estimate</th>
                <th style="border:1px solid #dbeafe; padding:9px; text-align:left;">Live weight</th>
              </tr>
              <tr>
                <td style="border:1px solid #e5e7eb; padding:9px;">${harvestSummary.totalFeedPerBirdKg.toFixed(2)} kg</td>
                <td style="border:1px solid #e5e7eb; padding:9px;">${harvestSummary.totalWaterPerBirdL.toFixed(2)} L</td>
                <td style="border:1px solid #e5e7eb; padding:9px;">${harvestSummary.fcr.toFixed(2)}</td>
                <td style="border:1px solid #e5e7eb; padding:9px;">${harvestSummary.totalLiveWeightKg.toFixed(0)} kg</td>
              </tr>
            </table>
            <div style="margin-top:12px; padding:12px; border-radius:10px; background:#f0fdf4; border:1px solid #bbf7d0;">
              <strong>Sensor health: ${harvestSummary.sensorHealth.status}</strong> · ${harvestSummary.sensorHealth.completeness.toFixed(1)}% completeness · ${harvestSummary.alertCount} alert events
            </div>
          </section>

          ${zoneSections}

          <section style="page-break-inside: avoid; margin: 24px 0; padding:16px; border:1px solid #c4b5fd; background:#f5f3ff; border-radius:12px;">
            <h2 style="font-size:20px; margin:0 0 10px; color:#5b21b6;">AI-Assisted Cycle Summary</h2>
            <div style="font-size:13px;">${reportNarrative}</div>
            <p style="font-size:11px; color:#6b7280; margin:12px 0 0;">Decision-support narrative. Confirm findings through physical inspection and farm records.</p>
          </section>

          <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #999;">
            <p>This report was generated by iSENS-COOP System for monitoring and operational review.</p>
            <p>Interpret recommendations together with physical inspection and farm management records.</p>
          </div>
        </div>
      `;

      reportContainer.innerHTML = reportHTML;
      document.body.appendChild(reportContainer);

      // Convert HTML to canvas
      const canvas = await html2canvas(reportContainer, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
      });

      // Create PDF
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = canvas.height * (imgWidth / canvas.width);
      let heightLeft = imgHeight;
      let position = 0;

      // Add image to PDF
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add multiple pages if needed
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download PDF
      pdf.save(`broiler_cycle_report_${safeCycleId}_${reportDate}.pdf`);

      // Clean up
      document.body.removeChild(reportContainer);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF report");
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full max-w-none flex-col gap-8 px-3 py-6 sm:px-5 lg:px-8 2xl:px-10">
      {/* Header */}
      <header className="mb-0 flex flex-col items-center justify-center gap-4 xl:flex-row xl:gap-8">
        <div className="flex shrink-0 gap-4">
          <Image
            src="/img/umpsa.png"
            alt="Logo UMPSA"
            width={6000}
            height={1115}
            priority
            className="h-20 w-auto object-contain sm:h-24 xl:h-20"
          />
        </div>
        <div className="text-center xl:text-left">
          <h1 className="text-3xl font-bold xl:max-w-4xl">
            iSENS-COOP: Smart Sensing System for Poultry House Monitoring
          </h1>
        </div>
      </header>

      <hr className="border-gray-300 my-4" />
      {/* Global Controls - Sticky */}
      <section className="sticky top-0 z-50 bg-gray-50 rounded-2xl p-4 shadow-lg border-b-2 border-gray-300">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">Monitored house</div>
              {IS_SINGLE_ZONE ? (
                <div className="font-semibold">
                  {cycle.houseName} · Zone {ACTIVE_ZONES[0]}
                </div>
              ) : (
                <select
                  value={selectedZone}
                  onChange={(event) =>
                    setSelectedZone(event.target.value as SelectableZone)
                  }
                  className="mt-1 min-w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold"
                  aria-label="Select monitored zone"
                >
                  <option value="ALL">All Zones</option>
                  {ACTIVE_ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      Zone {zone}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
              Sensor Replay · {REALTIME_INTERVAL_MS / 1000}s refresh
            </span>
            {reportZones.map((zone) => {
              const zoneCycle = cyclesByZone[zone];
              const zoneSummary = harvestSummariesByZone[zone];
              return (
                <span
                  key={zone}
                  className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                >
                  Zone {zone} · {zoneCycle.status === "completed" ? "Completed" : "Active"} · Day {zoneSummary.cycleDay}/{zoneCycle.targetHarvestDay}
                </span>
              );
            })}
            <span className="text-xs text-gray-500">
              Current record: {latestSafe.time}
            </span>
          </div>

          <NotificationCenter
            alerts={visibleAlerts}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled((enabled) => !enabled)}
            onAcknowledge={acknowledgeAlert}
          />

        </div>
      </section>

      {latestToast && (
        <div className={`fixed top-24 right-6 z-[80] max-w-sm rounded-2xl border shadow-2xl p-4 ${latestToast.severity === "critical" ? "bg-red-50 border-red-300" : "bg-amber-50 border-amber-300"}`}>
          <div className="font-semibold">⚠️ {latestToast.label} alert</div>
          <div className="text-sm mt-1">{latestToast.message}</div>
          <div className="text-xs text-gray-500 mt-2">{latestToast.timestamp}</div>
        </div>
      )}

      <section className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
          Current Data Monitoring
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">
          {isAllZone
            ? "Independent Active Zone Cycles"
            : cycle.status === "completed"
            ? "Completed Cycle Review"
            : "Active Production Cycle"}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {isAllZone
            ? "Zone A, B, and C are monitored on their own cycle timelines. Their cycle day, production records, environmental data, and AI summary are kept separate below."
            : cycle.status === "completed"
            ? "This cycle is locked. Its production and sensor snapshot is available in Historical Data, while lifecycle actions remain available below."
            : "Realtime CCTV, sensor readings, production records, cycle progress, system health, and on-demand AI summary for the cycle in progress."}
        </p>
      </section>

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
                  // dummySrc="/video/cctv ayam 1_tracked-stay.mp4"
                  dummySrc="/video/raw_video_dataset.mp4"
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
                      // dummySrc="/video/cctv ayam 1_tracked-stay.mp4"
                      dummySrc="/video/raw_video_dataset.mp4"
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
              Realtime Readings – {cycle.houseName}
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
                {buildCards(latestSafe, selectedZone).map((item, idx) => (
                  <CardItem key={idx} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* System Health */}
          <section>
            <h2 className="mb-3 text-xl font-semibold">System Health & Uptime</h2>
            <div className="grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-4 text-sm shadow sm:grid-cols-2">
              <div>
                📡 Status: {sensorError ? "Error" : allData.length ? "Online" : "Starting…"}
              </div>
              <div>🕒 Latest Reading: {latestSafe.time}</div>
              <div>
                📅 Data Window: {sensorMeta
                  ? `${sensorMeta.runtimeStart} to ${sensorMeta.runtimeEnd}`
                  : "-"}
              </div>
              <div>📦 Records: {sensorMeta?.records ?? allData.length}</div>
              <div>🧪 Data Source: Sensor Replay</div>
              <div>
                ✅ Completeness: {harvestSummary.sensorHealth.completeness.toFixed(1)}%
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

      <CurrentCycleSensorTrends series={visibleSensorSeries} />

      {selectedZone !== "ALL" ? (
        <ProductionCyclePanel
          key={`${cycle.zone}:${cycle.id}`}
          cycle={cycle}
          summary={harvestSummary}
          onChange={handleCycleChange}
          onStart={handleStartCycle}
          onComplete={handleCompleteCycle}
          onReopen={handleReopenCycle}
          onDownload={generatePDFReport}
          isDownloading={isDownloadingPDF}
        />
      ) : (
        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          Multi-zone sensor, production, and AI comparisons are shown below.
          Select a specific zone when you need to manage the cycle or download
          a zone-only report.
        </section>
      )}

      {/* ================= HISTORICAL TREND ANALYSIS ================= */}
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
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {selectedZone !== "ALL" && isHistoricalDataOpen && (
        <>
          <section id="historical-data-content" className="order-2">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-2xl font-semibold">
            Historical Cycle Trends · Zone {selectedZone}
          </h2>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Zone {selectedZone} history · static
          </span>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          These charts use complete stored Zone {selectedZone} production
          cycles. Realtime sensor replay only updates the readings and alerts
          above.
        </p>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
                    {historicalCycle.label} · {historicalCycle.id} · {historicalCycle.startDate} – {historicalCycle.endDate}
                  </option>
                ))}
              </select>
            </label>
            <span className="w-fit rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {selectedHistoricalCycle?.status ?? "Completed"}
            </span>
          </div>

          {selectedHistoricalCycle && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-4 xl:grid-cols-9">
              {[
                ["Period", `${selectedHistoricalCycle.startDate} – ${selectedHistoricalCycle.endDate}`],
                ["Harvest", `Day ${selectedHistoricalCycle.harvestDay}`],
                ["Readings", selectedHistoricalCycle.data.length],
                ["Avg temp", `${selectedHistoricalCycle.averages.temp.toFixed(2)} °C`],
                ["Avg humidity", `${selectedHistoricalCycle.averages.humidity.toFixed(2)}%`],
                ["Avg CO₂", `${selectedHistoricalCycle.averages.co2} ppm`],
                ["Avg NH₃", `${selectedHistoricalCycle.averages.nh3.toFixed(2)} ppm`],
                ["Avg PM2.5", `${selectedHistoricalCycle.averages.pm25.toFixed(2)} µg/m³`],
                [
                  "Revision",
                  selectedHistoricalCycle.revision
                    ? `#${selectedHistoricalCycle.revision}`
                    : "Seed data",
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

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
              className="w-full border rounded-lg px-3 py-2"
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
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="all">Raw readings (1-minute, sampled)</option>
              <option value="hourly">Hourly average</option>
              <option value="daily">Daily average (per date)</option>
              <option value="weekly">Weekly average (Mon–Sun)</option>
              <option value="monthly">Monthly average</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-4">
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
          : "bg-blue-600 hover:bg-blue-700"
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
        {isApplying && (
          <div className="flex justify-center items-center h-48 text-gray-500">
            <span className="animate-pulse">Loading trend data…</span>
          </div>
        )}
        {!isApplying && (
          <>

        {/* ================= TEMPERATURE ================= */}
        {showParam("temp") && (
          <div className="mb-6 bg-white rounded-2xl shadow p-4 h-72">
            <h3 className="font-semibold">Temperature (°C)</h3>

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
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
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    formatTrendTooltipLabel(value, appliedAggregation)
                  }
                  isAnimationActive={false}
                  animationDuration={0}
                  cursor={trendCursor}
                  wrapperStyle={trendTooltipWrapper}
                />
                <Legend />

                {isAllZoneSelected(selectedZone) ? (
                  <>
                    {ACTIVE_ZONES.map((zone) => (
                      <Line
                        key={zone}
                        dataKey={`temp${zone}`}
                        name={`Zone ${zone}`}
                        stroke={ZONE_COLORS[zone]}
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </>
                ) : (
                  <Line
                    dataKey="temp"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ================= HUMIDITY ================= */}
        {showParam("humidity") && (
          <div className="mb-6 bg-white rounded-2xl shadow p-4 h-72">
            <h3 className="font-semibold">Humidity (%)</h3>

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
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
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    formatTrendTooltipLabel(value, appliedAggregation)
                  }
                  isAnimationActive={false}
                  animationDuration={0}
                  cursor={trendCursor}
                  wrapperStyle={trendTooltipWrapper}
                />
                <Legend />

                {isAllZoneSelected(selectedZone) ? (
                  <>
                    {ACTIVE_ZONES.map((zone) => (
                      <Line
                        key={zone}
                        dataKey={`humidity${zone}`}
                        name={`Zone ${zone}`}
                        stroke={ZONE_COLORS[zone]}
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </>
                ) : (
                  <Line
                    dataKey="humidity"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ================= CO₂ ================= */}
        {showParam("co2") && (
          <div className="mb-6 bg-white rounded-2xl shadow p-4 h-72">
            <h3 className="font-semibold">CO₂ (ppm)</h3>

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
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
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    formatTrendTooltipLabel(value, appliedAggregation)
                  }
                  isAnimationActive={false}
                  animationDuration={0}
                  cursor={trendCursor}
                  wrapperStyle={trendTooltipWrapper}
                />
                <Legend />

                {isAllZoneSelected(selectedZone) ? (
                  <>
                    {ACTIVE_ZONES.map((zone) => (
                      <Line
                        key={zone}
                        dataKey={`co2${zone}`}
                        name={`Zone ${zone}`}
                        stroke={ZONE_COLORS[zone]}
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </>
                ) : (
                  <Line
                    dataKey="co2"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ================= NH₃ ================= */}
        {showParam("nh3") && (
          <div className="mb-6 bg-white rounded-2xl shadow p-4 h-72">
            <h3 className="font-semibold">NH₃ (ppm)</h3>

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
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
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    formatTrendTooltipLabel(value, appliedAggregation)
                  }
                  isAnimationActive={false}
                  animationDuration={0}
                  cursor={trendCursor}
                  wrapperStyle={trendTooltipWrapper}
                />
                <Legend />

                {isAllZoneSelected(selectedZone) ? (
                  <>
                    {ACTIVE_ZONES.map((zone) => (
                      <Line
                        key={zone}
                        dataKey={`nh3${zone}`}
                        name={`Zone ${zone}`}
                        stroke={ZONE_COLORS[zone]}
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </>
                ) : (
                  <Line
                    dataKey="nh3"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ================= PM2.5 ================= */}
        {showParam("pm25") && (
          <div className="mb-6 bg-white rounded-2xl shadow p-4 h-72">
            <h3 className="font-semibold">PM2.5 (µg/m³)</h3>

            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
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
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    formatTrendTooltipLabel(value, appliedAggregation)
                  }
                  isAnimationActive={false}
                  animationDuration={0}
                  cursor={trendCursor}
                  wrapperStyle={trendTooltipWrapper}
                />
                <Legend />

                {isAllZoneSelected(selectedZone) ? (
                  <>
                    {ACTIVE_ZONES.map((zone) => (
                      <Line
                        key={zone}
                        dataKey={`pm25${zone}`}
                        name={`Zone ${zone}`}
                        stroke={ZONE_COLORS[zone]}
                        dot={false}
                        activeDot={{ r: 3 }}
                        isAnimationActive={false}
                      />
                    ))}
                  </>
                ) : (
                  <Line
                    dataKey="pm25"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
          </>
        )}
      </section>

      {/* ======================= Historical Correlation Insight ======================= */}
      <section className="order-2">
        <h2 className="text-2xl font-semibold mb-1">
          Historical Correlation Insight
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Correlations are calculated from {selectedHistoricalCycle?.label ?? "the selected historical cycle"}.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ================= Temperature vs CO₂ ================= */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-medium">Temperature vs CO₂</h3>
            <p className="text-xs text-gray-500 mb-3">
              Relationship between temperature and CO₂ concentration
            </p>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />

                  <XAxis
                    type="number"
                    dataKey="temp"
                    domain={[20, 40]}
                    label={{
                      value: "Temperature (°C)",
                      position: "bottom",
                      offset: 20,
                    }}
                  />

                  <YAxis
                    type="number"
                    dataKey="co2"
                    domain={[0, 1500]}
                    label={{
                      value: "CO₂ (ppm)",
                      angle: -90,
                      position: "insideLeft",
                      offset: -10,
                    }}
                  />

                  <Tooltip content={<TempCo2Tooltip />} />

                  {correlationSeries.map((s) => (
                    <Scatter
                      key={`${s.zone}-co2`}
                      data={s.data}
                      fill={s.color}
                      opacity={0.7}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-6 mt-3 text-sm">
              {(isAllZoneSelected(selectedZone)
                ? ACTIVE_ZONES
                : ([selectedZone] as const)
              ).map((z) => (
                <span
                  key={z}
                  className={`flex items-center gap-2 ${zoneLegendConfig[z].text}`}
                >
                  <span
                    className={`w-3 h-3 rounded-full ${zoneLegendConfig[z].dot}`}
                  />
                  {zoneLegendConfig[z].label}
                </span>
              ))}
            </div>
          </div>

          {/* ================= Temperature vs NH₃ ================= */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-medium">Temperature vs NH₃</h3>
            <p className="text-xs text-gray-500 mb-3">
              Relationship between temperature and ammonia level
            </p>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />

                  <XAxis
                    type="number"
                    dataKey="temp"
                    domain={[20, 40]}
                    label={{
                      value: "Temperature (°C)",
                      position: "bottom",
                      offset: 20,
                    }}
                  />

                  <YAxis
                    type="number"
                    dataKey="nh3"
                    domain={[0, 6]}
                    label={{
                      value: "NH₃ (ppm)",
                      angle: -90,
                      position: "insideLeft",
                      offset: -10,
                    }}
                  />

                  <Tooltip content={<TempNh3Tooltip />} />

                  {correlationSeries.map((s) => (
                    <Scatter
                      key={`${s.zone}-nh3`}
                      data={s.data}
                      fill={s.color}
                      opacity={0.7}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-6 mt-3 text-sm">
              {(isAllZoneSelected(selectedZone)
                ? ACTIVE_ZONES
                : ([selectedZone] as const)
              ).map((z) => (
                <span
                  key={z}
                  className={`flex items-center gap-2 ${zoneLegendConfig[z].text}`}
                >
                  <span
                    className={`w-3 h-3 rounded-full ${zoneLegendConfig[z].dot}`}
                  />
                  {zoneLegendConfig[z].label}
                </span>
              ))}
            </div>
          </div>

          {/* ================= Humidity vs PM2.5 ================= */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-medium">Humidity vs PM2.5</h3>
            <p className="text-xs text-gray-500 mb-3">
              Relationship between humidity and PM2.5 concentration
            </p>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 40, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />

                  <XAxis
                    type="number"
                    dataKey="humidity"
                    domain={[40, 100]}
                    label={{
                      value: "Humidity (%)",
                      position: "bottom",
                      offset: 20,
                    }}
                  />

                  <YAxis
                    type="number"
                    dataKey="pm25"
                    domain={[0, 50]}
                    label={{
                      value: "PM2.5 (µg/m³)",
                      angle: -90,
                      position: "insideLeft",
                      offset: -10,
                    }}
                  />

                  <Tooltip content={<HumiPm25Tooltip />} />

                  {correlationSeries.map((s) => (
                    <Scatter
                      key={`${s.zone}-pm25`}
                      data={s.data}
                      fill={s.color}
                      opacity={0.7}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-6 mt-3 text-sm">
              {(isAllZoneSelected(selectedZone)
                ? ACTIVE_ZONES
                : ([selectedZone] as const)
              ).map((z) => (
                <span
                  key={z}
                  className={`flex items-center gap-2 ${zoneLegendConfig[z].text}`}
                >
                  <span
                    className={`w-3 h-3 rounded-full ${zoneLegendConfig[z].dot}`}
                  />
                  {zoneLegendConfig[z].label}
                </span>
              ))}
            </div>
          </div>
        </div>
          </section>
        </>
      )}

      {selectedZone !== "ALL" && isHistoricalDataOpen && selectedHistoricalCycle && (
        <HistoricalProductionOverview
          cycle={selectedHistoricalCycle}
        />
      )}

      {selectedZone !== "ALL" && isHistoricalDataOpen && selectedHistoricalCycle && (
        <section className="order-2">
          <HistoricalCycleAiAnalysis cycle={selectedHistoricalCycle} />
        </section>
      )}

      {/* ============ Production Monitoring ============ */}
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
            Showing all active zones. Select a specific zone above to add or
            update mortality, feed, water, and body weight records.
          </p>
        )}

        <ProductionPerformanceCharts
          title="Current Production Performance"
          description={
            reportZones.length === 1
              ? `Mortality, feed, water, and body-weight records for Zone ${reportZone} · ${cyclesByZone[reportZone].id}.`
              : `Each zone uses its own active cycle: ${reportZones
                  .map(
                    (zone) =>
                      `Zone ${zone} ${cyclesByZone[zone].id} (Day ${harvestSummariesByZone[zone].cycleDay})`
                  )
                  .join(" · ")}.`
          }
          periodLabel={
            reportZones.length === 1
              ? `${cycle.startDate} – ${
                  cycle.actualHarvestDate ??
                  reportDataset.at(-1)?.time.slice(0, 10) ??
                  "Current"
                }`
              : "Independent per-zone cycle periods"
          }
          series={currentProductionSeries}
        />

        {!isAllZone && cycle.status === "active" && (
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

      <CurrentCyclePrediction inputs={currentPredictionInputs} />

      {/* Footer Section */}
      <footer className="order-3 mt-10 border-t py-6 text-center text-sm text-gray-600">
        <p className="mb-2">© 2026 UMPSA • MOHE • IMaP. All rights reserved.</p>
        <p className="mb-4">Contact: kamarul@umpsa.edu.my</p>
        <p className="text-xs leading-relaxed">
          Disclaimer: The data and visualizations provided by iSENS-COOP are for research and monitoring purposes only. 
          Accuracy and reliability of predictions may vary. Users are responsible for interpreting and using the information appropriately.
        </p>
      </footer>
    </div>
  );
}
