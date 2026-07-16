"use client";

import { standardBroilerWeight } from "../lib/broilerStandard";
import {
  addDays,
  compareDateStrings,
  dateToDayNumber,
  formatDate,
  parseDateOnly,
} from "../lib/dateUtils";
import type {
  ConsumptionEntry,
  MortalityEntry,
  WeightEntry,
  Zone,
} from "../lib/types";
import { useEffect, useMemo, useState } from "react";

export type DailyProductionLogInput = {
  date: string;
  mortalityCount?: number;
  mortalityNotes?: string;
  feedKg?: number;
  waterL?: number;
  averageWeightKg?: number;
};

type DailyProductionLogProps = {
  cycleId: string;
  startDate: string;
  targetHarvestDay: number;
  initialBirds: number;
  zone: Zone;
  mortalityEntries: MortalityEntry[];
  consumptionEntries: ConsumptionEntry[];
  weightEntries: WeightEntry[];
  onSave: (input: DailyProductionLogInput) => void;
};

type FormMessage = {
  tone: "error" | "success";
  text: string;
};

function optionalNumber(value: string) {
  if (value.trim() === "") return undefined;
  return Number(value);
}

export default function DailyProductionLog({
  cycleId,
  startDate,
  targetHarvestDay,
  initialBirds,
  zone,
  mortalityEntries,
  consumptionEntries,
  weightEntries,
  onSave,
}: DailyProductionLogProps) {
  const today = useMemo(() => formatDate(new Date()), []);
  const defaultDate = today < startDate ? startDate : today;
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [mortalityCount, setMortalityCount] = useState("");
  const [mortalityNotes, setMortalityNotes] = useState("");
  const [feedKg, setFeedKg] = useState("");
  const [waterL, setWaterL] = useState("");
  const [averageWeightKg, setAverageWeightKg] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);

  useEffect(() => {
    setEntryDate(defaultDate);
    setMessage(null);
  }, [cycleId, defaultDate]);

  const selectedDay = dateToDayNumber(entryDate, startDate);
  const selectedMortality = useMemo(
    () => mortalityEntries.filter((entry) => entry.date === entryDate),
    [entryDate, mortalityEntries]
  );
  const selectedConsumption = useMemo(
    () => consumptionEntries.find((entry) => entry.date === entryDate),
    [consumptionEntries, entryDate]
  );
  const selectedWeight = useMemo(
    () => weightEntries.find((entry) => entry.day === selectedDay),
    [selectedDay, weightEntries]
  );

  useEffect(() => {
    setMortalityCount(
      selectedMortality.length > 0
        ? String(
            selectedMortality.reduce((total, entry) => total + entry.count, 0)
          )
        : ""
    );
    setMortalityNotes(
      selectedMortality
        .map((entry) => entry.notes?.trim())
        .filter((notes): notes is string => Boolean(notes))
        .join("; ")
    );
    setFeedKg(
      selectedConsumption ? String(selectedConsumption.feedKg) : ""
    );
    setWaterL(
      selectedConsumption ? String(selectedConsumption.waterL) : ""
    );
    setAverageWeightKg(
      selectedWeight ? String(selectedWeight.actualWeightKg) : ""
    );
    setIsDirty(false);
  }, [selectedConsumption, selectedMortality, selectedWeight]);

  const existingGroupCount =
    Number(selectedMortality.length > 0) +
    Number(Boolean(selectedConsumption)) +
    Number(Boolean(selectedWeight));
  const standardWeight = standardBroilerWeight(selectedDay);

  const recentRows = useMemo(() => {
    const dates = new Set<string>();
    mortalityEntries.forEach((entry) => dates.add(entry.date));
    consumptionEntries.forEach((entry) => dates.add(entry.date));
    weightEntries.forEach((entry) =>
      dates.add(
        formatDate(addDays(parseDateOnly(startDate), entry.day - 1))
      )
    );

    return Array.from(dates)
      .map((date) => {
        const mortalityForDate = mortalityEntries.filter(
          (entry) => entry.date === date
        );
        const consumptionForDate = consumptionEntries.find(
          (entry) => entry.date === date
        );
        const day = dateToDayNumber(date, startDate);
        const weightForDate = weightEntries.find((entry) => entry.day === day);
        const groups =
          Number(mortalityForDate.length > 0) +
          Number(Boolean(consumptionForDate)) +
          Number(Boolean(weightForDate));

        return {
          date,
          day,
          mortality:
            mortalityForDate.length > 0
              ? mortalityForDate.reduce(
                  (total, entry) => total + entry.count,
                  0
                )
              : undefined,
          feedKg: consumptionForDate?.feedKg,
          waterL: consumptionForDate?.waterL,
          averageWeightKg: weightForDate?.actualWeightKg,
          groups,
        };
      })
      .sort((left, right) => compareDateStrings(right.date, left.date))
      .slice(0, 8);
  }, [consumptionEntries, mortalityEntries, startDate, weightEntries]);

  const markChanged = () => {
    setIsDirty(true);
    setMessage(null);
  };

  const handleDateChange = (date: string) => {
    setEntryDate(date);
    setMessage(null);
  };

  const handleSave = () => {
    const parsedMortality = optionalNumber(mortalityCount);
    const parsedFeed = optionalNumber(feedKg);
    const parsedWater = optionalNumber(waterL);
    const parsedWeight = optionalNumber(averageWeightKg);
    const hasMortalityNotes = mortalityNotes.trim().length > 0;

    if (
      parsedMortality === undefined &&
      parsedFeed === undefined &&
      parsedWater === undefined &&
      parsedWeight === undefined
    ) {
      setMessage({
        tone: "error",
        text: "Enter at least one production measurement before saving.",
      });
      return;
    }

    if (
      parsedMortality !== undefined &&
      (!Number.isInteger(parsedMortality) ||
        parsedMortality < 0 ||
        parsedMortality > initialBirds)
    ) {
      setMessage({
        tone: "error",
        text: `Mortality must be a whole number between 0 and ${initialBirds.toLocaleString()}.`,
      });
      return;
    }

    if (hasMortalityNotes && parsedMortality === undefined) {
      setMessage({
        tone: "error",
        text: "Enter the mortality count (use 0 when there was no mortality) to save its notes.",
      });
      return;
    }

    if ((parsedFeed === undefined) !== (parsedWater === undefined)) {
      setMessage({
        tone: "error",
        text: "Feed and water must be recorded together for the selected date.",
      });
      return;
    }

    if (
      (parsedFeed !== undefined &&
        (!Number.isFinite(parsedFeed) || parsedFeed < 0)) ||
      (parsedWater !== undefined &&
        (!Number.isFinite(parsedWater) || parsedWater < 0))
    ) {
      setMessage({
        tone: "error",
        text: "Feed and water values cannot be negative.",
      });
      return;
    }

    if (
      parsedWeight !== undefined &&
      (!Number.isFinite(parsedWeight) || parsedWeight <= 0)
    ) {
      setMessage({
        tone: "error",
        text: "Average body weight must be greater than 0 kg.",
      });
      return;
    }

    onSave({
      date: entryDate,
      mortalityCount: parsedMortality,
      mortalityNotes:
        parsedMortality === undefined ? undefined : mortalityNotes.trim(),
      feedKg: parsedFeed,
      waterL: parsedWater,
      averageWeightKg: parsedWeight,
    });
    setIsDirty(false);
    setMessage({
      tone: "success",
      text:
        existingGroupCount > 0
          ? `Day ${selectedDay} production log updated.`
          : `Day ${selectedDay} production log saved.`,
    });
  };

  return (
    <div
      data-testid="daily-production-log"
      className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 text-white sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">
              Production entry workspace
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Daily Production Log</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Record the day once, then save mortality, feed, water, and body
              weight together. Leave measurements that were not collected blank.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_auto] sm:items-end">
            <label className="text-sm font-medium text-slate-200">
              Record date
              <input
                aria-label="Daily production record date"
                type="date"
                min={startDate}
                max={today >= startDate ? today : undefined}
                value={entryDate}
                onChange={(event) => handleDateChange(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-white/20 bg-white px-3 py-2.5 text-slate-900 outline-none ring-blue-400 focus:ring-2"
              />
            </label>
            <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm backdrop-blur">
              <span className="block text-xs text-slate-300">Selected record</span>
              <span className="font-semibold">
                Zone {zone} · Day {selectedDay}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-blue-400/15 px-3 py-1.5 text-blue-100 ring-1 ring-inset ring-blue-300/20">
            {cycleId}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-slate-200 ring-1 ring-inset ring-white/15">
            Day {selectedDay} of ideal {targetHarvestDay}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-slate-200 ring-1 ring-inset ring-white/15">
            {existingGroupCount}/3 record groups already saved
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-rose-700">
                  01 · Flock
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">Mortality</h3>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-rose-100">
                Optional
              </span>
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              Birds lost on this date
              <input
                aria-label="Daily mortality count"
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 0"
                value={mortalityCount}
                onChange={(event) => {
                  setMortalityCount(event.target.value);
                  markChanged();
                }}
                className="mt-1.5 w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 outline-none ring-rose-300 focus:ring-2"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Observation notes
              <input
                aria-label="Daily mortality notes"
                placeholder="Optional cause or observation"
                value={mortalityNotes}
                onChange={(event) => {
                  setMortalityNotes(event.target.value);
                  markChanged();
                }}
                className="mt-1.5 w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 outline-none ring-rose-300 focus:ring-2"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  02 · Intake
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">
                  Feed &amp; Water
                </h3>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-amber-100">
                Record together
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Feed / bird
                <div className="relative mt-1.5">
                  <input
                    aria-label="Daily feed per bird in kilograms"
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="0.000"
                    value={feedKg}
                    onChange={(event) => {
                      setFeedKg(event.target.value);
                      markChanged();
                    }}
                    className="w-full rounded-xl border border-amber-200 bg-white py-2.5 pl-3 pr-9 outline-none ring-amber-300 focus:ring-2"
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-slate-400">
                    kg
                  </span>
                </div>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Water / bird
                <div className="relative mt-1.5">
                  <input
                    aria-label="Daily water per bird in liters"
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="0.000"
                    value={waterL}
                    onChange={(event) => {
                      setWaterL(event.target.value);
                      markChanged();
                    }}
                    className="w-full rounded-xl border border-amber-200 bg-white py-2.5 pl-3 pr-7 outline-none ring-amber-300 focus:ring-2"
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-slate-400">
                    L
                  </span>
                </div>
              </label>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Values are stored per living bird for consistent cycle comparison.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  03 · Growth
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">
                  Average Body Weight
                </h3>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-emerald-100">
                Sample average
              </span>
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              Measured average
              <div className="relative mt-1.5">
                <input
                  aria-label="Average body weight in kilograms"
                  type="number"
                  min={0.001}
                  step="0.001"
                  placeholder="0.000"
                  value={averageWeightKg}
                  onChange={(event) => {
                    setAverageWeightKg(event.target.value);
                    markChanged();
                  }}
                  className="w-full rounded-xl border border-emerald-200 bg-white py-2.5 pl-3 pr-10 outline-none ring-emerald-300 focus:ring-2"
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-slate-400">
                  kg
                </span>
              </div>
            </label>
            <div className="mt-3 rounded-xl border border-emerald-100 bg-white/80 px-3 py-2.5 text-xs text-slate-600">
              Day {selectedDay} reference: {standardWeight.toFixed(3)} kg
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">
              Blank measurement groups will remain unchanged.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Selecting a date with existing data automatically loads it for editing.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className="min-w-48 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {existingGroupCount > 0 ? "Update Daily Log" : "Save Daily Log"}
          </button>
        </div>

        {message && (
          <div
            role="status"
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mt-7 border-t border-slate-200 pt-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Recent Daily Logs</h3>
              <p className="mt-1 text-sm text-slate-500">
                Open a previous date to review or correct its stored values.
              </p>
            </div>
            <span className="text-xs text-slate-400">Latest 8 recorded dates</span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[780px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date / day</th>
                  <th className="px-4 py-3 font-semibold">Mortality</th>
                  <th className="px-4 py-3 font-semibold">Feed / bird</th>
                  <th className="px-4 py-3 font-semibold">Water / bird</th>
                  <th className="px-4 py-3 font-semibold">Avg weight</th>
                  <th className="px-4 py-3 font-semibold">Coverage</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      No production logs have been recorded for Zone {zone}.
                    </td>
                  </tr>
                ) : (
                  recentRows.map((row) => (
                    <tr
                      key={row.date}
                      className={
                        row.date === entryDate
                          ? "bg-blue-50/60"
                          : "bg-white hover:bg-slate-50"
                      }
                    >
                      <td className="px-4 py-3">
                        <span className="block font-medium text-slate-900">
                          {row.date}
                        </span>
                        <span className="text-xs text-slate-500">
                          Cycle day {row.day}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.mortality ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.feedKg === undefined
                          ? "—"
                          : `${row.feedKg.toFixed(3)} kg`}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.waterL === undefined
                          ? "—"
                          : `${row.waterL.toFixed(3)} L`}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.averageWeightKg === undefined
                          ? "—"
                          : `${row.averageWeightKg.toFixed(3)} kg`}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            row.groups === 3
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {row.groups}/3 groups
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDateChange(row.date)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
