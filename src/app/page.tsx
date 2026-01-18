/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { standardBroilerWeight } from "./lib/broilerStandard";
import { useEffect, useMemo, useState } from "react";
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
  BarChart,
  Bar,
} from "recharts";

// ========= Types =========
type DataPoint = {
  time: string;
  dayLabel: string;
  ts: number;
  temp: number;
  humidity: number;
  co2: number;
  nh3: number;
  pm25: number;
};

type WeightEntry = {
  day: number;
  stdWeightKg: number;
  actualWeightKg: number;
};

type MortalityEntry = {
  zone: "A" | "B" | "C";
  date: string;
  count: number;
  notes?: string;
};

type ConsumptionEntry = {
  zone: "A" | "B" | "C";
  date: string;
  feedKg: number;
  waterL: number;
};
type LiveCard = {
  label: string;
  value: number;
  unit: string;
  limit: number;
  icon: string;
  color: "red" | "orange" | "yellow" | "green";
};
// ===== Raw JSON type =====
type RawSensorItem = {
  Timestamp: string;
  "Temperature (°C)": string | number;
  "Humidity (%)": string | number;
  "CO2 (ppm)"?: string | number;
  "CO₂ (ppm)"?: string | number;
  "Ammonia (ppm)": string | number;
  "PM2.5 (µg/m³)": string | number;
};

