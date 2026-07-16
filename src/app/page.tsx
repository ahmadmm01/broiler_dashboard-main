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
import { createZoneData, getZonePoint, summarizeData } from "./lib/sensorData";
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
import CurrentCyclePrediction from "./components/CurrentCyclePrediction";
import CurrentCycleSensorTrends from "./components/CurrentCycleSensorTrends";
import HistoricalCycleAiAnalysis from "./components/HistoricalCycleAiAnalysis";
import HistoricalProductionOverview from "./components/HistoricalProductionOverview";
import ProductionPerformanceCharts from "./components/ProductionPerformanceCharts";
import { getSensorAlertConditions } from "./lib/alertRules";
import {
  buildDeterministicCycleSummary,
  calculateHarvestSummary,
  createDemoProductionCycle,
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
  process.env.NEXT_PUBLIC_SENSOR_REPLAY_INTERVAL_MS ?? 15_000
);
const REALTIME_INTERVAL_MS =
  Number.isFinite(configuredReplayInterval) && configuredReplayInterval >= 5_000
    ? configuredReplayInterval
    : 15_000;
const LIVE_REPLAY_TAIL_POINTS = 24;
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
type AggregationMode = "all" | "daily" | "weekly" | "monthly";
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
  all: "Every stored 6-hour reading is shown.",
  daily: "Average of all readings for each calendar date.",
  weekly: "Average of available readings in each Monday–Sunday calendar week.",
  monthly: "Average of all readings for each calendar month.",
};

