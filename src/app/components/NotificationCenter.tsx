"use client";

import { useState } from "react";
import type { AlertEvent } from "../lib/types";

export default function NotificationCenter({
  alerts,
  soundEnabled,
  onToggleSound,
  onAcknowledge,
}: {
  alerts: AlertEvent[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onAcknowledge: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = alerts.filter((alert) => alert.status === "active").length;
  const recentAlerts = alerts.slice(0, 8);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full md:w-auto border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-950 px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2"
        aria-expanded={isOpen}
      >
        <span aria-hidden>🔔</span>
        Alerts
        <span className="min-w-6 h-6 px-1.5 rounded-full bg-red-600 text-white text-xs grid place-items-center">
          {activeCount}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(92vw,430px)] bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-[70]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-semibold">Notification Center</h3>
              <p className="text-xs text-gray-500">Threshold crossings and resolved events</p>
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
                No alert events have been recorded.
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
                        {alert.label} · {alert.severity}
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
