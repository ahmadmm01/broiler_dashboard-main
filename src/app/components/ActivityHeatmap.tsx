"use client";

import { useMemo } from "react";
import CameraFeed from "./CameraFeed";

export default function ActivityHeatmap({
  tick,
  score,
  reason,
}: {
  tick: number;
  score: number;
  reason: string;
}) {
  const overlay = useMemo(() => {
    const firstX = 24 + ((tick * 7) % 34);
    const firstY = 32 + ((tick * 5) % 26);
    const secondX = 70 - ((tick * 3) % 24);
    const secondY = 60 - ((tick * 4) % 22);
    const thirdX = 45 + Math.round(Math.sin(tick * 0.65) * 18);
    const thirdY = 42 + Math.round(Math.cos(tick * 0.52) * 16);
    return `radial-gradient(circle at ${firstX}% ${firstY}%, rgba(239,68,68,.82), transparent 25%), radial-gradient(circle at ${secondX}% ${secondY}%, rgba(249,115,22,.72), transparent 24%), radial-gradient(circle at ${thirdX}% ${thirdY}%, rgba(250,204,21,.65), transparent 22%)`;
  }, [tick]);

  return (
    <div className="bg-white rounded-2xl shadow p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-lg">Activity Density Preview</h3>
          <p className="text-xs text-gray-500">
            Moving replay overlay aligned with the current sensor cursor
          </p>
        </div>
        <span className="self-start text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
          Simulated overlay · CV metadata pending
        </span>
      </div>

      <div className="rounded-xl overflow-hidden relative w-full" style={{ aspectRatio: "16/9" }}>
        <CameraFeed
          zone="A"
          dummySrc="/video/cctv ayam 1.mp4"
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-50 transition-all duration-1000"
          style={{ background: overlay }}
        />
        <div className="absolute left-3 bottom-3 bg-black/65 text-white px-3 py-2 rounded-lg text-xs">
          <div className="font-medium mb-1">Density</div>
          <div className="flex items-center gap-2">
            <span>Low</span>
            <span className="w-24 h-2 rounded-full bg-gradient-to-r from-yellow-300 via-orange-500 to-red-600" />
            <span>High</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="p-3 rounded-lg bg-gray-50">
          <div className="text-gray-500">Environmental Activity Proxy</div>
          <div className="text-xl font-semibold">{Math.round(score)}</div>
        </div>
        <div className="p-3 rounded-lg bg-gray-50">
          <div className="text-gray-500">Status</div>
          <div className={`font-semibold ${score < 35 ? "text-red-600" : score < 60 ? "text-yellow-700" : "text-green-700"}`}>
            {score < 35 ? "Abnormal" : score < 60 ? "Moderate" : "Normal"}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-gray-50">
          <div className="text-gray-500">Environmental Reason</div>
          <div className="text-xs mt-1">{reason}</div>
        </div>
      </div>
    </div>
  );
}
