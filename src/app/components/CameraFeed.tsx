/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { VideoSourceConfigResponse, Zone } from "@/app/lib/types";

type CameraFeedProps = {
  zone: Zone;
  dummySrc: string;
  className?: string;
};

let configRequest: Promise<VideoSourceConfigResponse> | null = null;

function loadVideoConfig() {
  if (!configRequest) {
    configRequest = fetch("/api/video/config", { cache: "no-store" }).then(
      async (response) => {
        if (!response.ok) throw new Error("Video configuration is unavailable");
        return (await response.json()) as VideoSourceConfigResponse;
      }
    );
  }
  return configRequest;
}

export default function CameraFeed({
  zone,
  dummySrc,
  className = "w-full h-full object-cover",
}: CameraFeedProps) {
  const [config, setConfig] = useState<VideoSourceConfigResponse | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
    let active = true;
    loadVideoConfig()
      .then((result) => {
        if (active) setConfig(result);
      })
      .catch(() => {
        if (active) setConfigFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setStreamFailed(false);
    setStreamConnected(false);
  }, [zone, retryNumber, config?.mode]);

  const rtspConfigured =
    config?.mode === "rtsp" && config.zones[zone].configured;
  const showRtsp = rtspConfigured && !streamFailed;
  const streamUrl = useMemo(() => {
    if (!config || !rtspConfigured) return null;
    const query = new URLSearchParams({
      zone,
      attempt: String(retryNumber),
    });
    return `${config.streamEndpoint}?${query.toString()}`;
  }, [config, retryNumber, rtspConfigured, zone]);

  const fallbackReason = streamFailed
    ? "RTSP unavailable — showing preview"
    : config?.mode === "rtsp" && !config.zones[zone].configured
      ? `Zone ${zone} has no RTSP URL — showing preview`
      : configFailed
        ? "Camera configuration unavailable — showing preview"
        : null;

  return (
    <>
      {showRtsp && streamUrl ? (
        <img
          key={streamUrl}
          src={streamUrl}
          alt={`Live CCTV stream for Zone ${zone}`}
          className={className}
          onLoad={() => setStreamConnected(true)}
          onError={() => {
            setStreamConnected(false);
            setStreamFailed(true);
          }}
        />
      ) : (
        <video
          src={dummySrc}
          autoPlay
          loop
          muted
          playsInline
          className={className}
        />
      )}

      {showRtsp && (
        <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              streamConnected
                ? "bg-emerald-400"
                : "animate-pulse bg-amber-300"
            }`}
          />
          {streamConnected ? "Live RTSP" : "Connecting RTSP"}
        </div>
      )}

      {fallbackReason && (
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow">
          <span>{fallbackReason}</span>
          {rtspConfigured && (
            <button
              type="button"
              onClick={() => setRetryNumber((value) => value + 1)}
              className="rounded-md bg-amber-700 px-2.5 py-1 font-semibold text-white hover:bg-amber-800"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </>
  );
}
