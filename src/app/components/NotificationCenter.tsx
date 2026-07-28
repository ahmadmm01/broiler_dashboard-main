"use client";

import { useState } from "react";
import type { AlertEvent } from "../lib/types";

export default function NotificationCenter({
  alerts,
  soundEnabled,
  onToggleSound,
  onAcknowledge,
  cycleAlertEpisodeCount,
}: {
  alerts: AlertEvent[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onAcknowledge: (id: string) => void;
  cycleAlertEpisodeCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = alerts.filter((alert) => alert.status === "active").length;
  const recentAlerts = alerts.slice(0, 8);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 font-semibold md:w-auto ${
          activeCount > 0
            ? "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
        }`}
        aria-expanded={isOpen}
        aria-controls="notification-center-panel"
        aria-label={`${activeCount} active sensor alert${activeCount === 1 ? "" : "s"}. ${cycleAlertEpisodeCount} threshold alert episode${cycleAlertEpisodeCount === 1 ? "" : "s"} recorded during the selected cycle scope.`}
      >
        <span aria-hidden>🔔</span>
        Active alerts
        <span
          className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs text-white ${
            activeCount > 0 ? "bg-red-600" : "bg-emerald-600"
          }`}
        >
          {activeCount}
        </span>
      </button>

      {isOpen && (
        <div
          id="notification-center-panel"
          className="absolute right-0 z-[70] mt-2 w-[min(92vw,430px)] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-semibold">Notification Center</h3>
              <p className="text-xs text-gray-500">
                {activeCount} active now · {cycleAlertEpisodeCount} threshold{" "}
                {cycleAlertEpisodeCount === 1 ? "episode" : "episodes"} in the
                selected cycle scope
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleSound}
              className="text-xs border rounded-lg px-2 py-1"
            >
              Sound {soundEnabled ? "On" : "Off"}
            </button>
          </div>

          <div className="max-h-80 overflow-auto space-y-2">
            {recentAlerts.length === 0 ? (
              <div className="p-4 rounded-xl bg-green-50 text-green-800 text-sm">
                {cycleAlertEpisodeCount > 0
                  ? `No active or persisted notifications are in this timeline. Cycle analysis detected ${cycleAlertEpisodeCount} threshold episodes from the stored sensor history.`
                  : "No active alerts or cycle threshold episodes have been recorded."}
              </div>
            ) : (
              recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl border ${
                    alert.status === "resolved"
                      ? "bg-gray-50 border-gray-200"
                      : alert.severity === "critical"
                        ? "bg-red-50 border-red-200"
                        : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">
                        Zone {alert.zone} · {alert.label} · {alert.severity}
                      </div>
                      <div className="text-xs text-gray-600">
                        {alert.value.toFixed(2)} {alert.unit} · limit {alert.threshold} {alert.unit}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        {alert.timestamp} · {alert.status}
                      </div>
                    </div>
                    {alert.status === "active" && (
                      <button
                        type="button"
                        onClick={() => onAcknowledge(alert.id)}
                        className="self-start text-xs bg-white border rounded-md px-2 py-1"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
