import { SENSOR_ALERT_RULES } from "./alertRules";
import {
  buildDeterministicCycleSummary,
  type HarvestSummary,
} from "./cycleAnalytics";
import type { CycleRiskAssessment } from "./cyclePrediction";
import {
  createFocusedHistoricalAdvice,
  createHistoricalCycleAnalysis,
} from "./historicalCycleAnalysis";
import type { HistoricalCycle } from "./historicalCycles";
import type {
  CurrentCycleReportAnalysisSnapshot,
  HistoricalCycleReportAnalysisSnapshot,
  ReportAnalysisSource,
} from "./reportAnalysis";
import type {
  CycleReportAnalysis,
  CycleReportPdfModel,
} from "./reportPdf";
import { summarizeData } from "./sensorData";
import type {
  DataPoint,
  ProductionCycle,
  SensorMetric,
  Zone,
} from "./types";

const REPORT_SENSOR_METRICS = Object.keys(
  SENSOR_ALERT_RULES
) as SensorMetric[];

function analysisSourceLabel(source: ReportAnalysisSource): string {
  if (source === "ai") return "AI-assisted dashboard analysis";
  if (source === "fallback") return "Evidence-checked fallback analysis";
  return "Deterministic dashboard analysis";
}

function buildReportActions(
  summary: ReturnType<typeof summarizeData>
): string[] {
  if (!summary) return ["No sensor data is available for this report window."];

  const actions: string[] = [];
  if (summary.temp.max > 32) {
    actions.push(
      "Check ventilation and cooling because temperature exceeded 32°C."
    );
  }
  if (summary.co2.max > 1200) {
    actions.push("Increase air exchange because CO₂ exceeded 1200 ppm.");
  }
  if (summary.nh3.max > 5) {
    actions.push(
      "Inspect litter condition and airflow because NH₃ exceeded 5 ppm."
    );
  }
  if (summary.pm25.max > 35) {
    actions.push(
      "Review dust sources, feed handling, and cleaning because PM2.5 exceeded 35 µg/m³."
    );
  }
  if (summary.humidity.max > 85) {
    actions.push("Reduce moisture sources because humidity exceeded 85%.");
  }

  return actions.length
    ? actions
    : [
        "Current readings are within configured thresholds. Continue routine monitoring.",
      ];
}

