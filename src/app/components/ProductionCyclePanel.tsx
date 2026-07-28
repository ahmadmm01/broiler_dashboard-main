"use client";

import { useState } from "react";
import type { HarvestSummary } from "../lib/cycleAnalytics";
import type {
  CompleteCycleInput,
  StartCycleInput,
} from "../lib/cycleLifecycle";
import type { ProductionCycle } from "../lib/types";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const todayDate = () => {
  const current = new Date();
  current.setMinutes(current.getMinutes() - current.getTimezoneOffset());
  return current.toISOString().slice(0, 10);
};

export default function ProductionCyclePanel({
  cycle,
  summary,
  onChange,
  onStart,
  onReset,
  onComplete,
  onReopen,
  onDownload,
  isDownloading,
}: {
  cycle: ProductionCycle;
  summary: HarvestSummary;
  onChange: (cycle: ProductionCycle) => void;
  onStart: (input: StartCycleInput) => void;
  onReset: () => void;
  onComplete: (input: CompleteCycleInput) => void;
  onReopen: (reason: string) => void;
  onDownload: () => void;
  isDownloading: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [draftCycle, setDraftCycle] = useState(cycle);
  const [startDraft, setStartDraft] = useState<StartCycleInput>(() => ({
    id: "",
    houseName: cycle.houseName,
    startDate: cycle.startDate,
    targetHarvestDay: 37,
    initialBirds: cycle.initialBirds,
    initialAverageWeightKg: cycle.initialAverageWeightKg,
    notes: "",
  }));
  const [completionDraft, setCompletionDraft] =
    useState<CompleteCycleInput>(() => ({
      harvestDate: cycle.actualHarvestDate ?? cycle.startDate,
      harvestedBirds: summary.survivingBirds,
      notes: "",
    }));
  const [reopenReason, setReopenReason] = useState("");
  const isDraft = cycle.status === "draft";
  const isActive = cycle.status === "active";
  const isCompleted = cycle.status === "completed";
  const harvestReady = summary.cycleDay >= cycle.targetHarvestDay;
  const cycleProgressPercent = Math.min(
    100,
    (summary.cycleDay / Math.max(1, cycle.targetHarvestDay)) * 100
  );
  const daysToIdeal = cycle.targetHarvestDay - summary.cycleDay;
  const cycleProgressMessage =
    daysToIdeal > 0
      ? `${daysToIdeal} day${daysToIdeal === 1 ? "" : "s"} remaining until the ideal cycle day.`
      : daysToIdeal === 0
        ? `The ideal ${cycle.targetHarvestDay}-day harvest window has been reached.`
        : `${Math.abs(daysToIdeal)} day${Math.abs(daysToIdeal) === 1 ? "" : "s"} beyond the configured ideal cycle.`;

  const updateDraft = <K extends keyof ProductionCycle>(
    key: K,
    value: ProductionCycle[K]
  ) => setDraftCycle((current) => ({ ...current, [key]: value }));

  const startEditing = () => {
    setDraftCycle(cycle);
    setIsStarting(false);
    setIsCompleting(false);
    setIsReopening(false);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraftCycle(cycle);
    setIsEditing(false);
  };

  const saveCycle = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onChange({
      ...draftCycle,
      targetHarvestDay: Math.max(1, draftCycle.targetHarvestDay),
      initialBirds: Math.max(0, draftCycle.initialBirds),
      initialAverageWeightKg: Math.max(0, draftCycle.initialAverageWeightKg),
      harvestedBirds: Math.max(0, draftCycle.harvestedBirds),
    });
    setIsEditing(false);
  };

  const openStartCycle = () => {
    const today = todayDate();
    setStartDraft({
      id: `CYCLE-${cycle.zone}-${today.replaceAll("-", "")}`,
      houseName: cycle.houseName,
      startDate: today,
      targetHarvestDay: 37,
      initialBirds: cycle.initialBirds,
      initialAverageWeightKg: cycle.initialAverageWeightKg,
      notes: "",
    });
    setIsEditing(false);
    setIsCompleting(false);
    setIsReopening(false);
    setIsStarting(true);
  };

  const openCompletion = () => {
    setCompletionDraft({
      harvestDate: todayDate(),
      harvestedBirds: summary.survivingBirds,
      notes: "",
    });
    setIsEditing(false);
    setIsStarting(false);
    setIsReopening(false);
    setIsCompleting(true);
  };

  const submitStart = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStart(startDraft);
    setIsStarting(false);
  };

  const submitCompletion = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onComplete(completionDraft);
    setIsCompleting(false);
  };

  const submitReopen = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reopenReason.trim()) return;
    onReopen(reopenReason);
    setReopenReason("");
    setIsReopening(false);
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold">
              Production Cycle Management · Zone {cycle.zone}
            </h2>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs ${
                isDraft
                  ? "border-slate-200 bg-slate-100 text-slate-700"
                  : isCompleted
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              {isDraft
                ? "Not started"
                : isCompleted
                ? "Completed · Historical snapshot created"
                : harvestReady
                  ? `Active · Day ${summary.cycleDay} · Ready for review`
                  : `Active · Day ${summary.cycleDay} of ${cycle.targetHarvestDay}`}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Start, maintain, complete, and audit one production cycle without
            mixing its records with another flock.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {isDraft && !isStarting && (
            <button
              type="button"
              onClick={openStartCycle}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              + Start Cycle
            </button>
          )}
          {isActive &&
            !isEditing &&
            !isStarting &&
            !isCompleting && (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              ✏️ Edit Cycle Data
            </button>
          )}
          {isActive && !isCompleting && !isStarting && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-100"
            >
              ↺ Reset Cycle
            </button>
          )}
          {isActive && !isCompleting && !isStarting && (
            <button
              type="button"
              onClick={openCompletion}
              className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700"
            >
              ✓ Complete Cycle
            </button>
          )}
          {isCompleted && !isStarting && !isReopening && (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setIsCompleting(false);
                  setIsStarting(false);
                  setIsReopening(true);
                }}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 font-semibold text-amber-800 hover:bg-amber-100"
              >
                ↻ Reopen Cycle
              </button>
              <button
                type="button"
                onClick={openStartCycle}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
              >
                + Start New Cycle
              </button>
            </>
          )}
          {isActive && (
            <button
              type="button"
              onClick={onDownload}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:bg-gray-400"
            >
              {isDownloading
                ? "Generating current report…"
                : "📄 Download Current Cycle Report"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {[
          ["Cycle ID", isDraft ? "Not assigned" : cycle.id],
          ["House / zone", `${cycle.houseName} · Zone ${cycle.zone}`],
          ["Start date", isDraft ? "Not started" : cycle.startDate],
          ["Ideal cycle length", `${cycle.targetHarvestDay} days`],
          ["Lifecycle status", cycle.status.toUpperCase()],
          ["Revision", isDraft ? "—" : `#${cycle.revision}`],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {label}
            </div>
            <div className="mt-1 font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {isDraft ? (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cycle status
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-950">
            No production cycle has started
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Environmental sensors remain available for Zone {cycle.zone}. Start
            a cycle after flock placement, start date, and initial bird count
            have been confirmed.
          </p>
        </div>
      ) : (
        <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Current cycle progress
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-950">
                Day {summary.cycleDay} of the ideal {cycle.targetHarvestDay}-day
                cycle
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {cycleProgressMessage}
              </p>
            </div>
            <div className="text-sm font-semibold text-blue-700">
              {Math.round(cycleProgressPercent)}%
            </div>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-blue-100"
            role="progressbar"
            aria-label="Current cycle progress"
            aria-valuemin={0}
            aria-valuemax={cycle.targetHarvestDay}
            aria-valuenow={Math.min(summary.cycleDay, cycle.targetHarvestDay)}
          >
            <div
              className={`h-full rounded-full transition-all ${
                harvestReady ? "bg-emerald-500" : "bg-blue-600"
              }`}
              style={{ width: `${cycleProgressPercent}%` }}
            />
          </div>
        </div>
      )}

      {isStarting && (
        <form
          onSubmit={submitStart}
          className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-4"
        >
          <div className="mb-4">
            <h3 className="font-semibold text-slate-950">Start new cycle</h3>
            <p className="mt-1 text-xs text-slate-600">
              The completed cycle stays in History. New production records will
              be scoped to this new Cycle ID.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm">
              <span className="font-medium text-gray-700">Cycle ID</span>
              <input
                required
                value={startDraft.id}
                onChange={(event) =>
                  setStartDraft((current) => ({
                    ...current,
                    id: event.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">House name</span>
              <input
                required
                value={startDraft.houseName}
                onChange={(event) =>
                  setStartDraft((current) => ({
                    ...current,
                    houseName: event.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">Start date</span>
              <input
                required
                type="date"
                value={startDraft.startDate}
                onChange={(event) =>
                  setStartDraft((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">Ideal days</span>
              <input
                required
                type="number"
                min={1}
                value={startDraft.targetHarvestDay}
                onChange={(event) =>
                  setStartDraft((current) => ({
                    ...current,
                    targetHarvestDay: Number(event.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">Birds placed</span>
              <input
                required
                type="number"
                min={1}
                value={startDraft.initialBirds}
                onChange={(event) =>
                  setStartDraft((current) => ({
                    ...current,
                    initialBirds: Number(event.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">
                Initial avg weight (kg)
              </span>
              <input
                required
                type="number"
                min={0}
                step="0.001"
                value={startDraft.initialAverageWeightKg}
                onChange={(event) =>
                  setStartDraft((current) => ({
                    ...current,
                    initialAverageWeightKg: Number(event.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm md:col-span-2 xl:col-span-3">
              <span className="font-medium text-gray-700">Opening notes</span>
              <textarea
                rows={2}
                value={startDraft.notes}
                onChange={(event) =>
                  setStartDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-blue-100 pt-4">
            <button
              type="button"
              onClick={() => setIsStarting(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Start Cycle
            </button>
          </div>
        </form>
      )}

      {isCompleting && (
        <form
          onSubmit={submitCompletion}
          className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
        >
          <h3 className="font-semibold text-slate-950">
            Complete and lock this cycle
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Review the harvest outcome. Confirmation creates a fixed snapshot
            in Historical Data and locks production entry.
          </p>
          <div className="my-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Mortality", `${summary.totalMortality} (${summary.mortalityRate.toFixed(2)}%)`],
              ["Final weight", `${summary.finalAverageWeightKg.toFixed(3)} kg`],
              ["Feed / bird", `${summary.totalFeedPerBirdKg.toFixed(3)} kg`],
              ["Water / bird", `${summary.totalWaterPerBirdL.toFixed(3)} L`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-emerald-100 bg-white p-3">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="mt-1 font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="font-medium text-gray-700">Harvest date</span>
              <input
                required
                type="date"
                min={cycle.startDate}
                value={completionDraft.harvestDate}
                onChange={(event) =>
                  setCompletionDraft((current) => ({
                    ...current,
                    harvestDate: event.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">
                Confirmed harvested birds
              </span>
              <input
                required
                type="number"
                min={0}
                max={cycle.initialBirds}
                value={completionDraft.harvestedBirds}
                onChange={(event) =>
                  setCompletionDraft((current) => ({
                    ...current,
                    harvestedBirds: Number(event.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="font-medium text-gray-700">
                Completion notes
              </span>
              <textarea
                required
                rows={3}
                value={completionDraft.notes}
                onChange={(event) =>
                  setCompletionDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Harvest verification, issues, or sign-off notes"
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-emerald-100 pt-4">
            <button
              type="button"
              onClick={() => setIsCompleting(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
            >
              Confirm Completion
            </button>
          </div>
        </form>
      )}

      {isReopening && (
        <form
          onSubmit={submitReopen}
          className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <h3 className="font-semibold text-amber-950">Reopen completed cycle</h3>
          <p className="mt-1 text-xs text-amber-800">
            The current historical snapshot will be removed until the cycle is
            completed again. The reason is stored in its audit trail.
          </p>
          <textarea
            required
            rows={2}
            value={reopenReason}
            onChange={(event) => setReopenReason(event.target.value)}
            placeholder="Reason for reopening"
            className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsReopening(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700"
            >
              Reopen for Correction
            </button>
          </div>
        </form>
      )}

      {isEditing && (
        <form
          onSubmit={saveCycle}
          className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-4"
        >
          <div className="mb-4">
            <h3 className="font-semibold text-gray-900">Edit cycle data</h3>
            <p className="mt-1 text-xs text-gray-500">
              Review the values first. Changes are applied only after you save.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm">
              <span className="font-medium text-gray-700">Cycle ID</span>
              <input
                disabled
                value={draftCycle.id}
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-gray-500"
              />
              <span className="mt-1 block text-[11px] text-gray-500">
                Locked after the cycle starts.
              </span>
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">House name</span>
              <input
                required
                value={draftCycle.houseName}
                onChange={(event) =>
                  updateDraft("houseName", event.target.value)
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">Start date</span>
              <input
                required
                type="date"
                value={draftCycle.startDate}
                onChange={(event) =>
                  updateDraft("startDate", event.target.value)
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">
                Ideal cycle length (days)
              </span>
              <input
                required
                type="number"
                min={1}
                value={draftCycle.targetHarvestDay}
                onChange={(event) =>
                  updateDraft("targetHarvestDay", Number(event.target.value))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">Birds placed</span>
              <input
                required
                type="number"
                min={0}
                value={draftCycle.initialBirds}
                onChange={(event) =>
                  updateDraft("initialBirds", Number(event.target.value))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">
                Initial avg weight (kg)
              </span>
              <input
                required
                type="number"
                min={0}
                step="0.001"
                value={draftCycle.initialAverageWeightKg}
                onChange={(event) =>
                  updateDraft(
                    "initialAverageWeightKg",
                    Number(event.target.value)
                  )
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium text-gray-700">
                Confirmed harvested birds
              </span>
              <input
                type="number"
                min={0}
                value={draftCycle.harvestedBirds}
                onChange={(event) =>
                  updateDraft("harvestedBirds", Number(event.target.value))
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <span className="mt-1 block text-[11px] text-gray-500">
                Leave as 0 to derive it from mortality.
              </span>
            </label>
            <label className="text-sm md:col-span-2 xl:col-span-1">
              <span className="font-medium text-gray-700">Cycle notes</span>
              <textarea
                rows={3}
                value={draftCycle.notes}
                onChange={(event) => updateDraft("notes", event.target.value)}
                className="mt-1.5 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 border-t border-blue-100 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancelEditing}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        </form>
      )}

      {!isDraft && (
        <>
      <details className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          Audit trail · {cycle.auditLog.length} lifecycle event
          {cycle.auditLog.length === 1 ? "" : "s"}
        </summary>
        <div className="mt-3 space-y-2">
          {[...cycle.auditLog].reverse().map((event) => (
            <div
              key={event.id}
              className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <div className="font-semibold capitalize text-slate-800">
                  {event.type}
                </div>
                {event.reason && (
                  <div className="mt-0.5 text-slate-600">{event.reason}</div>
                )}
              </div>
              <time className="whitespace-nowrap text-slate-500">
                {event.timestamp.replace("T", " ").slice(0, 16)}
              </time>
            </div>
          ))}
        </div>
      </details>

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        {[
          ["Birds placed", integer.format(cycle.initialBirds)],
          [
            "Mortality",
            `${integer.format(summary.totalMortality)} (${summary.mortalityRate.toFixed(2)}%)`,
          ],
          ["Birds remaining", integer.format(summary.survivingBirds)],
          [
            "Final avg weight",
            `${summary.finalAverageWeightKg.toFixed(3)} kg`,
          ],
          [
            "Estimated live weight",
            `${integer.format(summary.totalLiveWeightKg)} kg`,
          ],
          ["FCR estimate", summary.fcr.toFixed(2)],
          ["Feed / bird", `${summary.totalFeedPerBirdKg.toFixed(2)} kg`],
          ["Water / bird", `${summary.totalWaterPerBirdL.toFixed(2)} L`],
          ["Water : feed", `${summary.waterFeedRatio.toFixed(2)} : 1`],
          [
            "Average daily gain",
            `${summary.averageDailyGainGram.toFixed(1)} g/day`,
          ],
          ["Alert events", integer.format(summary.alertCount)],
          [
            "Sensor completeness",
            `${summary.sensorHealth.completeness.toFixed(1)}%`,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-gray-50 p-3"
          >
            <div className="text-xs text-gray-500">{label}</div>
            <div className="mt-1 font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div
        className={`mt-4 rounded-xl border p-3 text-sm ${
          summary.sensorHealth.status === "Healthy"
            ? "border-green-200 bg-green-50 text-green-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <strong>Sensor health: {summary.sensorHealth.status}.</strong>{" "}
        {summary.sensorHealth.receivedRecords} of{" "}
        {summary.sensorHealth.expectedRecords} expected records received;
        largest sampling gap {summary.sensorHealth.largestGapHours.toFixed(1)}
        hours.
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Growth and feed reference: Ross 308 AP as-hatched performance
        objectives (2022). Water is estimated at 2.2× feed. Confirm the farm
        breed, target, and water ratio before using the reference for
        operational decisions.
      </p>
        </>
      )}
    </section>
  );
}