function getTrendPeriodStart(date: Date, mode: AggregationMode) {
  if (mode === "all") return new Date(date);

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
  if (mode === "all" || data.length === 0) return data;

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

type InsightBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

function cleanInsightText(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#+\s*/, "")
    .trim();
}

function parseInsightMarkdown(markdown: string): InsightBlock[] {
  const blocks: InsightBlock[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  };

  markdown.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const numberedHeading = line.match(/^(\d+)\.\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);

    if (heading) {
      flushList();
      blocks.push({ type: "heading", text: cleanInsightText(heading[1]) });
      return;
    }

    if (numberedHeading && line.length < 80) {
      flushList();
      blocks.push({
        type: "heading",
        text: `${numberedHeading[1]}. ${cleanInsightText(numberedHeading[2])}`,
      });
      return;
    }

    if (bullet) {
      listItems.push(cleanInsightText(bullet[1]));
      return;
    }

    flushList();
    blocks.push({ type: "paragraph", text: cleanInsightText(line) });
  });

  flushList();
  return blocks;
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
  // ====== Sensor data ======
  const [allData, setAllData] = useState<DataPoint[]>([]);
  //const [index, setIndex] = useState(0);
  //const [lastUpdate, setLastUpdate] = useState<string>("");
  const [weights, setWeights] = usePersistentState<WeightEntry[]>(
    "broiler-dashboard:v6:weights",
    createDemoWeightEntries
  );
  // ====== Health & Behavior (prototype) ======
  // Mortality
  const [mortality, setMortality] = usePersistentState<MortalityEntry[]>(
    "broiler-dashboard:v6:mortality",
    createDemoMortalityEntries
  );
  const [storedCycle, setCycle] = usePersistentState<ProductionCycle>(
    "broiler-dashboard:v6:production-cycle",
    createDemoProductionCycle
  );
  const cycle = useMemo(
    () => normalizeProductionCycle(storedCycle),
    [storedCycle]
  );
  useEffect(() => {
    if (
      !storedCycle.status ||
      !storedCycle.createdAt ||
      !storedCycle.updatedAt ||
      !Array.isArray(storedCycle.auditLog) ||
      storedCycle.id !== cycle.id
    ) {
      setCycle((current) => normalizeProductionCycle(current));
    }
  }, [cycle.id, setCycle, storedCycle]);
  const [alerts, setAlerts] = usePersistentState<AlertEvent[]>(
    "broiler-dashboard:v6:alerts",
    () => []
  );
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [latestToast, setLatestToast] = useState<AlertEvent | null>(null);
  const alertFlagsRef = useRef<Record<SensorMetric, boolean>>({
    temp: false,
    humidity: false,
    co2: false,
    nh3: false,
    pm25: false,
  });

  // ===== AI Insight =====
  const [selectedInsight, setSelectedInsight] = useState<string>("cycle");
  const [aiInsight, setAiInsight] = useState<string>("");
  const [aiInsightSignature, setAiInsightSignature] = useState<string | null>(
    null
  );
  const [requestedInsightSignature, setRequestedInsightSignature] = useState<
    string | null
  >(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const INSIGHT_OPTIONS = [
    {
      value: "overall",
      label: "Overall Environmental Condition",
      prompt: `
Generate an overall environmental insight.

Output format:
1. Summary
2. Key Observations
3. Potential Risks
4. Recommendations
`,
    },
    {
      value: "cycle",
      label: "End-of-Cycle Harvest Review",
      prompt: `
Analyze the complete broiler production cycle and harvest readiness.

Output format:
1. Cycle Summary
2. Production and Environmental Findings
3. Possible Causes and Risks
4. Priority Actions Before Sign-off
`,
    },
    {
      value: "thermal",
      label: "Thermal Comfort & Heat Stress Risk",
      prompt: `
Analyze temperature and humidity data to assess thermal comfort.

Output format:
1. Thermal Comfort Assessment
2. High-Risk Periods
3. Impact on Broiler Health
4. Mitigation Suggestions
`,
    },
    {
      value: "air",
      label: "Air Quality Risk Assessment",
      prompt: `
Evaluate air quality conditions (CO₂, NH₃, PM2.5).

Output format:
1. Air Quality Status
2. Exceedance Events
3. Health Implications
4. Recommended Control Measures
`,
    },
    {
      value: "trend",
      label: "Trend & Anomaly Detection",
      prompt: `
Identify trends and anomalies in the data.

Output format:
1. Identified Trends
2. Detected Anomalies
3. Possible Explanations
4. Follow-up Actions
`,
    },
  ];
  const buildInsightContext = () => {
    const summary = summarizeData(reportDataset);
    if (!summary) return "";

    return `
DATA CONTEXT:
- House: ${cycle.houseName}
- Zone: ${reportZone}
- Cycle ID: ${cycle.id}
- Lifecycle Status: ${cycle.status}
- Revision: ${cycle.revision}
- Actual Harvest Date: ${cycle.actualHarvestDate ?? "Not completed"}
- Current Cycle Day: ${harvestSummary.cycleDay}
- Ideal Cycle Length: ${cycle.targetHarvestDay} days
- Data Points: ${reportDataset.length}

PRODUCTION CONTEXT:
- Birds Placed: ${cycle.initialBirds}
- Recorded Mortality: ${harvestSummary.totalMortality}
- Mortality Rate: ${harvestSummary.mortalityRate.toFixed(2)}%
- Birds Remaining: ${harvestSummary.survivingBirds}
- Final Average Weight: ${harvestSummary.finalAverageWeightKg.toFixed(3)} kg
- Weight Variance vs Configured Standard: ${harvestSummary.weightVariancePercent.toFixed(2)}%
- Total Feed per Bird: ${harvestSummary.totalFeedPerBirdKg.toFixed(2)} kg
- Total Water per Bird: ${harvestSummary.totalWaterPerBirdL.toFixed(2)} L
- Estimated FCR: ${harvestSummary.fcr.toFixed(2)}
- Alert Events: ${harvestSummary.alertCount}
- Sensor Completeness: ${harvestSummary.sensorHealth.completeness.toFixed(1)}%

Temperature:
- Avg: ${summary.temp.avg.toFixed(2)} °C
- Min: ${summary.temp.min.toFixed(2)} °C
- Max: ${summary.temp.max.toFixed(2)} °C

Humidity:
- Avg: ${summary.humidity.avg.toFixed(2)} %
- Min: ${summary.humidity.min.toFixed(2)} %
- Max: ${summary.humidity.max.toFixed(2)} %

CO₂:
- Avg: ${summary.co2.avg.toFixed(0)} ppm
- Peak: ${summary.co2.max.toFixed(0)} ppm

NH₃:
- Avg: ${summary.nh3.avg.toFixed(2)} ppm
- Peak: ${summary.nh3.max.toFixed(2)} ppm

PM2.5:
- Avg: ${summary.pm25.avg.toFixed(2)} µg/m³
- Peak: ${summary.pm25.max.toFixed(2)} µg/m³

Thresholds:
Temperature ≤ 32°C
CO₂ ≤ 1200 ppm
NH₃ ≤ 5 ppm
PM2.5 ≤ 35 µg/m³

AUTHORITATIVE THRESHOLD EVALUATION:
- Temperature Peak: ${summary.temp.max > 32 ? "EXCEEDED" : "WITHIN"} (${summary.temp.max.toFixed(2)} °C vs 32 °C)
- CO₂ Peak: ${summary.co2.max > 1200 ? "EXCEEDED" : "WITHIN"} (${summary.co2.max.toFixed(0)} ppm vs 1200 ppm)
- NH₃ Peak: ${summary.nh3.max > 5 ? "EXCEEDED" : "WITHIN"} (${summary.nh3.max.toFixed(2)} ppm vs 5 ppm)
- PM2.5 Peak: ${summary.pm25.max > 35 ? "EXCEEDED" : "WITHIN"} (${summary.pm25.max.toFixed(2)} µg/m³ vs 35 µg/m³)
`;
  };
  const generateInsight = async () => {
    const requestSignature = currentInsightSignature;
    setRequestedInsightSignature(requestSignature);
    setIsGeneratingInsight(true);
    setAiInsight("");
    setAiInsightSignature(null);
    setAiError(null);

    try {
      const selected = INSIGHT_OPTIONS.find((i) => i.value === selectedInsight);

      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: buildInsightContext(),
          prompt: selected?.prompt,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to generate AI insight");
      }

      if (!json.insight) {
        throw new Error("AI insight response is empty");
      }

      setAiInsight(json.insight);
      setAiInsightSignature(requestSignature);
    } catch {
      setAiError(
        "AI enhancement is temporarily unavailable. A verified rule-based summary is shown instead."
      );
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  // Consumption
  const [consumptions, setConsumptions] = usePersistentState<ConsumptionEntry[]>(
    "broiler-dashboard:v6:consumptions",
    createDemoConsumptionEntries
  );
  const legacyDemoCycleId = `CYCLE-${cycle.startDate.replaceAll("-", "")}`;
  const activeDemoCycleId = `CYCLE-ACTIVE-${cycle.startDate.replaceAll("-", "")}`;

  useEffect(() => {
    const shouldScopeToCurrentCycle = (cycleId?: string) =>
      !cycleId ||
      (cycle.id === activeDemoCycleId &&
        cycleId === legacyDemoCycleId);

    if (mortality.some((entry) => shouldScopeToCurrentCycle(entry.cycleId))) {
      setMortality((previous) =>
        previous.map((entry) => ({
          ...entry,
          cycleId: shouldScopeToCurrentCycle(entry.cycleId)
            ? cycle.id
            : entry.cycleId,
        }))
      );
    }
    if (
      consumptions.some((entry) => shouldScopeToCurrentCycle(entry.cycleId))
    ) {
      setConsumptions((previous) =>
        previous.map((entry) => ({
          ...entry,
          cycleId: shouldScopeToCurrentCycle(entry.cycleId)
            ? cycle.id
            : entry.cycleId,
        }))
      );
    }
    if (weights.some((entry) => shouldScopeToCurrentCycle(entry.cycleId))) {
      setWeights((previous) =>
        previous.map((entry) => ({
          ...entry,
          cycleId: shouldScopeToCurrentCycle(entry.cycleId)
            ? cycle.id
            : entry.cycleId,
        }))
      );
    }
    const hasAlertsNeedingScope = alerts.some((entry) =>
      shouldScopeToCurrentCycle(entry.cycleId)
    );
    const hasDuplicateAlertIds =
      new Set(alerts.map((entry) => entry.id)).size !== alerts.length;

    if (hasAlertsNeedingScope || hasDuplicateAlertIds) {
      setAlerts((previous) =>
        dedupeAlertsById(
          previous.map((entry) => ({
            ...entry,
            cycleId: shouldScopeToCurrentCycle(entry.cycleId)
              ? cycle.id
              : entry.cycleId,
          }))
        )
      );
    }
  }, [
    alerts,
    activeDemoCycleId,
    consumptions,
    cycle.id,
    legacyDemoCycleId,
    mortality,
    setAlerts,
    setConsumptions,
    setMortality,
    setWeights,
    weights,
  ]);

  const cycleMortality = useMemo(
    () =>
      mortality.filter(
        (entry) =>
          entry.cycleId === cycle.id &&
          entry.date >= cycle.startDate &&
          (!cycle.actualHarvestDate || entry.date <= cycle.actualHarvestDate)
      ),
    [cycle.actualHarvestDate, cycle.id, cycle.startDate, mortality]
  );
  const cycleConsumptions = useMemo(
    () =>
      consumptions.filter(
        (entry) =>
          entry.cycleId === cycle.id &&
          entry.date >= cycle.startDate &&
          (!cycle.actualHarvestDate || entry.date <= cycle.actualHarvestDate)
      ),
    [consumptions, cycle.actualHarvestDate, cycle.id, cycle.startDate]
  );
  const cycleWeights = useMemo(
    () => weights.filter((entry) => entry.cycleId === cycle.id),
    [cycle.id, weights]
  );
  const cycleAlerts = useMemo(
    () =>
      dedupeAlertsById(
        alerts.filter((entry) => entry.cycleId === cycle.id)
      ),
    [alerts, cycle.id]
  );

  // ===== Visualization Controls =====
  // ===== Visualization Controls =====
  const [selectedParam, setSelectedParam] = useState<
    "all" | "temp" | "humidity" | "co2" | "nh3" | "pm25"
  >("all");
  const [selectedZone, setSelectedZone] = useState<SelectableZone>(
    IS_SINGLE_ZONE ? (ACTIVE_ZONES[0] ?? "A") : "ALL"
  );
  const isAllZone = selectedZone === "ALL";

  // ===== PDF Report Download =====
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  const [aggregation, setAggregation] = useState<AggregationMode>("all");
  const [selectedHistoricalCycleKey, setSelectedHistoricalCycleKey] =
    useState<HistoricalCycle["key"]>("latest");
  const [isHistoricalDataOpen, setIsHistoricalDataOpen] = useState(false);
  const [managedHistoricalCycles, setManagedHistoricalCycles] =
    usePersistentState<HistoricalCycle[]>(
      "broiler-dashboard:v7:managed-historical-cycles",
      () => []
    );
  // ================= APPLY FILTER STATE =================
  const [appliedParam, setAppliedParam] = useState(selectedParam);
  const [appliedAggregation, setAppliedAggregation] = useState(aggregation);
  const [isApplying, setIsApplying] = useState(false);

  const historicalCycles = useMemo(() => {
    const managedIds = new Set(
      managedHistoricalCycles.map((historicalCycle) => historicalCycle.id)
    );
    const seededCycles = createHistoricalCycles().filter(
      (historicalCycle) => !managedIds.has(historicalCycle.id)
    );
    return [...managedHistoricalCycles, ...seededCycles];
  }, [managedHistoricalCycles]);
  const selectedHistoricalCycle = useMemo(
    () =>
      historicalCycles.find(
        (historicalCycle) =>
          historicalCycle.key === selectedHistoricalCycleKey
      ) ?? historicalCycles[0],
    [historicalCycles, selectedHistoricalCycleKey]
  );
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
  const aggregatedData = useMemo<DataPoint[]>(() => {
    const base: DataPoint[] =
      selectedZone === "ALL"
        ? chartData
        : (zoneData[selectedZone as "A" | "B" | "C"] ?? []);

    return aggregateTrendRecords(base, appliedAggregation);
  }, [appliedAggregation, selectedZone, chartData, zoneData]);

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

  // untuk live cards (LOOPING)
  const [liveIndex, setLiveIndex] = useState(0);
  useEffect(() => {
    if (allData.length === 0) return;

    const interval = setInterval(() => {
      setLiveIndex((prev) =>
        prev < allData.length - 1
          ? prev + 1
          : Math.max(0, allData.length - LIVE_REPLAY_TAIL_POINTS)
      );
    }, REALTIME_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [allData]);
  const livePoint = allData[liveIndex];
  const liveZoneData = useMemo(() => {
    if (!livePoint) return null;

    return {
      A: getZonePoint(livePoint, liveIndex, allData.length, "A"),
      B: getZonePoint(livePoint, liveIndex, allData.length, "B"),
      C: getZonePoint(livePoint, liveIndex, allData.length, "C"),
    };
  }, [allData.length, liveIndex, livePoint]);

  const [liveData, setLiveData] = useState<DataPoint | null>(null);

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
        const initialIndex = Math.max(
          0,
          mapped.length - LIVE_REPLAY_TAIL_POINTS
        );
        setAllData(mapped);
        setLiveData(mapped[initialIndex] ?? null);
        setLiveIndex(Math.max(0, initialIndex));
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
    if (allData.length === 0) return;
    const current = allData[liveIndex];
    if (!current) return;

    setLiveData(current);
  }, [allData, liveIndex]);

  useEffect(() => {
    if (!livePoint || cycle.status !== "active") return;

    const conditions = getSensorAlertConditions(livePoint);
    const nextFlags = { ...alertFlagsRef.current };
    const newAlerts: AlertEvent[] = [];
    const resolvedMetrics: SensorMetric[] = [];

    conditions.forEach((condition) => {
      const isAbove = condition.value > condition.threshold;
      const wasAbove = alertFlagsRef.current[condition.metric];

      if (isAbove && !wasAbove) {
        newAlerts.push({
          id: `${cycle.id}-${condition.metric}-${livePoint.ts}`,
          cycleId: cycle.id,
          metric: condition.metric,
          label: condition.label,
          timestamp: livePoint.time,
          value: condition.value,
          threshold: condition.threshold,
          unit: condition.unit,
          severity:
            condition.value >= condition.criticalThreshold
              ? "critical"
              : "warning",
          status: "active",
          message: `${condition.label} crossed its configured limit. ${condition.action}`,
        });
      }

      if (!isAbove && wasAbove) resolvedMetrics.push(condition.metric);
      nextFlags[condition.metric] = isAbove;
    });

    alertFlagsRef.current = nextFlags;
    const existingAlertIds = new Set(alerts.map((alert) => alert.id));
    const uniqueNewAlerts = newAlerts.filter(
      (alert) => !existingAlertIds.has(alert.id)
    );

    if (uniqueNewAlerts.length || resolvedMetrics.length) {
      setAlerts((previous) => {
        const resolved = previous.map((alert) =>
          alert.cycleId === cycle.id &&
          resolvedMetrics.includes(alert.metric) &&
          alert.status !== "resolved"
            ? { ...alert, status: "resolved" as const }
            : alert
        );
        return dedupeAlertsById([...uniqueNewAlerts, ...resolved]).slice(0, 100);
      });
    }

    if (uniqueNewAlerts.length) {
      setLatestToast(uniqueNewAlerts[0]);
      if (soundEnabled) {
        void new Audio("/sound/alert.mp3").play().catch(() => undefined);
      }
    }
  }, [alerts, cycle.id, cycle.status, livePoint, setAlerts, soundEnabled]);

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
    if (selectedZone === "ALL") return liveData;
    return liveZoneData?.[selectedZone] ?? liveData;
  }, [selectedZone, liveData, liveZoneData]);

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

  const reportZone: Zone =
    selectedZone === "ALL" ? (ACTIVE_ZONES[0] ?? "A") : selectedZone;
  const fullReportData = useMemo(() => createZoneData(allData), [allData]);
  const reportDataset = useMemo(() => {
    const endDate = cycle.actualHarvestDate;
    return fullReportData[reportZone].filter((point) => {
      const pointDate = point.time.slice(0, 10);
      return (
        pointDate >= cycle.startDate && (!endDate || pointDate <= endDate)
      );
    });
  }, [cycle.actualHarvestDate, cycle.startDate, fullReportData, reportZone]);
  const currentProductionData = useMemo<HistoricalProductionData>(() => {
    const mortalityByDate = new Map<string, number>();
    cycleMortality
      .filter((entry) => entry.zone === reportZone)
      .forEach((entry) => {
        mortalityByDate.set(
          entry.date,
          (mortalityByDate.get(entry.date) ?? 0) + entry.count
        );
      });

    return {
      initialBirds: cycle.initialBirds,
      harvestedBirds:
        cycle.status === "completed" && cycle.harvestedBirds > 0
          ? cycle.harvestedBirds
          : undefined,
      mortality: Array.from(mortalityByDate.entries())
        .map(([date, count]) => ({
          day: dateToDayNumber(date, cycle.startDate),
          date,
          count,
        }))
        .sort((left, right) => left.day - right.day),
      feedWater: cycleConsumptions
        .filter((entry) => entry.zone === reportZone)
        .map((entry) => ({
          day: dateToDayNumber(entry.date, cycle.startDate),
          date: entry.date,
          feedKgPerBird: entry.feedKg,
          waterLPerBird: entry.waterL,
        }))
        .sort((left, right) => left.day - right.day),
      weights: cycleWeights
        .filter((entry) => entry.zone === reportZone)
        .map((entry) => ({
          day: entry.day,
          actualWeightKg: entry.actualWeightKg,
          standardWeightKg: entry.stdWeightKg,
        }))
        .sort((left, right) => left.day - right.day),
    };
  }, [
    cycle.harvestedBirds,
    cycle.initialBirds,
    cycle.startDate,
    cycle.status,
    cycleConsumptions,
    cycleMortality,
    cycleWeights,
    reportZone,
  ]);

  const harvestSummary = useMemo(
    () =>
      calculateHarvestSummary({
        cycle,
        mortality: cycleMortality,
        consumptions: cycleConsumptions,
        weights: cycleWeights,
        sensorData: reportDataset,
        alerts: cycleAlerts,
        zone: reportZone,
      }),
    [
      cycle,
      cycleAlerts,
      cycleConsumptions,
      cycleMortality,
      cycleWeights,
      reportDataset,
      reportZone,
    ]
  );

  const resetCurrentCycleAi = () => {
    setAiInsight("");
    setAiInsightSignature(null);
    setRequestedInsightSignature(null);
    setAiError(null);
  };

  const handleCycleChange = (changes: ProductionCycle) => {
    if (cycle.status !== "active") return;
    setCycle((current) =>
      updateProductionCycle(normalizeProductionCycle(current), changes)
    );
    resetCurrentCycleAi();
  };

  const handleStartCycle = (input: StartCycleInput) => {
    const cycleId = input.id.trim();
    if (!cycleId) return;
    if (historicalCycles.some((historicalCycle) => historicalCycle.id === cycleId)) {
      window.alert(
        `Cycle ID ${cycleId} already exists. Use a unique Cycle ID for the new flock.`
      );
      return;
    }

    const nextCycle = startProductionCycle({ ...input, id: cycleId });
    setCycle(nextCycle);
    setLatestToast(null);
    alertFlagsRef.current = {
      temp: false,
      humidity: false,
      co2: false,
      nh3: false,
      pm25: false,
    };
    resetCurrentCycleAi();
  };

  const handleCompleteCycle = (input: CompleteCycleInput) => {
    if (cycle.status !== "active") return;
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
      zone: reportZone,
    });

    setCycle(completedCycle);
    setManagedHistoricalCycles((previous) => [
      snapshot,
      ...previous.filter((historicalCycle) => historicalCycle.id !== cycle.id),
    ]);
    setSelectedHistoricalCycleKey(snapshot.key);
    resetCurrentCycleAi();
  };

  const handleReopenCycle = (reason: string) => {
    if (cycle.status !== "completed" || !reason.trim()) return;
    setCycle((current) =>
      reopenProductionCycle(normalizeProductionCycle(current), reason)
    );
    setManagedHistoricalCycles((previous) =>
      previous.filter((historicalCycle) => historicalCycle.id !== cycle.id)
    );
    setSelectedHistoricalCycleKey("latest");
    resetCurrentCycleAi();
  };

  const deterministicSummary = useMemo(
    () => buildDeterministicCycleSummary(cycle, harvestSummary, reportDataset),
    [cycle, harvestSummary, reportDataset]
  );

  const currentInsightSignature = useMemo(
    () =>
      JSON.stringify({
        type: selectedInsight,
        cycleId: cycle.id,
        zone: reportZone,
        latestReading: reportDataset.at(-1)?.time ?? "-",
        mortality: harvestSummary.totalMortality,
        finalWeight: harvestSummary.finalAverageWeightKg,
        feed: harvestSummary.totalFeedPerBirdKg,
        water: harvestSummary.totalWaterPerBirdL,
        alerts: harvestSummary.alertCount,
      }),
    [cycle.id, harvestSummary, reportDataset, reportZone, selectedInsight]
  );
  const hasCurrentAiInsight =
    aiInsightSignature === currentInsightSignature && Boolean(aiInsight);
  const hasRequestedCurrentInsight =
    requestedInsightSignature === currentInsightSignature;
  const showInsightContent =
    hasCurrentAiInsight || (hasRequestedCurrentInsight && Boolean(aiError));
  const currentAiInsight = hasCurrentAiInsight ? aiInsight : "";

  const reportSummary = useMemo(() => summarizeData(reportDataset), [reportDataset]);

  const reportActions = useMemo(() => {
    return buildReportActions(reportSummary);
  }, [reportSummary]);

  const insightBlocks = useMemo(
    () => parseInsightMarkdown(currentAiInsight || deterministicSummary),
    [currentAiInsight, deterministicSummary]
  );

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
      const reportNarrative = escapeHtml(
        currentAiInsight || deterministicSummary
      ).replaceAll("\n", "<br/>");
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
    <div className="mx-auto flex max-w-7xl flex-col gap-8 p-6">
      {/* Header */}
      <header className="flex flex-col items-center gap-4 mb-2">
        <div className="flex gap-4">
          <Image
            src="/img/umpsa.png"
            alt="Logo UMPSA"
            width={6000}
            height={1115}
            priority
            className="h-30 w-auto object-contain"
          />
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-bold">
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
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {cycle.status === "completed" ? "Completed" : "Active"} · Cycle
              Day {harvestSummary.cycleDay} / {cycle.targetHarvestDay}
            </span>
            <span className="text-xs text-gray-500">
              Current record: {latestSafe.time}
            </span>
          </div>

          <NotificationCenter
            alerts={cycleAlerts}
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
          {cycle.status === "completed"
            ? "Completed Cycle Review"
            : "Active Production Cycle"}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {cycle.status === "completed"
            ? "This cycle is locked. Its production and sensor snapshot is available in Historical Data, while lifecycle actions remain available below."
            : "Realtime CCTV, sensor readings, production records, cycle progress, prediction, system health, and on-demand AI summary for the cycle in progress."}
        </p>
      </section>

      {/* CCTV Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">CCTV Monitoring</h2>

        {/* Show single zone CCTV when zone is selected */}
        {selectedZone !== "ALL" && (
          <div className="rounded-2xl overflow-hidden shadow-lg relative">
            <div className="relative">
              <CameraFeed
                zone={selectedZone}
                // dummySrc="/video/cctv ayam 1_tracked-stay.mp4"
                dummySrc="/video/raw_video_dataset.mp4"
                className="w-full object-cover"
              />
              <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded-lg text-sm font-medium">
                {cycle.houseName}
              </div>
            </div>
          </div>
        )}

        {/* Show all zones CCTV when ALL is selected */}
        {selectedZone === "ALL" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ACTIVE_ZONES.map((zone) => (
              <div
                key={zone}
                className="rounded-2xl overflow-hidden shadow-lg relative"
              >
                <div className="relative">
                  <CameraFeed
                    zone={zone}
                    // dummySrc="/video/cctv ayam 1_tracked-stay.mp4"
                    dummySrc="/video/raw_video_dataset.mp4"
                    className="w-full object-cover"
                  />
                  <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded-lg text-sm font-medium">
                    Zone {zone}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Live Readings */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">
          Realtime Readings – {cycle.houseName}
        </h2>

        {/* ================= ALL ZONES ================= */}
        {selectedZone === "ALL" && liveByZone && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            {liveByZone.map((item) => {
              const hasAlert = item.values.some((v) => v.value > item.limit);

              return (
                <div
                  key={item.label}
                  className={`p-4 rounded-2xl border shadow-sm ${
                    hasAlert
                      ? "bg-amber-50 border-amber-200"
                      : "bg-green-50 border-green-200"
                  }`}
                >
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <p className="text-sm text-gray-600 mb-2">{item.label}</p>

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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              {buildCards(latestSafe, selectedZone).map((item, idx) => (
                <CardItem key={idx} item={item} />
              ))}
            </div>
          </>
        )}
      </section>

      <CurrentCycleSensorTrends
        cycle={cycle}
        data={reportDataset}
        zone={reportZone}
      />

      {selectedZone !== "ALL" ? (
        <ProductionCyclePanel
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
          Select a zone to review its production cycle KPI, AI summary, and cycle report.
        </section>
      )}

      {selectedZone !== "ALL" && (
        <CurrentCyclePrediction
          cycle={cycle}
          summary={harvestSummary}
          sensorData={reportDataset}
          zone={reportZone}
        />
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
                Review environmental trends, production outcomes, and lessons
                from completed flocks only when they are needed.
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <span className="text-xs font-medium text-violet-700">
                {historicalCycles.length} completed cycle
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
            </div>
          </div>
        </div>
      </section>

      {isHistoricalDataOpen && (
        <>
          <section id="historical-data-content" className="order-2">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-2xl font-semibold">Historical Cycle Trends</h2>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            Historical data · static
          </span>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          These charts use complete stored production cycles. Realtime sensor
          replay only updates the readings and alerts above.
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
              <option value="all">Raw readings (6-hour)</option>
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

                {selectedZone === "ALL" ? (
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

                {selectedZone === "ALL" ? (
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

                {selectedZone === "ALL" ? (
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

                {selectedZone === "ALL" ? (
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

                {selectedZone === "ALL" ? (
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
              {(selectedZone === "ALL"
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
              {(selectedZone === "ALL"
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
              {(selectedZone === "ALL"
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

      {isHistoricalDataOpen && selectedHistoricalCycle && (
        <HistoricalProductionOverview cycle={selectedHistoricalCycle} />
      )}

      {isHistoricalDataOpen && selectedHistoricalCycle && (
        <section className="order-2">
          <HistoricalCycleAiAnalysis cycle={selectedHistoricalCycle} />
        </section>
      )}

      {/* ============ Production Monitoring ============ */}
      <section>
        {cycle.status === "completed" && (
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
          description={`Mortality, feed, water, and body-weight records for ${cycle.id} · Zone ${reportZone}.`}
          periodLabel={`${cycle.startDate} – ${
            cycle.actualHarvestDate ??
            reportDataset.at(-1)?.time.slice(0, 10) ??
            "Current"
          }`}
          production={currentProductionData}
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

      {/* System Health */}
      <section>
        <h2 className="text-2xl font-semibold mb-2">System Health & Uptime</h2>
        <div className="p-4 bg-gray-50 rounded-xl shadow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            📡 Status: {sensorError ? "Error" : allData.length ? "Online" : "Starting…"}
          </div>
          <div>🕒 Latest Reading: {latestSafe.time}</div>
          <div>
            📅 Data Window:{" "}
            {sensorMeta
              ? `${sensorMeta.runtimeStart} to ${sensorMeta.runtimeEnd}`
              : "-"}
          </div>
          <div>📦 Records: {sensorMeta?.records ?? allData.length}</div>
          <div>
            🧪 Data Source: Sensor Replay
          </div>
          <div>
            ✅ Completeness: {harvestSummary.sensorHealth.completeness.toFixed(1)}%
          </div>
          {sensorError && (
            <div className="sm:col-span-2 lg:col-span-5 text-red-600 text-sm">
              {sensorError}
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-10">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-2xl font-semibold">Current Cycle AI & Environmental Summary</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                House: {cycle.houseName}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                Cycle: {cycle.id}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                Records: {reportDataset.length}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(260px,1fr)_180px] gap-3 w-full lg:w-[600px]">
            <select
              aria-label="Select AI cycle analysis type"
              value={selectedInsight}
              onChange={(e) => setSelectedInsight(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              {INSIGHT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={generateInsight}
              disabled={isGeneratingInsight}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              {isGeneratingInsight
                ? "Generating..."
                : hasCurrentAiInsight
                  ? "Regenerate AI Summary"
                  : "Generate AI Summary"}
            </button>
            <span className="text-right text-xs text-gray-500 sm:col-span-2">
              {hasCurrentAiInsight
                ? "AI-assisted summary for the selected analysis type"
                : hasRequestedCurrentInsight && aiError
                  ? "Verified rule-based summary"
                  : "AI runs only after user clicks Generate AI Summary"}
            </span>
          </div>
        </div>

        {aiError && hasRequestedCurrentInsight && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {aiError}
          </div>
        )}

        {isGeneratingInsight && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
            Preparing cycle analysis from production, alert, and sensor records...
          </div>
        )}

        {!isGeneratingInsight && showInsightContent && (
          <div className="rounded-lg border border-gray-200 bg-slate-50 p-5">
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
              <aside className="space-y-3">
                <div className="rounded-lg bg-white border border-gray-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Insight Type
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {hasCurrentAiInsight
                      ? INSIGHT_OPTIONS.find((opt) => opt.value === selectedInsight)
                          ?.label
                      : "Verified Rule-Based Cycle Summary"}
                  </p>
                </div>
                <div className="rounded-lg bg-white border border-gray-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Latest Focus
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {reportActions[0]}
                  </p>
                </div>
              </aside>

              <div className="space-y-4">
                {insightBlocks.map((block, index) => {
                  if (block.type === "heading") {
                    return (
                      <h3
                        key={`${block.type}-${index}`}
                        className="text-base font-semibold text-gray-950 border-b border-gray-200 pb-2"
                      >
                        {block.text}
                      </h3>
                    );
                  }

                  if (block.type === "list") {
                    return (
                      <ul
                        key={`${block.type}-${index}`}
                        className="space-y-2 text-sm text-gray-700"
                      >
                        {block.items.map((item, itemIndex) => (
                          <li
                            key={`${item}-${itemIndex}`}
                            className="flex gap-2 rounded-md bg-white border border-gray-100 px-3 py-2"
                          >
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  }

                  return (
                    <p
                      key={`${block.type}-${index}`}
                      className="text-sm leading-6 text-gray-700"
                    >
                      {block.text}
                    </p>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!isGeneratingInsight && !showInsightContent && (
          <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-5 py-8 text-center">
            <h3 className="font-semibold text-gray-900">
              AI cycle summary has not been generated
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              Select the analysis type, then click Generate AI Summary. No AI
              request is sent when the page loads or when the selection changes.
            </p>
          </div>
        )}
      </section>

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
