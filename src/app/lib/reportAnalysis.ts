import type {
  CyclePredictionAdvice,
  PredictionRiskLevel,
} from "./cyclePrediction";
import type {
  HistoricalAnalysisQuestionId,
  HistoricalAnalysisRisk,
  HistoricalCycleAdvice,
} from "./historicalCycleAnalysis";
import type { Zone } from "./types";

export type ReportAnalysisSource = "ai" | "fallback" | "local";

export type CurrentCycleReportAnalysisSnapshot = {
  contextSignature: string;
  cycleIds: string[];
  zones: Zone[];
  source: ReportAnalysisSource;
  generatedAt?: string;
  dataThrough: string;
  model?: string;
  riskLevel: PredictionRiskLevel;
  stale: boolean;
  advice: CyclePredictionAdvice;
};

export type HistoricalCycleReportAnalysisSnapshot = {
  cycleId: string;
  questionId: HistoricalAnalysisQuestionId;
  questionLabel: string;
  source: ReportAnalysisSource;
  generatedAt?: string;
  model?: string;
  riskLevel: HistoricalAnalysisRisk;
  advice: HistoricalCycleAdvice;
};