export function buildCurrentCycleReportModel({
  cycle,
  zone,
  sensorData,
  harvestSummary,
  riskAssessment,
  activeAlertCount,
  analysisSnapshot,
  generatedAt = new Date(),
}: {
  cycle: ProductionCycle;
  zone: Zone;
  sensorData: DataPoint[];
  harvestSummary: HarvestSummary;
  riskAssessment: CycleRiskAssessment;
  activeAlertCount: number;
  analysisSnapshot?: CurrentCycleReportAnalysisSnapshot | null;
  generatedAt?: Date;
}): CycleReportPdfModel {
  const latestReading = sensorData.at(-1)?.time;
  const reportActions = buildReportActions(summarizeData(sensorData));
  const matchingAnalysis =
    analysisSnapshot?.cycleIds.includes(cycle.id) &&
    analysisSnapshot.zones.includes(zone)
      ? analysisSnapshot
      : null;
  const riskFinding = {
    title: `${riskAssessment.level} cycle risk`,
    evidence: riskAssessment.summary,
    interpretation: `${activeAlertCount} sensor alerts are active now; ${harvestSummary.alertCount} threshold alert episodes were recorded across the cycle.`,
  };
  const analysis: CycleReportAnalysis = matchingAnalysis
    ? {
        sourceLabel: analysisSourceLabel(matchingAnalysis.source),
        generatedAt: matchingAnalysis.generatedAt
          ? new Date(matchingAnalysis.generatedAt).toLocaleString("id-ID")
          : undefined,
        dataThrough: matchingAnalysis.dataThrough,
        model: matchingAnalysis.model,
        riskLevel: riskAssessment.level,
        stale: matchingAnalysis.stale,
        summary: matchingAnalysis.advice.summary,
        findings: [
          riskFinding,
          ...matchingAnalysis.advice.keyRisks.map((finding) => ({
            title: finding.title,
            evidence: finding.evidence,
            interpretation: finding.impact,
          })),
        ].slice(0, 4),
        actions: matchingAnalysis.advice.priorityActions,
        monitoring: matchingAnalysis.advice.monitoringFocus,
      }
    : {
        sourceLabel: analysisSourceLabel("local"),
        dataThrough: latestReading,
        riskLevel: riskAssessment.level,
        summary: buildDeterministicCycleSummary(
          cycle,
          harvestSummary,
          sensorData
        ),
        findings: [
          riskFinding,
          ...reportActions.slice(0, 3).map((action, index) => ({
            title: `Operational review item ${index + 1}`,
            evidence: action,
            interpretation:
              "Generated from the current cycle sensor and production snapshot.",
          })),
        ],
        actions: reportActions.slice(0, 5).map((action) => ({
          timeframe: "Current cycle",
          action,
          reason:
            "Derived from the configured dashboard thresholds and current records.",
        })),
        monitoring: [
          "Sensor threshold timing",
          "Daily mortality",
          "Feed and water intake",
          "Body-weight checkpoints",
        ],
      };

  const sensorMetrics = REPORT_SENSOR_METRICS.map((metric) => {
    const values = sensorData.map((point) => point[metric]);
    const rule = SENSOR_ALERT_RULES[metric];
    const exceedances = values.filter(
      (value) => value > rule.threshold
    ).length;

    return {
      label: rule.label,
      unit: rule.unit,
      average: values.length
        ? values.reduce((total, value) => total + value, 0) / values.length
        : 0,
      minimum: values.length ? Math.min(...values) : 0,
      maximum: values.length ? Math.max(...values) : 0,
      exceedanceLabel: `${exceedances.toLocaleString()} readings above ${rule.threshold.toLocaleString()} ${rule.unit}`,
    };
  });

  return {
    kind: "current",
    title: "Current Cycle Report",
    cycleId: cycle.id,
    houseName: cycle.houseName,
    zoneLabel: `Zone ${zone}`,
    statusLabel: `Active - Cycle risk ${riskAssessment.level}`,
    periodLabel: `${cycle.startDate} to ${
      cycle.actualHarvestDate ?? latestReading?.slice(0, 10) ?? "Current"
    }`,
    generatedAt: generatedAt.toLocaleString("id-ID"),
    dataWindow: `${sensorData[0]?.time ?? "No data"} to ${
      latestReading ?? "No data"
    }`,
    sourceLabel: `Current cycle sensor snapshot (${sensorData.length.toLocaleString()} records)`,
    revision: cycle.revision,
    kpis: [
      {
        label: "Cycle day",
        value: `${harvestSummary.cycleDay} / ${cycle.targetHarvestDay}`,
      },
      {
        label: "Birds placed",
        value: cycle.initialBirds.toLocaleString(),
      },
      {
        label: "Birds remaining",
        value: harvestSummary.survivingBirds.toLocaleString(),
      },
      {
        label: "Mortality",
        value: `${harvestSummary.mortalityRate.toFixed(2)}%`,
        detail: `${harvestSummary.totalMortality.toLocaleString()} birds`,
      },
      {
        label: "Average weight",
        value: `${harvestSummary.finalAverageWeightKg.toFixed(3)} kg`,
      },
      {
        label: "Feed / bird",
        value: `${harvestSummary.totalFeedPerBirdKg.toFixed(2)} kg`,
      },
      {
        label: "Water / bird",
        value: `${harvestSummary.totalWaterPerBirdL.toFixed(2)} L`,
      },
      {
        label: "Estimated FCR",
        value: harvestSummary.fcr.toFixed(2),
      },
    ],
    sensorMetrics,
    sensorSummary: `${sensorData.length.toLocaleString()} readings are included with ${harvestSummary.sensorHealth.completeness.toFixed(1)}% expected coverage and ${harvestSummary.sensorHealth.issueCount.toLocaleString()} readings requiring review. ${activeAlertCount.toLocaleString()} sensor alerts are active at export; ${harvestSummary.alertCount.toLocaleString()} threshold alert episodes were recorded across the cycle.`,
    analysis,
  };
}

