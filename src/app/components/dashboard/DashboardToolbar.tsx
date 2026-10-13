"use client";

import type { HarvestSummary } from "../../lib/cycleAnalytics";
import type {
  CycleRiskAssessment,
  PredictionRiskLevel,
} from "../../lib/cyclePrediction";
import type { AlertEvent, ProductionCycle, Zone } from "../../lib/types";
import NotificationCenter from "../NotificationCenter";
import {
  useDashboardNavigation,
  type SelectableZone,
} from "./DashboardNavigationProvider";

export default function DashboardToolbar({
  activeZones,
  isSingleZone,
  cycle,
  cyclesByZone,
  reportZones,
  harvestSummariesByZone,
  cycleRiskAssessmentsByZone,
  latestTime,
  refreshIntervalMs,
  alerts,
  soundEnabled,
  onToggleSound,
  onAcknowledge,
  operationalStatus,
}: {
  activeZones: Zone[];
  isSingleZone: boolean;
  cycle: ProductionCycle;
  cyclesByZone: Record<Zone, ProductionCycle>;
  reportZones: Zone[];
  harvestSummariesByZone: Record<Zone, HarvestSummary>;
  cycleRiskAssessmentsByZone: Record<Zone, CycleRiskAssessment>;
  latestTime: string;
  refreshIntervalMs: number;
  alerts: AlertEvent[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onAcknowledge: (id: string) => void;
  operationalStatus: "active" | "inactive" | "replay";
}) {
  const { selectedZone, selectZone } = useDashboardNavigation();
  const riskRank: Record<PredictionRiskLevel, number> = {
    Low: 0,
    Moderate: 1,
    High: 2,
  };
  const riskStyle: Record<PredictionRiskLevel, string> = {
    Low: "border-emerald-200 bg-emerald-50 text-emerald-800",
    Moderate: "border-amber-200 bg-amber-50 text-amber-900",
    High: "border-red-200 bg-red-50 text-red-800",
  };
  const scopedCycleRisks = reportZones
    .filter((zone) => cyclesByZone[zone].status === "active")
    .map((zone) => ({
      zone,
      assessment: cycleRiskAssessmentsByZone[zone],
    }));
  const highestCycleRisk = scopedCycleRisks.reduce<
    (typeof scopedCycleRisks)[number] | null
  >(
    (highest, candidate) =>
      !highest ||
      riskRank[candidate.assessment.level] >
        riskRank[highest.assessment.level]
        ? candidate
        : highest,
    null
  );
  const cycleAlertEpisodeCount = reportZones
    .filter((zone) => cyclesByZone[zone].status === "active")
    .reduce(
      (total, zone) => total + harvestSummariesByZone[zone].alertCount,
      0
    );

  return (
    <section
      aria-label="Dashboard controls and status"
      className="sticky top-0 z-50 rounded-2xl border-b-2 border-gray-300 bg-gray-50 p-4 shadow-lg"
    >
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Monitored house
            </div>
            {isSingleZone ? (
              <div className="font-semibold">
                {cycle.houseName} · Zone {activeZones[0]}
              </div>
            ) : (
              <select
                value={selectedZone}
                onChange={(event) =>
                  selectZone(event.target.value as SelectableZone)
                }
                className="mt-1 min-h-11 min-w-40 rounded-lg border border-gray-300 bg-white px-3 py-2 font-semibold"
                aria-label="Select monitored zone"
              >
                <option value="ALL">All Zones</option>
                {activeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    Zone {zone}
                  </option>
                ))}
              </select>
            )}
          </div>

          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              operationalStatus === "inactive"
                ? "border-slate-300 bg-slate-100 text-slate-700"
                : operationalStatus === "replay"
                  ? "border-violet-300 bg-violet-100 text-violet-800"
                : "border-violet-200 bg-violet-50 text-violet-700"
            }`}
          >
            {operationalStatus === "inactive"
              ? "Monitoring Inactive"
              : operationalStatus === "replay"
                ? `Monitoring · ${refreshIntervalMs / 1000}s update`
              : `Live Monitoring · ${refreshIntervalMs / 1000}s refresh`}
          </span>

          {reportZones.map((zone) => {
            const zoneCycle = cyclesByZone[zone];
            const zoneSummary = harvestSummariesByZone[zone];
            return (
              <span
                key={zone}
                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
              >
                Zone {zone} ·{" "}
                {operationalStatus === "inactive"
                  ? "Cycle not running"
                  : operationalStatus === "replay"
                    ? `Replay ${zoneCycle.id} · Day ${zoneSummary.cycleDay}/${zoneCycle.targetHarvestDay}`
                  : zoneCycle.status === "draft"
                  ? "Not started"
                  : zoneCycle.status === "completed"
                    ? "Completed"
                    : `Active · Day ${zoneSummary.cycleDay}/${zoneCycle.targetHarvestDay}`}
              </span>
            );
          })}

          {(operationalStatus === "active" || operationalStatus === "replay") &&
            highestCycleRisk &&
            latestTime !== "-" && (
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStyle[highestCycleRisk.assessment.level]}`}
              title={`Risk score ${highestCycleRisk.assessment.score}: ${highestCycleRisk.assessment.summary}`}
            >
              {scopedCycleRisks.length > 1
                ? `Highest cycle risk: ${highestCycleRisk.assessment.level} · Zone ${highestCycleRisk.zone}`
                : `${operationalStatus === "replay" ? "Replay cycle risk" : "Cycle risk"}: ${highestCycleRisk.assessment.level}`}
              {highestCycleRisk.assessment.factors.length > 0
                ? ` · ${highestCycleRisk.assessment.factors
                    .slice(0, 2)
                    .map((factor) => factor.label)
                    .join(" · ")}`
                : ""}
            </span>
          )}

          <span className="text-xs text-gray-500">
            Current record: {operationalStatus === "inactive" ? "—" : latestTime}
          </span>
        </div>

        <NotificationCenter
          scopeLabel={operationalStatus === "replay" ? `Replay ${reportZones.map((zone) => cyclesByZone[zone].id).join(", ")} · through ${latestTime}` : `${cycle.id} · through ${latestTime}`}
          alerts={operationalStatus === "inactive" ? [] : alerts}
          soundEnabled={soundEnabled}
          onToggleSound={onToggleSound}
          onAcknowledge={onAcknowledge}
          cycleAlertEpisodeCount={
            operationalStatus === "inactive" ? 0 : cycleAlertEpisodeCount
          }
        />
      </div>
    </section>
  );
}
