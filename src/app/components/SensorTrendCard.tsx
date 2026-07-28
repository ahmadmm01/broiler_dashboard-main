"use client";

import type { ReactNode } from "react";

export type SensorTrendSummary = {
  id: string;
  label: string;
  color: string;
  latest: number;
  average: number;
  minimum: number;
  maximum: number;
  exceedances: number;
};

export default function SensorTrendCard({
  title,
  unit,
  valueDigits = 2,
  summaries,
  emphasized = false,
  children,
}: {
  title: string;
  unit: string;
  valueDigits?: number;
  summaries: SensorTrendSummary[];
  emphasized?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-4 ${
        emphasized ? "lg:col-span-2 2xl:col-span-2" : ""
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-950">
          {title} ({unit})
        </h3>
      </div>

      <div
        className={`mb-4 grid gap-2 ${
          summaries.length > 1 ? "sm:grid-cols-3" : "grid-cols-1"
        }`}
      >
        {summaries.map((summary) => (
          <div
            key={summary.id}
            className="rounded-xl border border-slate-200 bg-white p-3"
            style={{
              borderLeftColor: summary.color,
              borderLeftWidth: 4,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">
                {summary.label}
              </span>
              <span className="font-semibold text-slate-950">
                {summary.latest.toFixed(valueDigits)} {unit}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Avg {summary.average.toFixed(2)} · Range{" "}
              {summary.minimum.toFixed(2)}–{summary.maximum.toFixed(2)}
            </div>
            <div
              className={`mt-1 text-[11px] ${
                summary.exceedances
                  ? "font-semibold text-amber-700"
                  : "text-emerald-700"
              }`}
            >
              {summary.exceedances
                ? `${summary.exceedances} readings above limit`
                : "No reading above limit"}
            </div>
          </div>
        ))}
      </div>

      {children}
    </article>
  );
}