export function buildHistoricalCycleReportModel({
  historicalCycle,
  cyclesByZone,
  analysisSnapshot,
  generatedAt = new Date(),
}: {
  historicalCycle: HistoricalCycle;
  cyclesByZone: Record<Zone, ProductionCycle>;
  analysisSnapshot?: HistoricalCycleReportAnalysisSnapshot;
  generatedAt?: Date;
}): CycleReportPdfModel {
  const historicalAnalysis = createHistoricalCycleAnalysis(historicalCycle);
  const baseline = historicalAnalysis.baseline;
  const production = baseline.production;
  const advice =
    analysisSnapshot?.advice ??
    createFocusedHistoricalAdvice(historicalAnalysis, "overall");
  const formatOptional = (
    value: number | null,
    decimals: number,
    unit = ""
  ) =>
    value === null
      ? "Not available"
      : `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
  const analysis: CycleReportAnalysis = {
    sourceLabel: analysisSourceLabel(analysisSnapshot?.source ?? "local"),
    generatedAt: analysisSnapshot?.generatedAt
      ? new Date(analysisSnapshot.generatedAt).toLocaleString("id-ID")
      : undefined,
    dataThrough: historicalCycle.data.at(-1)?.time,
    model: analysisSnapshot?.model,
    riskLevel: baseline.riskLevel,
    question:
      analysisSnapshot?.questionLabel ??
      "What are the main lessons from this completed cycle?",
    summary: advice.summary,
    findings: advice.keyFindings.map((finding) => ({
      title: finding.title,
      evidence: finding.evidence,
      interpretation: finding.meaning,
    })),
    actions: advice.nextCycleActions,
    monitoring: advice.monitoringFocus,
  };

  return {
    kind: "completed",
    title: "Completed Cycle Report",
    cycleId: historicalCycle.id,
    houseName:
      cyclesByZone[historicalCycle.zone]?.houseName ?? "Poultry House 1",
    zoneLabel: `Zone ${historicalCycle.zone}`,
    statusLabel: `Completed - ${baseline.riskLevel} risk`,
    periodLabel: baseline.period,
    generatedAt: generatedAt.toLocaleString("id-ID"),
    dataWindow: `${historicalCycle.data[0]?.time ?? "No data"} to ${
      historicalCycle.data.at(-1)?.time ?? "No data"
    }`,
    sourceLabel:
      historicalCycle.sourceLabel ?? "Stored completed-cycle snapshot",
    revision: historicalCycle.revision,
    completionNotes: historicalCycle.completionNotes,
    kpis: [
      {
        label: "Harvest day",
        value: `Day ${baseline.harvestDay}`,
      },
      {
        label: "Birds placed",
        value: production.initialBirds.toLocaleString(),
      },
      {
        label: "Birds remaining",
        value: production.survivingBirds.toLocaleString(),
      },
      {
        label: "Mortality",
        value: `${production.mortalityRate.toFixed(2)}%`,
        detail: `${production.totalMortality.toLocaleString()} birds`,
      },
      {
        label: "Final avg weight",
        value: `${production.finalAverageWeightKg.toFixed(3)} kg`,
      },
      {
        label: "Feed / bird",
        value: formatOptional(production.totalFeedPerBirdKg, 2, "kg"),
      },
      {
        label: "Water / bird",
        value: formatOptional(production.totalWaterPerBirdL, 2, "L"),
      },
      {
        label: "Estimated FCR",
        value: formatOptional(production.estimatedFcr, 2),
      },
    ],
    sensorMetrics: baseline.metrics.map((metric) => ({
      label: metric.label,
      unit: metric.unit,
      average: metric.average,
      minimum: metric.minimum,
      maximum: metric.maximum,
      exceedanceLabel: `${metric.exceedanceCount.toLocaleString()} readings (${metric.exceedancePercent.toFixed(1)}%) outside ${metric.reviewLimit}`,
    })),
    sensorSummary: `${baseline.records.toLocaleString()} stored readings provide ${baseline.completeness.toFixed(1)}% expected coverage. ${baseline.readingsWithIssue.toLocaleString()} readings (${baseline.issueReadingPercent.toFixed(1)}%) were outside at least one review limit.`,
    analysis,
  };
}
