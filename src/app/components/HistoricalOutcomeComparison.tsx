import type { HistoricalOutcomeRow } from "../lib/outcomeAnalysis";

export default function HistoricalOutcomeComparison({
  rows,
  replayBatch,
}: {
  rows: HistoricalOutcomeRow[];
  replayBatch?: number;
}) {
  if (rows.length === 0) return null;

  const bestMortality = rows.reduce((best, row) =>
    row.mortalityRate < best.mortalityRate ? row : best
  );
  const bestFcr = rows.reduce((best, row) => (row.fcr < best.fcr ? row : best));
  const bestWeight = rows.reduce((best, row) =>
    row.averageWeightKg > best.averageWeightKg ? row : best
  );
  const bestEfficiency = rows.reduce((best, row) =>
    row.efficiencyIndex > best.efficiencyIndex ? row : best
  );

  return (
    <section className="order-2 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Outcome comparison
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">
          Farmer Outcome Across Batches
        </h2>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
          Production results are compared in chronological order. The pattern is mixed rather than uniformly improving: Batch {bestMortality.batch} records the lowest mortality, while Batch {bestWeight.batch} records the highest average weight and Batch {bestEfficiency.batch} the highest efficiency index.
        </p>
      </div>

      <div className="overflow-x-auto p-5">
        <table className="min-w-[940px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              {[
                "Cycle",
                "Mortality",
                "FCR",
                "Avg weight",
                "Efficiency index",
                "Profit / bird",
                "Farmer reading",
              ].map((label) => (
                <th key={label} className="border-b border-slate-200 px-3 py-3 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.batch} className="align-top text-slate-700">
                <td className="border-b border-slate-100 px-3 py-4">
                  <div className="font-semibold text-slate-950">Batch {row.batch}</div>
                  {row.batch === replayBatch && (
                    <span className="mt-1 inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                      Current replay
                    </span>
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-4">
                  {row.mortalityRate.toFixed(2)}%
                  {row.batch === bestMortality.batch && (
                    <div className="mt-1 text-[11px] font-medium text-emerald-700">Lowest displayed</div>
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-4">
                  {row.fcr.toFixed(2)}
                  {row.batch === bestFcr.batch && (
                    <div className="mt-1 text-[11px] font-medium text-emerald-700">Lowest displayed</div>
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-4">
                  {row.averageWeightKg.toFixed(2)} kg
                  {row.batch === bestWeight.batch && (
                    <div className="mt-1 text-[11px] font-medium text-blue-700">Highest displayed</div>
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-4">
                  {row.efficiencyIndex.toFixed(2)}
                  {row.batch === bestEfficiency.batch && (
                    <div className="mt-1 text-[11px] font-medium text-blue-700">Highest displayed</div>
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-4">
                  RM {row.profitRmPerBird.toFixed(2)}
                </td>
                <td className="max-w-sm border-b border-slate-100 px-3 py-4 leading-6">
                  {row.interpretation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600">
        Batch {bestFcr.batch} has the lowest displayed FCR. A favourable result in one indicator does not mean every production or financial outcome improved in the same batch.
      </div>
    </section>
  );
}