type MortalitySummaryRow = {
  date: string;
  A: number;
  B: number;
  C: number;
};
// ========= Helpers =========

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);
// ===== Helper: Build cards per zone =====
function summarizeData(data: DataPoint[]) {
  if (data.length === 0) return null;

  const avg = (key: keyof DataPoint) =>
    data.reduce((a, b) => a + (b[key] as number), 0) / data.length;

  const max = (key: keyof DataPoint) =>
    Math.max(...data.map((d) => d[key] as number));

  const min = (key: keyof DataPoint) =>
    Math.min(...data.map((d) => d[key] as number));

  return {
    temp: { avg: avg("temp"), min: min("temp"), max: max("temp") },
    humidity: {
      avg: avg("humidity"),
      min: min("humidity"),
      max: max("humidity"),
    },
    co2: { avg: avg("co2"), max: max("co2") },
    nh3: { avg: avg("nh3"), max: max("nh3") },
    pm25: { avg: avg("pm25"), max: max("pm25") },
  };
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
      color: "green",
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

// Dummy standar kurva (silakan ganti sesuai standarmu)
function standardFeedKg(day: number): number {
  const base = 0.05;
  const inc = 0.015;
  return +(base + inc * Math.pow(day, 1.15)).toFixed(3);
}
function standardWaterL(day: number): number {
  return +(standardFeedKg(day) * 2.2).toFixed(3);
}
const PARAM_CONFIG = {
  all: {
    label: "All Parameters",
    unit: "",
  },
  temp: {
    label: "Temperature",
    unit: "°C",
    color: "#f87171",
  },
  humidity: {
    label: "Humidity",
    unit: "%",
    color: "#34d399",
  },
  co2: {
    label: "CO₂",
    unit: "ppm",
    color: "#60a5fa",
  },
  nh3: {
    label: "NH₃",
    unit: "ppm",
    color: "#fbbf24",
  },
  pm25: {
    label: "PM2.5",
    unit: "µg/m³",
    color: "#a855f7",
  },
} as const;

const zoneLegendConfig = {
  A: { label: "Zone A", dot: "bg-red-500", text: "text-red-500" },
  B: { label: "Zone B", dot: "bg-blue-500", text: "text-blue-500" },
  C: { label: "Zone C", dot: "bg-green-500", text: "text-green-500" },
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
  const [data, setData] = useState<DataPoint[]>([]);
  //const [index, setIndex] = useState(0);
  //const [lastUpdate, setLastUpdate] = useState<string>("");
  const [weights, setWeights] = useState<WeightEntry[]>(() => {
    // Generate dummy weight data for days 1-30
    const dummyWeights: WeightEntry[] = [];
    for (let day = 1; day <= 30; day++) {
      const stdWeight = standardBroilerWeight(day);
      // Add realistic variation: ±3% from standard
      const variance = (Math.random() - 0.5) * 0.06;
      const actualWeight = +(stdWeight * (1 + variance)).toFixed(3);
      
      dummyWeights.push({
        day,
        stdWeightKg: stdWeight,
        actualWeightKg: actualWeight,
      });
    }
    return dummyWeights;
  });
  const [weightDay, setWeightDay] = useState<number>(31);
  const [actualWeight, setActualWeight] = useState<number>(0);
  // ====== Health & Behavior (prototype) ======
  // Mortality
  const [mortality, setMortality] = useState<MortalityEntry[]>([
    // ===== Date: 2026-01-01 =====
    { zone: "A", date: "2025-07-01", count: 2, notes: "Heat stress" },
    { zone: "B", date: "2025-07-01", count: 1 },
    { zone: "C", date: "2025-07-01", count: 0 },

    // ===== Date: 2026-01-02 =====
    { zone: "A", date: "2025-07-08", count: 0 },
    { zone: "B", date: "2025-07-08", count: 3, notes: "Ventilation issue" },
    { zone: "C", date: "2025-07-08", count: 1 },

    // ===== Date: 2026-01-03 =====
    { zone: "A", date: "2025-07-15", count: 1 },
    { zone: "B", date: "2025-07-15", count: 1 },
    { zone: "C", date: "2025-07-15", count: 0 },
    
    // ===== Date: 2026-01-04 =====
    { zone: "A", date: "2025-07-22", count: 0 },
    { zone: "B", date: "2025-07-22", count: 2 },
    { zone: "C", date: "2025-07-22", count: 1, notes: "High NH3 levels" },
    
    // ===== Date: 2026-01-05 =====
    { zone: "A", date: "2025-07-29", count: 1 },
    { zone: "B", date: "2025-07-29", count: 0 },
    { zone: "C", date: "2025-07-29", count: 2, notes: "Feed contamination" },
    
    // ===== Date: 2026-01-06 =====
    { zone: "A", date: "2025-08-05", count: 0 },
    { zone: "B", date: "2025-08-05", count: 1 },
    { zone: "C", date: "2025-08-05", count: 0 },
    
    // ===== Date: 2026-01-07 =====
    { zone: "A", date: "2025-08-12", count: 2, notes: "Heat wave" },
    { zone: "B", date: "2025-08-12", count: 2 },
    { zone: "C", date: "2025-08-12", count: 1 },
  ]);

  const [mortDate, setMortDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [mortCount, setMortCount] = useState<number>(0);
  const [mortNotes, setMortNotes] = useState<string>("");

  // ===== AI Insight =====
  const [selectedInsight, setSelectedInsight] = useState<string>("overall");
  const [aiInsight, setAiInsight] = useState<string>("");
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
      value: "zone",
      label: "Zone Performance Comparison",
      prompt: `
Analyze and compare environmental conditions between zones.

Output format:
1. Best Performing Zone
2. Underperforming Zone
3. Key Differences
4. Actionable Recommendations
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
    const summary = summarizeData(aggregatedData);
    if (!summary) return "";

    return `
DATA CONTEXT:
- Zone: ${selectedZone}
- Aggregation: ${appliedAggregation}
- Data Points: ${aggregatedData.length}

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
`;
  };
  const generateInsight = async () => {
    setIsGeneratingInsight(true);
    setAiInsight("");
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
      setAiInsight(json.insight);
    } catch (err) {
      setAiError("Failed to generate AI insight");
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  // Consumption
  const [consumptions, setConsumptions] = useState<ConsumptionEntry[]>([
    { zone: "A", date: "2025-07-01", feedKg: 0.06, waterL: 0.13 },
    { zone: "B", date: "2025-07-01", feedKg: 0.061, waterL: 0.131 },
    { zone: "C", date: "2025-07-01", feedKg: 0.059, waterL: 0.129 },

    { zone: "A", date: "2025-07-02", feedKg: 0.07, waterL: 0.15 },
    { zone: "B", date: "2025-07-02", feedKg: 0.071, waterL: 0.152 },
    { zone: "C", date: "2025-07-02", feedKg: 0.069, waterL: 0.148 },

    { zone: "A", date: "2025-07-03", feedKg: 0.08, waterL: 0.18 },
    { zone: "B", date: "2025-07-03", feedKg: 0.081, waterL: 0.182 },
    { zone: "C", date: "2025-07-03", feedKg: 0.079, waterL: 0.178 },

    { zone: "A", date: "2025-07-04", feedKg: 0.1, waterL: 0.21 },
    { zone: "B", date: "2025-07-04", feedKg: 0.102, waterL: 0.212 },
    { zone: "C", date: "2025-07-04", feedKg: 0.098, waterL: 0.208 },

    { zone: "A", date: "2025-07-05", feedKg: 0.12, waterL: 0.25 },
    { zone: "B", date: "2025-07-05", feedKg: 0.121, waterL: 0.252 },
    { zone: "C", date: "2025-07-05", feedKg: 0.119, waterL: 0.248 },
  ]);
  const [consumpDate, setConsumpDate] = useState<string>("2025-07-06");
  const [feedInput, setFeedInput] = useState<number>(0.1);
  const [waterInput, setWaterInput] = useState<number>(0.22);

  const addWeightEntry = () => {
    if (weightDay <= 0 || actualWeight <= 0) return;

    const stdWeight = standardBroilerWeight(weightDay);

    setWeights((prev) => {
      const exists = prev.some((w) => w.day === weightDay);

      const next = exists
        ? prev.map((w) =>
            w.day === weightDay ? { ...w, actualWeightKg: actualWeight } : w
          )
        : [
            ...prev,
            {
              day: weightDay,
              stdWeightKg: stdWeight,
              actualWeightKg: actualWeight,
            },
          ];

      return next.sort((a, b) => a.day - b.day);
    });

    setWeightDay((d) => d + 1);
    setActualWeight(0);
  };

  // ===== Visualization Controls =====
  // ===== Visualization Controls =====
  const [selectedParam, setSelectedParam] = useState<
    "all" | "temp" | "humidity" | "co2" | "nh3" | "pm25"
  >("all");
  const [selectedZone, setSelectedZone] = useState<"ALL" | "A" | "B" | "C">(
    "ALL"
  );
  const isAllZone = selectedZone === "ALL";

  const [aggregation, setAggregation] = useState<
    "all" | "daily" | "weekly" | "monthly"
  >("all");
  // ================= APPLY FILTER STATE =================
  const [appliedParam, setAppliedParam] = useState(selectedParam);
  const [appliedAggregation, setAppliedAggregation] = useState(aggregation);
  const [isApplying, setIsApplying] = useState(false);

  // Vision activity (dummy score)
  const activityScore = useMemo(() => {
    const latest = data[data.length - 1];
    if (!latest) return 50;
    const tempPenalty = clamp(Math.abs(latest.temp - 28) * 3, 0, 40);
    const humiPenalty = clamp(Math.abs(latest.humidity - 65) * 0.8, 0, 25);
    //const noise = Math.random() * 10;
    const noise = 0;
    return clamp(90 - tempPenalty - humiPenalty + noise, 5, 95);
  }, [data]);

  const abnormalReason = useMemo(() => {
    const latest = data[data.length - 1];
    if (!latest) return "Insufficient data";
    const reasons: string[] = [];
    if (latest.temp > 32) reasons.push("High temperature");
    if (latest.co2 > 1200) reasons.push("High CO₂");
    if (latest.nh3 > 5) reasons.push("High NH₃");
    if (latest.pm25 > 35) reasons.push("High PM2.5");
    if (activityScore < 35) reasons.push("Low movement");
    return reasons.length ? reasons.join(", ") : "Normal";
  }, [activityScore, data]);
  const ZONE_COLORS = {
    A: "#ef4444",
    B: "#3b82f6",
    C: "#10b981",
  } as const;
  // untuk chart (STATIC)
  const [chartData, setChartData] = useState<DataPoint[]>([]);

  const zoneData = useMemo(() => {
    if (chartData.length === 0) {
      return { A: [], B: [], C: [] };
    }

    return {
      // Zone A = data asli
      A: chartData,

      // Zone B = sedikit lebih panas & lembap
      B: chartData.map((d) => ({
        ...d,
        temp: +(d.temp + 0.8).toFixed(2),
        humidity: +(d.humidity + 2).toFixed(2),
        co2: Math.max(0, Math.round(d.co2 + 50)),
        nh3: +(d.nh3 + 0.2).toFixed(2),
        pm25: +(d.pm25 + 1.5).toFixed(2),
      })),

      // Zone C = sedikit lebih sejuk & kering
      C: chartData.map((d) => ({
        ...d,
        temp: +(d.temp - 0.6).toFixed(2),
        humidity: +(d.humidity - 3).toFixed(2),
        co2: Math.max(0, Math.round(d.co2 - 40)),
        nh3: Math.max(0, +(d.nh3 - 0.15).toFixed(2)),
        pm25: Math.max(0, +(d.pm25 - 1).toFixed(2)),
      })),
    };
  }, [chartData]);
  const mortalitySummaryByDate = useMemo<MortalitySummaryRow[]>(() => {
    if (selectedZone !== "ALL") return [];

    const map = new Map<string, MortalitySummaryRow>();

    mortality.forEach((m) => {
      if (!map.has(m.date)) {
        map.set(m.date, {
          date: m.date,
          A: 0,
          B: 0,
          C: 0,
        });
      }
      map.get(m.date)![m.zone] += m.count;
    });

    return Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [mortality, selectedZone]);
  // =====================================================
  // ✅ TARUH aggregatedData DI SINI (WAJIB DI SINI)
  // =====================================================
  const aggregatedData = useMemo<DataPoint[]>(() => {
    const base: DataPoint[] =
      selectedZone === "ALL"
        ? chartData
        : (zoneData[selectedZone as "A" | "B" | "C"] ?? []);

    if (appliedAggregation === "all") return base;
    if (appliedAggregation === "daily")
      return base.filter((_, i) => i % 24 === 0);
    if (appliedAggregation === "weekly")
      return base.filter((_, i) => i % (24 * 7) === 0);
    if (appliedAggregation === "monthly")
      return base.filter((_, i) => i % (24 * 30) === 0);

    return base;
  }, [appliedAggregation, selectedZone, chartData, zoneData]);

  // =====================================================
  // ✅ showParam JUGA HARUS DI SINI
  // =====================================================
  const showParam = (
    param: "temp" | "humidity" | "co2" | "nh3" | "pm25"
  ): boolean => {
    return appliedParam === "all" || appliedParam === param;
  };

  const latestA = zoneData.A.at(-1);
  const latestB = zoneData.B.at(-1);
  const latestC = zoneData.C.at(-1);
  const correlationSeries = useMemo(() => {
    const applyAgg = (data: DataPoint[]) => {
      if (appliedAggregation === "all") return data;
      if (appliedAggregation === "daily")
        return data.filter((_, i) => i % 24 === 0);
      if (appliedAggregation === "weekly")
        return data.filter((_, i) => i % (24 * 7) === 0);
      if (appliedAggregation === "monthly")
        return data.filter((_, i) => i % (24 * 30) === 0);
      return data;
    };

    if (selectedZone === "ALL") {
      return [
        { zone: "A", color: ZONE_COLORS.A, data: applyAgg(zoneData.A) },
        { zone: "B", color: ZONE_COLORS.B, data: applyAgg(zoneData.B) },
        { zone: "C", color: ZONE_COLORS.C, data: applyAgg(zoneData.C) },
      ];
    }

    return [
      {
        zone: selectedZone,
        color: ZONE_COLORS[selectedZone],
        data: aggregatedData,
      },
    ];
  }, [selectedZone, appliedAggregation, aggregatedData, zoneData]);

  const trendSeries = useMemo(() => {
    if (selectedZone === "ALL") {
      return [
        { zone: "A", color: "#ef4444", data: zoneData.A },
        { zone: "B", color: "#3b82f6", data: zoneData.B },
        { zone: "C", color: "#10b981", data: zoneData.C },
      ];
    }

    const colorMap = {
      A: "#ef4444",
      B: "#3b82f6",
      C: "#10b981",
    };

    return [
      {
        zone: selectedZone,
        color: colorMap[selectedZone],
        data: zoneData[selectedZone],
      },
    ];
  }, [selectedZone, zoneData]);

  // untuk live cards (LOOPING)
  const [liveIndex, setLiveIndex] = useState(0);
  useEffect(() => {
    if (allData.length === 0) return;

    const interval = setInterval(() => {
      setLiveIndex((prev) => (prev < allData.length - 1 ? prev + 1 : 0));
    }, 10000); // ganti tiap 10 detik

    return () => clearInterval(interval);
  }, [allData]);
  const livePoint = allData[liveIndex];
  const liveZoneData = useMemo(() => {
    if (!livePoint) return null;

    return {
      A: livePoint,
      B: {
        ...livePoint,
        temp: +(livePoint.temp + 0.8).toFixed(2),
        humidity: +(livePoint.humidity + 2).toFixed(2),
        co2: livePoint.co2 + 50,
        nh3: +(livePoint.nh3 + 0.2).toFixed(2),
        pm25: +(livePoint.pm25 + 1.5).toFixed(2),
      },
      C: {
        ...livePoint,
        temp: +(livePoint.temp - 0.6).toFixed(2),
        humidity: +(livePoint.humidity - 3).toFixed(2),
        co2: Math.max(0, livePoint.co2 - 40),
        nh3: Math.max(0, +(livePoint.nh3 - 0.15).toFixed(2)),
        pm25: Math.max(0, +(livePoint.pm25 - 1).toFixed(2)),
      },
    };
  }, [livePoint]);

  const [liveData, setLiveData] = useState<DataPoint | null>(null);
  const weeklyData = chartData.filter((_, i) => i % 7 === 0);
  // ===== Aggregation logic =====
  const singleZoneData = useMemo(() => {
    if (selectedZone === "ALL") return [];

    return zoneData[selectedZone];
  }, [selectedZone, zoneData]);
  const dailySingleZoneData = useMemo(() => {
    return singleZoneData.filter((_, i) => i % 24 === 0);
  }, [singleZoneData]);

  const aggregatedZoneData = useMemo(() => {
    const base = selectedZone === "ALL" ? chartData : zoneData[selectedZone];

    // tampil 1 titik per HARI
    return base.filter((_, i) => i % 24 === 0);
  }, [selectedZone, chartData, zoneData]);

  // ====== Fetch JSON & map ======

  // ====== Fetch JSON & map (OPTIMIZED & TYPED) ======
  useEffect(() => {
    let isMounted = true;

    fetch("/data/broiler_data.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch broiler data");
        return res.json();
      })
      .then((json: RawSensorItem[]) => {
        const mapped: DataPoint[] = json.map((item) => {
          const date = new Date(item.Timestamp);

          return {
            time: item.Timestamp,

            // label siap pakai untuk chart (NO new Date() di render)
            dayLabel: `${date.getDate()}/${date.getMonth() + 1}`,

            // numeric timestamp (untuk sorting / future zoom)
            ts: date.getTime(),

            temp: Number(item["Temperature (°C)"]),
            humidity: Number(item["Humidity (%)"]),

            // support CO2 & CO₂
            co2: Number(item["CO₂ (ppm)"] ?? item["CO2 (ppm)"] ?? 0),

            nh3: Number(item["Ammonia (ppm)"]),
            pm25: Number(item["PM2.5 (µg/m³)"]),
          };
        });

        if (!isMounted) return;

        setAllData(mapped);
        setChartData(mapped);
        setLiveData(mapped[0] ?? null);
      })
      .catch((err) => {
        console.error("Error loading broiler data:", err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedZone === "ALL") {
      setData(allData);
    } else {
      setData(zoneData[selectedZone]);
    }
  }, [selectedZone, allData, zoneData]);

  // ====== Loop realtime (6 titik) ======
  useEffect(() => {
    if (allData.length === 0) return;
    setData(allData); // tampilkan SEMUA data sekaligus
  }, [allData]);

  // ==== SAFE derivations tanpa early-return ====
  const isLoading = data.length === 0;
  const liveByZone = useMemo(() => {
    if (!liveZoneData) return null;

    return [
      {
        label: "Temperature",
        unit: "°C",
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

    const zData = zoneData[selectedZone];
    return zData && zData.length > 0 ? zData[zData.length - 1] : liveData;
  }, [selectedZone, liveData, zoneData]);

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

      tempA: d.temp,
      tempB: zoneData.B[i]?.temp,
      tempC: zoneData.C[i]?.temp,

      humidityA: d.humidity,
      humidityB: zoneData.B[i]?.humidity,
      humidityC: zoneData.C[i]?.humidity,

      co2A: d.co2,
      co2B: zoneData.B[i]?.co2,
      co2C: zoneData.C[i]?.co2,

      nh3A: d.nh3,
      nh3B: zoneData.B[i]?.nh3,
      nh3C: zoneData.C[i]?.nh3,

      pm25A: d.pm25,
      pm25B: zoneData.B[i]?.pm25,
      pm25C: zoneData.C[i]?.pm25,
    }));
  }, [chartData, zoneData]);

  // ====== Cards ======
  const cards = [
    {
      label: "Temperature",
      value: latestSafe.temp,
      unit: "°C",
      limit: 32,
      icon: "🌡️",
      color: latestSafe.temp > 32 ? "red" : "green",
    },
    {
      label: "Humidity",
      value: latestSafe.humidity,
      unit: "%",
      limit: 85,
      icon: "💧",
      color: "green",
    },
    {
      label: "CO₂",
      value: latestSafe.co2,
      unit: "ppm",
      limit: 1200,
      icon: "🌫️",
      color: latestSafe.co2 > 1200 ? "red" : "green",
    },
    {
      label: "NH₃",
      value: latestSafe.nh3,
      unit: "ppm",
      limit: 5,
      icon: "⚗️",
      color: latestSafe.nh3 > 5 ? "orange" : "green",
    },
    {
      label: "PM2.5",
      value: latestSafe.pm25,
      unit: "µg/m³",
      limit: 35,
      icon: "🫁",
      color: latestSafe.pm25 > 35 ? "yellow" : "green",
    },
  ];

  // ====== Chart data for consumption vs standard ======
  const aggregatedAllZoneData = useMemo(() => {
    const applyAgg = (data: any[]) => {
      if (appliedAggregation === "all") return data;
      if (appliedAggregation === "daily")
        return data.filter((_, i) => i % 24 === 0);
      if (appliedAggregation === "weekly")
        return data.filter((_, i) => i % (24 * 7) === 0);
      if (appliedAggregation === "monthly")
        return data.filter((_, i) => i % (24 * 30) === 0);
      return data;
    };

    return applyAgg(allZoneCombinedData);
  }, [allZoneCombinedData, appliedAggregation]);

  const visibleConsumptions = useMemo(() => {
    if (selectedZone === "ALL") return consumptions;
    return consumptions.filter((c) => c.zone === selectedZone);
  }, [consumptions, selectedZone]);

  const consumptionChartData = useMemo(() => {
    if (isAllZone) {
      // ALL ZONE: show all zones
      const map = new Map<string, { date: string; A: number; B: number; C: number; stdA: number; stdB: number; stdC: number }>();
      
      consumptions.forEach((c) => {
        if (!map.has(c.date)) {
          const dayNum = Math.ceil((new Date(c.date).getTime() - new Date("2025-07-01").getTime()) / (1000 * 60 * 60 * 24)) + 1;
          map.set(c.date, {
            date: c.date,
            A: 0,
            B: 0,
            C: 0,
            stdA: standardFeedKg(dayNum),
            stdB: standardFeedKg(dayNum),
            stdC: standardFeedKg(dayNum),
          });
        }
        const row = map.get(c.date)!;
        if (c.zone === "A") row.A = c.feedKg;
        if (c.zone === "B") row.B = c.feedKg;
        if (c.zone === "C") row.C = c.feedKg;
      });

      return Array.from(map.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } else {
      // SINGLE ZONE: show only selected zone
      const dayNum = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - new Date("2025-07-01").getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      return visibleConsumptions
        .map((c) => ({
          date: c.date,
          feedKg: c.feedKg,
          stdFeedKg: standardFeedKg(dayNum(c.date)),
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
  }, [consumptions, visibleConsumptions, isAllZone]);

  const consumptionWaterChartData = useMemo(() => {
    if (isAllZone) {
      // ALL ZONE: show all zones
      const map = new Map<string, { date: string; A: number; B: number; C: number; stdA: number; stdB: number; stdC: number }>();
      
      consumptions.forEach((c) => {
        if (!map.has(c.date)) {
          const dayNum = Math.ceil((new Date(c.date).getTime() - new Date("2025-07-01").getTime()) / (1000 * 60 * 60 * 24)) + 1;
          map.set(c.date, {
            date: c.date,
            A: 0,
            B: 0,
            C: 0,
            stdA: standardWaterL(dayNum),
            stdB: standardWaterL(dayNum),
            stdC: standardWaterL(dayNum),
          });
        }
        const row = map.get(c.date)!;
        if (c.zone === "A") row.A = c.waterL;
        if (c.zone === "B") row.B = c.waterL;
        if (c.zone === "C") row.C = c.waterL;
      });

      return Array.from(map.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } else {
      // SINGLE ZONE: show only selected zone
      const dayNum = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - new Date("2025-07-01").getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      return visibleConsumptions
        .map((c) => ({
          date: c.date,
          waterL: c.waterL,
          stdWaterL: standardWaterL(dayNum(c.date)),
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
  }, [consumptions, visibleConsumptions, isAllZone]);

  function summarizeData(data: DataPoint[]) {
    if (data.length === 0) return null;

    const avg = (key: keyof DataPoint) =>
      data.reduce((a, b) => a + (b[key] as number), 0) / data.length;

    const max = (key: keyof DataPoint) =>
      Math.max(...data.map((d) => d[key] as number));

    const min = (key: keyof DataPoint) =>
      Math.min(...data.map((d) => d[key] as number));

    return {
      temp: { avg: avg("temp"), min: min("temp"), max: max("temp") },
      humidity: {
        avg: avg("humidity"),
        min: min("humidity"),
        max: max("humidity"),
      },
      co2: { avg: avg("co2"), max: max("co2") },
      nh3: { avg: avg("nh3"), max: max("nh3") },
      pm25: { avg: avg("pm25"), max: max("pm25") },
    };
  }

  // ====== Handlers ======
  const addMortality = () => {
    if (isAllZone) return; // HARD BLOCK
    if (!mortDate || Number.isNaN(mortCount)) return;

    setMortality((prev) => [
      ...prev,
      {
        zone: selectedZone as "A" | "B" | "C",
        date: mortDate,
        count: mortCount,
        notes: mortNotes || undefined,
      },
    ]);

    setMortCount(0);
    setMortNotes("");
  };
  const visibleMortality = useMemo(() => {
    if (selectedZone === "ALL") return mortality;
    return mortality.filter((m) => m.zone === selectedZone);
  }, [mortality, selectedZone]);

  const addConsumption = () => {
    if (!consumpDate || isAllZone) return;
    setConsumptions((prev) => {
      const exists = prev.some(
        (p) => p.date === consumpDate && p.zone === selectedZone
      );
      const next = exists
        ? prev.map((p) =>
            p.date === consumpDate && p.zone === selectedZone
              ? { ...p, feedKg: feedInput, waterL: waterInput }
              : p
          )
        : [
            ...prev,
            {
              zone: selectedZone as "A" | "B" | "C",
              date: consumpDate,
              feedKg: feedInput,
              waterL: waterInput,
            },
          ];
      return next;
    });
    setFeedInput(0.1);
    setWaterInput(0.22);
  };

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col items-center gap-4 mb-2">
        <div className="flex gap-4">
          <img
            src="/img/umpsa.png"
            alt="Logo UMPSA"
            className="h-30 object-contain"
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Zone
            </label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value as any)}
              className="w-full border rounded-lg px-3 py-2 font-semibold"
            >
              <option value="ALL">All Zones</option>
              <option value="A">Zone A</option>
              <option value="B">Zone B</option>
              <option value="C">Zone C</option>
            </select>
          </div>

          <div className="text-xs text-gray-500">
            Applied to all sections below
          </div>
        </div>
      </section>

      {/* CCTV Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">CCTV Monitoring</h2>

        {/* Show single zone CCTV when zone is selected */}
        {selectedZone !== "ALL" && (
          <div className="rounded-2xl overflow-hidden shadow-lg relative">
            <div className="relative">
              <video
                src={
                  selectedZone === "A"
                    ? "/video/cctv ayam 1_tracked-stay.mp4"
                    : selectedZone === "B"
                      ? "/video/cctv ayam 1_tracked-stay.mp4"
                      : "/video/cctv ayam 1_tracked-stay.mp4"
                }
                autoPlay
                loop
                muted
                playsInline
                className="w-full object-cover"
              />
              <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded-lg text-sm font-medium">
                Zone {selectedZone}
              </div>
            </div>
          </div>
        )}

        {/* Show all zones CCTV when ALL is selected */}
        {selectedZone === "ALL" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["A", "B", "C"] as const).map((zone) => (
              <div
                key={zone}
                className="rounded-2xl overflow-hidden shadow-lg relative"
              >
                <div className="relative">
                  <video
                    src={
                      zone === "A"
                        ? "/video/cctv ayam 1_tracked-stay.mp4"
                        : zone === "B"
                          ? "/video/cctv ayam 1_tracked-stay.mp4"
                          : "/video/cctv ayam 1_tracked-stay.mp4"
                    }
                    autoPlay
                    loop
                    muted
                    playsInline
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
          Live Readings{" "}
          {selectedZone === "ALL" ? "– All Zones" : `– Zone ${selectedZone}`}
        </h2>

        {/* ================= ALL ZONES ================= */}
        {selectedZone === "ALL" && liveByZone && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            {liveByZone.map((item) => (
              <div
                key={item.label}
                className="p-4 rounded-2xl border bg-green-50 border-green-200 shadow-sm"
              >
                <div className="text-3xl mb-2">{item.icon}</div>
                <p className="text-sm text-gray-600 mb-2">{item.label}</p>

                <div className="space-y-2 text-sm">
                  {item.values.map((v) => (
                    <div
                      key={v.zone}
                      className="grid grid-cols-[70px_auto] items-center"
                    >
                      <span className="text-xs text-gray-400">
                        Zone {v.zone}
                      </span>
                      <span className="text-sm font-semibold">
                        {v.value.toFixed(2)} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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

      {/* Trend Analysis */}
      {/* ================= TREND ANALYSIS ================= */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Trend Analysis</h2>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Parameter
            </label>
            <select
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aggregation
            </label>
            <select
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as any)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="all">All time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
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
        {isApplying && (
          <div className="flex justify-center items-center h-48 text-gray-500">
            <span className="animate-pulse">Loading trend data…</span>
          </div>
        )}
        {!isApplying && <>{/* SEMUA TREND CHART DI SINI */}</>}

        {/* ================= TEMPERATURE ================= */}
        {showParam("temp") && (
          <div className="mb-6 bg-white rounded-2xl shadow p-4 h-72">
            <h3 className="font-semibold">Temperature (°C)</h3>

            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={
                  selectedZone === "ALL"
                    ? aggregatedAllZoneData
                    : aggregatedData
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayLabel" />
                <YAxis />
                <Tooltip />
                <Legend />

                {selectedZone === "ALL" ? (
                  <>
                    <Line
                      dataKey="tempA"
                      name="Zone A"
                      stroke={ZONE_COLORS.A}
                      dot={false}
                    />
                    <Line
                      dataKey="tempB"
                      name="Zone B"
                      stroke={ZONE_COLORS.B}
                      dot={false}
                    />
                    <Line
                      dataKey="tempC"
                      name="Zone C"
                      stroke={ZONE_COLORS.C}
                      dot={false}
                    />
                  </>
                ) : (
                  <Line
                    dataKey="temp"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
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
              <LineChart
                data={
                  selectedZone === "ALL"
                    ? aggregatedAllZoneData
                    : aggregatedData
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayLabel" />
                <YAxis />
                <Tooltip />
                <Legend />

                {selectedZone === "ALL" ? (
                  <>
                    <Line
                      dataKey="humidityA"
                      name="Zone A"
                      stroke={ZONE_COLORS.A}
                      dot={false}
                    />
                    <Line
                      dataKey="humidityB"
                      name="Zone B"
                      stroke={ZONE_COLORS.B}
                      dot={false}
                    />
                    <Line
                      dataKey="humidityC"
                      name="Zone C"
                      stroke={ZONE_COLORS.C}
                      dot={false}
                    />
                  </>
                ) : (
                  <Line
                    dataKey="humidity"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
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
              <LineChart
                data={
                  selectedZone === "ALL"
                    ? aggregatedAllZoneData
                    : aggregatedData
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayLabel" />
                <YAxis />
                <Tooltip />
                <Legend />

                {selectedZone === "ALL" ? (
                  <>
                    <Line
                      dataKey="co2A"
                      name="Zone A"
                      stroke={ZONE_COLORS.A}
                      dot={false}
                    />
                    <Line
                      dataKey="co2B"
                      name="Zone B"
                      stroke={ZONE_COLORS.B}
                      dot={false}
                    />
                    <Line
                      dataKey="co2C"
                      name="Zone C"
                      stroke={ZONE_COLORS.C}
                      dot={false}
                    />
                  </>
                ) : (
                  <Line
                    dataKey="co2"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
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
              <LineChart
                data={
                  selectedZone === "ALL"
                    ? aggregatedAllZoneData
                    : aggregatedData
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayLabel" />
                <YAxis />
                <Tooltip />
                <Legend />

                {selectedZone === "ALL" ? (
                  <>
                    <Line
                      dataKey="nh3A"
                      name="Zone A"
                      stroke={ZONE_COLORS.A}
                      dot={false}
                    />
                    <Line
                      dataKey="nh3B"
                      name="Zone B"
                      stroke={ZONE_COLORS.B}
                      dot={false}
                    />
                    <Line
                      dataKey="nh3C"
                      name="Zone C"
                      stroke={ZONE_COLORS.C}
                      dot={false}
                    />
                  </>
                ) : (
                  <Line
                    dataKey="nh3"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
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
              <LineChart
                data={
                  selectedZone === "ALL"
                    ? aggregatedAllZoneData
                    : aggregatedData
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayLabel" />
                <YAxis />
                <Tooltip />
                <Legend />

                {selectedZone === "ALL" ? (
                  <>
                    <Line
                      dataKey="pm25A"
                      name="Zone A"
                      stroke={ZONE_COLORS.A}
                      dot={false}
                    />
                    <Line
                      dataKey="pm25B"
                      name="Zone B"
                      stroke={ZONE_COLORS.B}
                      dot={false}
                    />
                    <Line
                      dataKey="pm25C"
                      name="Zone C"
                      stroke={ZONE_COLORS.C}
                      dot={false}
                    />
                  </>
                ) : (
                  <Line
                    dataKey="pm25"
                    name={`Zone ${selectedZone}`}
                    stroke={ZONE_COLORS[selectedZone]}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ======================= Correlation Insight ======================= */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Correlation Insight</h2>

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
                ? (["A", "B", "C"] as const)
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
                ? (["A", "B", "C"] as const)
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
                ? (["A", "B", "C"] as const)
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

      {/* ============ Health & Behavior Monitoring (Prototype) ============ */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">
          Health & Behavior Monitoring
        </h2>

        {/* Vision-based Activity (Prototype) */}
        {selectedZone !== "ALL" && (
          <div className="bg-white rounded-2xl shadow p-4 mb-6">
            <h3 className="font-semibold text-lg mb-3">
              Chicken Activity Analysis (Vision-Based) – Zone {selectedZone}
            </h3>
            <div className="rounded-xl overflow-hidden relative w-full" style={{ aspectRatio: '16/9' }}>
              <video
                src={
                  selectedZone === "A"
                    ? "/video/cctv ayam 1.mp4"
                    : selectedZone === "B"
                      ? "/video/cctv ayam 1.mp4"
                      : "/video/cctv ayam 1.mp4"
                }
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              {/* Pseudo heatmap overlay */}
              <div
                className="absolute inset-0 pointer-events-none opacity-40"
                style={{
                  background:
                    "radial-gradient(circle at 30% 40%, #ff0000, transparent 40%), radial-gradient(circle at 70% 60%, #ffbb00, transparent 35%), radial-gradient(circle at 50% 30%, #ffff00d7, transparent 30%)",
                }}
              />
              <div className="absolute bottom-2 right-2 bg-white/80 backdrop-blur px-3 py-1 rounded-lg text-xs">
                Heatmap
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-gray-50">
                <div className="text-gray-500">Activity Score</div>
                <div className="text-xl font-semibold">
                  {Math.round(activityScore)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <div className="text-gray-500">Status</div>
                <div
                  className={`text-sm font-semibold ${
                    activityScore < 35
                      ? "text-red-600"
                      : activityScore < 60
                        ? "text-yellow-600"
                        : "text-green-700"
                  }`}
                >
                  {activityScore < 35
                    ? "Abnormal (Low)"
                    : activityScore < 60
                      ? "Moderate"
                      : "Normal"}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-gray-50">
                <div className="text-gray-500">Reason</div>
                <div className="text-xs">{abnormalReason}</div>
              </div>
            </div>
          </div>
        )}

        {/* All zones activity view */}
        {selectedZone === "ALL" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {(["A", "B", "C"] as const).map((zone) => (
              <div key={zone} className="bg-white rounded-2xl shadow p-4">
                <h3 className="font-semibold text-lg mb-3">
                  Activity Analysis – Zone {zone}
                </h3>
                <div className="rounded-xl overflow-hidden relative w-full" style={{ aspectRatio: '16/9' }}>
                  <video
                    src={
                      zone === "A"
                        ? "/video/cctv ayam 1.mp4"
                        : zone === "B"
                          ? "/video/cctv ayam 1.mp4"
                          : "/video/cctv ayam 1.mp4"
                    }
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {/* Pseudo heatmap overlay */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-40"
                    style={{
                      background:
                        "radial-gradient(circle at 30% 40%, #ff0000, transparent 40%), radial-gradient(circle at 70% 60%, #ffbb00, transparent 35%), radial-gradient(circle at 50% 30%, #ffff00d7, transparent 30%)",
                    }}
                  />
                  <div className="absolute bottom-2 right-2 bg-white/80 backdrop-blur px-2 py-0.5 rounded text-xs">
                    Heatmap
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-gray-50">
                    <div className="text-gray-500">Activity Score</div>
                    <div className="text-lg font-semibold">
                      {Math.round(activityScore)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-50">
                    <div className="text-gray-500">Status</div>
                    <div
                      className={`font-semibold ${
                        activityScore < 35
                          ? "text-red-600"
                          : activityScore < 60
                            ? "text-yellow-600"
                            : "text-green-700"
                      }`}
                    >
                      {activityScore < 35
                        ? "Abnormal"
                        : activityScore < 60
                          ? "Moderate"
                          : "Normal"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Row: Mortality */}
        <div className={`grid gap-6 mb-6 ${isAllZone ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"}`}>
          {/* Mortality Logging - Table */}
          {!isAllZone && (
            <div className="lg:col-span-1 bg-white rounded-2xl shadow p-4">
              <h3 className="font-semibold text-lg mb-3">
                Mortality Detection / Logging
              </h3>

              {/* ================= FORM (ONLY SINGLE ZONE) ================= */}
              {!isAllZone && (
                <div className="flex flex-col gap-3 mb-4">
                  <div>
                    <label className="text-sm text-gray-600">Date</label>
                    <input
                      type="date"
                      className="w-full border rounded-lg px-3 py-2"
                      value={mortDate}
                      onChange={(e) => setMortDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-600">Count</label>
                    <input
                      type="number"
                      className="w-full border rounded-lg px-3 py-2"
                      min={0}
                      value={mortCount}
                      onChange={(e) => setMortCount(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-600">Notes</label>
                    <input
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="optional"
                      value={mortNotes}
                      onChange={(e) => setMortNotes(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={addMortality}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                  >
                    Add
                  </button>
                </div>
              )}

              {/* ================= TABLE ================= */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {isAllZone ? (
                      <tr className="text-left text-gray-500">
                        <th className="py-2">Date</th>
                        <th className="py-2 text-center">Zone A</th>
                        <th className="py-2 text-center">Zone B</th>
                        <th className="py-2 text-center">Zone C</th>
                      </tr>
                    ) : (
                      <tr className="text-left text-gray-500">
                        <th className="py-2">Date</th>
                        <th className="py-2">Count</th>
                        <th className="py-2">Notes</th>
                      </tr>
                    )}
                  </thead>

                  {/* ===== ALL ZONE BODY ===== */}
                  {isAllZone && (
                    <tbody>
                      {mortalitySummaryByDate.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 text-gray-400">
                            No records yet.
                          </td>
                        </tr>
                      ) : (
                        mortalitySummaryByDate.map((row) => (
                          <tr key={row.date} className="border-t">
                            <td className="py-2">{row.date}</td>
                            <td className="py-2 text-center">{row.A}</td>
                            <td className="py-2 text-center">{row.B}</td>
                            <td className="py-2 text-center">{row.C}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  )}

                  {/* ===== SINGLE ZONE BODY ===== */}
                  {!isAllZone && (
                    <tbody>
                      {visibleMortality.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-3 text-gray-400">
                            No records yet.
                          </td>
                        </tr>
                      ) : (
                        visibleMortality.map((m, i) => (
                          <tr key={`${m.date}-${i}`} className="border-t">
                            <td className="py-2">{m.date}</td>
                            <td className="py-2">{m.count}</td>
                            <td className="py-2">{m.notes ?? "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Mortality Chart */}
          <div className={`${isAllZone ? "lg:col-span-1" : "lg:col-span-2"} bg-white rounded-2xl shadow p-4`}>
            <h3 className="font-semibold text-lg mb-3">
              Mortality Trend {!isAllZone && `- Zone ${selectedZone}`}
            </h3>
            <div className="h-64">
              {isAllZone ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mortalitySummaryByDate}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="A" fill="#ef4444" name="Zone A" />
                    <Bar dataKey="B" fill="#3b82f6" name="Zone B" />
                    <Bar dataKey="C" fill="#10b981" name="Zone C" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={visibleMortality}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke={ZONE_COLORS[selectedZone]}
                      dot={{ r: 4 }}
                      name={`Mortality - Zone ${selectedZone}`}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Row: Feed & Water Consumption */}
        <div className={`grid gap-6 mt-6 ${isAllZone ? "grid-cols-2" : "grid-cols-1 lg:grid-cols-3"}`}>
          {/* Form & Table */}
          {!isAllZone && (
            <div className="bg-white rounded-2xl shadow p-4">
              <h3 className="font-semibold text-lg mb-3">
                Feed & Water Consumption {!isAllZone && `- Zone ${selectedZone}`}
              </h3>

              {/* ================= FORM (ONLY SINGLE ZONE) ================= */}
              {!isAllZone && (
                <div className="flex flex-col gap-3 mb-4">
                  <div>
                    <label className="text-sm text-gray-600">Date</label>
                    <input
                      type="date"
                      className="w-full border rounded-lg px-3 py-2"
                      value={consumpDate}
                      onChange={(e) => setConsumpDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-600">Feed (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded-lg px-3 py-2"
                      value={feedInput}
                      onChange={(e) => setFeedInput(Number(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-600">Water (L)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded-lg px-3 py-2"
                      value={waterInput}
                      onChange={(e) => setWaterInput(Number(e.target.value))}
                    />
                  </div>

                  <button
                    onClick={addConsumption}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                  >
                    Add
                  </button>
                </div>
              )}

              {/* ================= TABLE ================= */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {isAllZone ? (
                      <tr className="text-left text-gray-500">
                        <th className="py-2 px-2">Date</th>
                        <th className="py-2 px-2">Zone</th>
                        <th className="py-2 px-2">Feed (kg)</th>
                        <th className="py-2 px-2">Water (L)</th>
                      </tr>
                    ) : (
                      <tr className="text-left text-gray-500">
                        <th className="py-2 px-2">Date</th>
                        <th className="py-2 px-2">Feed (kg)</th>
                        <th className="py-2 px-2">Water (L)</th>
                      </tr>
                    )}
                  </thead>

                  {/* ===== ALL ZONE BODY ===== */}
                  {isAllZone && (
                    <tbody>
                      {consumptions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 text-gray-400">
                            No records yet.
                          </td>
                        </tr>
                      ) : (
                        [...consumptions]
                          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                          .map((c, i) => (
                            <tr key={`${c.date}-${c.zone}-${i}`} className="border-t">
                              <td className="py-2 px-2">{c.date}</td>
                              <td className="py-2 px-2">{c.zone}</td>
                              <td className="py-2 px-2">{c.feedKg}</td>
                              <td className="py-2 px-2">{c.waterL}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  )}

                  {/* ===== SINGLE ZONE BODY ===== */}
                  {!isAllZone && (
                    <tbody>
                      {visibleConsumptions.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-3 text-gray-400">
                            No records yet.
                          </td>
                        </tr>
                      ) : (
                        [...visibleConsumptions]
                          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                          .map((c, i) => (
                            <tr key={`${c.date}-${i}`} className="border-t">
                              <td className="py-2 px-2">{c.date}</td>
                              <td className="py-2 px-2">{c.feedKg}</td>
                              <td className="py-2 px-2">{c.waterL}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Chart: Feed */}
          <div className={`bg-white rounded-2xl shadow p-4 ${isAllZone ? "col-span-1" : "col-span-1"}`}>
            <h3 className="font-semibold mb-2">
              Daily Feed Trend {!isAllZone && `- Zone ${selectedZone}`}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {isAllZone ? (
                  <LineChart data={consumptionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="A"
                      name="Feed Zone A (kg)"
                      stroke={ZONE_COLORS.A}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="B"
                      name="Feed Zone B (kg)"
                      stroke={ZONE_COLORS.B}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="C"
                      name="Feed Zone C (kg)"
                      stroke={ZONE_COLORS.C}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="stdA"
                      name="Std Feed (kg)"
                      stroke="#ef4444"
                      dot={false}
                      strokeDasharray="4 4"
                    />
                  </LineChart>
                ) : (
                  <LineChart data={consumptionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="feedKg"
                      stroke={ZONE_COLORS[selectedZone]}
                      dot={{ r: 4 }}
                      name={`Feed Zone ${selectedZone} (kg)`}
                    />
                    <Line
                      type="monotone"
                      dataKey="stdFeedKg"
                      name="Std Feed (kg)"
                      stroke="#ef4444"
                      dot={false}
                      strokeDasharray="4 4"
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart: Water */}
          <div className="bg-white rounded-2xl shadow p-4 col-span-1">
            <h3 className="font-semibold mb-2">
              Daily Water Trend {!isAllZone && `- Zone ${selectedZone}`}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {isAllZone ? (
                  <LineChart data={consumptionWaterChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="A"
                      name="Water Zone A (L)"
                      stroke={ZONE_COLORS.A}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="B"
                      name="Water Zone B (L)"
                      stroke={ZONE_COLORS.B}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="C"
                      name="Water Zone C (L)"
                      stroke={ZONE_COLORS.C}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="stdA"
                      name="Std Water (L)"
                      stroke="#ef4444"
                      dot={false}
                      strokeDasharray="4 4"
                    />
                  </LineChart>
                ) : (
                  <LineChart data={consumptionWaterChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="waterL"
                      stroke={ZONE_COLORS[selectedZone]}
                      dot={{ r: 4 }}
                      name={`Water Zone ${selectedZone} (L)`}
                    />
                    <Line
                      type="monotone"
                      dataKey="stdWaterL"
                      name="Std Water (L)"
                      stroke="#ef4444"
                      dot={false}
                      strokeDasharray="4 4"
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">
          Broiler Body Weight Monitoring
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold text-lg mb-3">Broiler Weight</h3>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-sm text-gray-600">Day</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border rounded-lg px-3 py-2"
                  value={weightDay}
                  onChange={(e) => setWeightDay(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">
                  Actual Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded-lg px-3 py-2"
                  value={actualWeight}
                  onChange={(e) => setActualWeight(Number(e.target.value))}
                />
              </div>
            </div>

            <button
              onClick={addWeightEntry}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg w-full"
            >
              Save Entry
            </button>

            <div className="mt-4 max-h-52 overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-2">Day</th>
                    <th className="py-2 px-2">Std (kg)</th>
                    <th className="py-2 px-2">Actual (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {weights.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-3 text-gray-400 text-center"
                      >
                        No data yet
                      </td>
                    </tr>
                  ) : (
                    weights.map((w) => (
                      <tr key={w.day} className="border-t">
                        <td className="py-1 px-2">{w.day}</td>
                        <td className="py-1 px-2">{w.stdWeightKg}</td>
                        <td
                          className={`py-1 px-2 font-medium ${
                            w.actualWeightKg < w.stdWeightKg
                              ? "text-red-600"
                              : "text-green-700"
                          }`}
                        >
                          {w.actualWeightKg}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT */}
          <div className="bg-white rounded-2xl shadow p-4 col-span-2">
            <h3 className="font-semibold mb-2">
              Daily Body Weight vs Standard
            </h3>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weights}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="actualWeightKg"
                    name="Actual Weight (kg)"
                    stroke="#3b82f6"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="stdWeightKg"
                    name="Standard Weight (kg)"
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {weights.length > 0 && (
              <div className="mt-3 text-sm">
                {weights.at(-1)!.actualWeightKg <
                weights.at(-1)!.stdWeightKg ? (
                  <span className="text-red-600">
                    ⚠️ Weight below standard on day {weights.at(-1)!.day}
                  </span>
                ) : (
                  <span className="text-green-700">
                    ✅ Weight meets standard
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* System Health */}
      <section>
        <h2 className="text-2xl font-semibold mb-2">System Health & Uptime</h2>
        <div className="p-4 bg-gray-50 rounded-xl shadow flex flex-col sm:flex-row gap-4">
          <div>📡 Status: {allData.length ? "Online" : "Starting…"}</div>
          <div>🔋 Battery: 95%</div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow p-6 mt-10">
        <h2 className="text-2xl font-semibold mb-4">
          AI Environmental Insight
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <select
            value={selectedInsight}
            onChange={(e) => setSelectedInsight(e.target.value)}
            className="border rounded-lg px-3 py-2"
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
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            {isGeneratingInsight ? "Generating..." : "Generate Insight"}
          </button>
        </div>

        {aiError && <p className="text-red-600">{aiError}</p>}

        {aiInsight && (
          <div className="whitespace-pre-line bg-gray-50 p-4 rounded-lg text-sm">
            {aiInsight}
          </div>
        )}
      </section>
    </div>
  );
}
