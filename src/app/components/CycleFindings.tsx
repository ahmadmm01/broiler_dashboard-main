"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  FINDING_STATUSES,
  sanitizeFindingInterpretations,
  type CycleFinding,
  type CycleFindingsSnapshot,
  type CycleFindingsStore,
  type FindingStatus,
  type SavedFindingFollowUp,
} from "../lib/cycleFindings";

export default function CycleFindings({
  snapshot,
  previousCycle,
  store,
  setStore,
  onShowEvidence,
  onGenerateStart,
}: {
  snapshot: CycleFindingsSnapshot;
  previousCycle?: { id: string; label: string };
  store: CycleFindingsStore;
  setStore: Dispatch<SetStateAction<CycleFindingsStore>>;
  onShowEvidence?: (timestamp: number) => void;
  onGenerateStart?: () => void;
}) {
  const [selectedReview, setSelectedReview] = useState("current");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(false);
  const cycleStore = store[snapshot.cycleId];
  const savedInsights = cycleStore?.insights ?? [];
  const selectedInsight = selectedReview === "current"
    ? savedInsights.find((insight) => insight.signature === snapshot.signature)
    : savedInsights.find((insight) => insight.signature === selectedReview);
  const shownSnapshot = selectedReview !== "current" && selectedInsight
    ? selectedInsight.snapshot
    : snapshot;
  const shownFindings = shownSnapshot.findings.map((finding) => {
    const interpretation = selectedInsight?.interpretations.find((item) => item.id === finding.id);
    return interpretation ? { ...finding, ...interpretation } : finding;
  });
  const previousFollowUps = previousCycle
    ? Object.values(store[previousCycle.id]?.followUps ?? {}).filter(
        (entry) => entry.status !== "unreviewed" || entry.note.trim()
      )
    : [];

  const saveFollowUp = (finding: CycleFinding, changes: Partial<Pick<SavedFindingFollowUp, "status" | "note">>) => {
    setStore((current) => {
      const cycle = current[snapshot.cycleId] ?? { followUps: {}, insights: [] };
      const previous = cycle.followUps[finding.id];
      return {
        ...current,
        [snapshot.cycleId]: {
          ...cycle,
          followUps: {
            ...cycle.followUps,
            [finding.id]: {
              status: previous?.status ?? "unreviewed",
              note: previous?.note ?? "",
              ...changes,
              updatedAt: new Date().toISOString(),
              finding,
            },
          },
        },
      };
    });
  };

  const generateFindings = async () => {
    onGenerateStart?.();
    setIsGenerating(true);
    setError(false);
    // The closure keeps both the evidence and result tied to this request's snapshot.
    const requestedSnapshot = snapshot;
    try {
      const response = await fetch("/api/cycle-findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: requestedSnapshot }),
      });
      const json = await response.json();
      const interpretations = sanitizeFindingInterpretations(
        json.interpretations,
        requestedSnapshot.findings.map((finding) => finding.id)
      );
      if (!response.ok || !interpretations) throw new Error("Findings unavailable");
      setStore((current) => {
        const cycle = current[requestedSnapshot.cycleId] ?? { followUps: {}, insights: [] };
        return {
          ...current,
          [requestedSnapshot.cycleId]: {
            ...cycle,
            insights: [{
              signature: requestedSnapshot.signature,
              currentDay: requestedSnapshot.currentDay,
              selectedTime: requestedSnapshot.selectedTime,
              generatedAt: new Date().toISOString(),
              interpretations,
              snapshot: requestedSnapshot,
            }, ...cycle.insights.filter((entry) => entry.signature !== requestedSnapshot.signature)].slice(0, 10),
          },
        };
      });
      setSelectedReview("current");
    } catch {
      setError(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const completedActions = shownFindings.filter((finding) => cycleStore?.followUps[finding.id]?.status === "done").length;

  return (
    <section className="order-2 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm" aria-label="Cycle findings and next-cycle actions">
      <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Lessons for the next flock</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Cycle Findings & Next-Cycle Actions</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {shownSnapshot.cycleLabel} · {shownSnapshot.isFinal ? "Completed cycle review" : `Findings to Day ${shownSnapshot.currentDay}`}. Review the evidence and carry practical checks into the next cycle.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <button type="button" onClick={generateFindings} disabled={isGenerating || snapshot.findings.length === 0 || selectedReview !== "current"}
              className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300">
              {isGenerating ? "Generating Findings…" : selectedInsight ? "Refresh AI Findings" : "Generate AI Findings"}
            </button>
            <span className="text-xs text-slate-500">AI runs only when requested</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-blue-200 bg-white px-3 py-1 font-semibold text-blue-700">{shownFindings.length} findings</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">{completedActions} actions marked completed</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">{selectedInsight ? "Saved AI interpretation" : "Recorded-data findings"}</span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {previousCycle && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <h3 className="font-semibold text-slate-950">Follow-up from {previousCycle.label}</h3>
            {previousFollowUps.length > 0 ? (
              <div className="mt-3 space-y-3">
                {previousFollowUps.map((entry) => (
                  <div key={entry.finding.id} className="rounded-lg border border-indigo-100 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{entry.finding.title}</span>
                      <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{FINDING_STATUSES.find((item) => item.value === entry.status)?.label}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{entry.finding.action}</p>
                    {entry.note && <p className="mt-1 text-xs leading-5 text-slate-500">Farmer note: {entry.note}</p>}
                  </div>
                ))}
                <p className="text-xs leading-5 text-slate-500">Compare these recorded actions with this cycle&apos;s findings. A completed action alone does not establish why outcomes changed.</p>
              </div>
            ) : (
              <p className="mt-1 text-sm leading-6 text-slate-600">No follow-up has been saved for this previous cycle yet. Mark actions and add notes in its cycle findings to carry them into this review.</p>
            )}
          </div>
        )}

        {savedInsights.length > 0 && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
            <label className="block text-sm font-semibold text-slate-900" htmlFor={`saved-findings-${snapshot.cycleId}`}>Saved findings for presentation</label>
            <select id={`saved-findings-${snapshot.cycleId}`} value={selectedReview} onChange={(event) => { setSelectedReview(event.target.value); setError(false); }}
              className="mt-2 w-full min-w-0 rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-800">
              <option value="current">Current {snapshot.isFinal ? "completed cycle" : `replay position · Day ${snapshot.currentDay}`}</option>
              {savedInsights.map((insight) => <option key={insight.signature} value={insight.signature}>Saved review · Day {insight.currentDay} · {insight.selectedTime ?? insight.generatedAt.slice(0, 10)}</option>)}
            </select>
            {selectedInsight && <p className="mt-2 text-xs leading-5 text-violet-700">Saved on {new Date(selectedInsight.generatedAt).toLocaleString()} · evidence through {selectedInsight.selectedTime ?? `Day ${selectedInsight.currentDay}`}.</p>}
          </div>
        )}

        {isGenerating && <div role="status" className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-700">Reviewing the selected cycle evidence and preparing next-cycle checkpoints…</div>}
        {error && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">AI findings could not be generated. The recorded-data findings and saved reviews remain available.</div>}

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {shownFindings.map((finding, index) => {
            const followUp = cycleStore?.followUps[finding.id];
            return (
              <article key={finding.id} className="h-fit overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-blue-700">Finding {index + 1} · {finding.category}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-medium ${finding.priority === "Review" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{finding.priority}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold leading-6 text-slate-950">{finding.title}</h3>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{finding.period}</div>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{finding.evidence}</p>
                    {onShowEvidence && finding.timestamp !== undefined && <button type="button" onClick={() => onShowEvidence(finding.timestamp!)} className="mt-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">View period in replay</button>}
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">What it means</div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{finding.meaning}</p>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next-cycle action</div>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-900">{finding.action}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600"><span className="font-semibold">When: </span>{finding.timeframe}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600"><span className="font-semibold">Checkpoint: </span>{finding.checkpoint}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600" htmlFor={`finding-status-${snapshot.cycleId}-${finding.id}`}>Follow-up status</label>
                    <select id={`finding-status-${snapshot.cycleId}-${finding.id}`} value={followUp?.status ?? "unreviewed"} onChange={(event) => saveFollowUp(finding, { status: event.target.value as FindingStatus })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                      {FINDING_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                    <label className="mt-3 block text-xs font-semibold text-slate-600" htmlFor={`finding-note-${snapshot.cycleId}-${finding.id}`}>Farmer note</label>
                    <textarea id={`finding-note-${snapshot.cycleId}-${finding.id}`} rows={2} maxLength={800} value={followUp?.note ?? ""} onChange={(event) => saveFollowUp(finding, { note: event.target.value })} placeholder="Record the check, planned work, or completed action…"
                      className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-5 text-slate-800" />
                    {followUp && <p className="mt-1 text-[11px] leading-4 text-slate-500">Follow-up saved · {new Date(followUp.updatedAt).toLocaleString()}</p>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {shownFindings.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Findings will appear when production or environmental records become available.</p>}
        <p className="text-xs leading-5 text-slate-500">Follow-up notes and generated reviews are saved in this browser. Keep the same browser for presentation; another device or the deployed website has its own saved records.</p>
      </div>
    </section>
  );
}
