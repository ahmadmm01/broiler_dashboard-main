/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoSourceConfigResponse, Zone } from "@/app/lib/types";

type CameraFeedProps = {
  zone: Zone;
  dummySrc: string;
  className?: string;
  available?: boolean;
  disconnected?: boolean;
  replay?: boolean;
  replayPlaying?: boolean;
  replayProgress?: number;
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
  available,
  disconnected = false,
  replay = false,
  replayPlaying = true,
  replayProgress = 0,
}: CameraFeedProps) {
  const cameraAvailable = available ?? zone === "A";
  const [config, setConfig] = useState<VideoSourceConfigResponse | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [retryNumber, setRetryNumber] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!cameraAvailable || disconnected || replay) return;

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
  }, [cameraAvailable, disconnected, replay]);

  useEffect(() => {
    setStreamFailed(false);
    setStreamConnected(false);
  }, [zone, retryNumber, config?.mode]);

  useEffect(() => {
    if (!replay || !videoRef.current) return;
    if (replayPlaying) {
      void videoRef.current.play().catch(() => undefined);
    } else {
      videoRef.current.pause();
    }
  }, [replay, replayPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!replay || !video || !Number.isFinite(video.duration)) return;
    const target = Math.min(1, Math.max(0, replayProgress)) * video.duration;
    if (Math.abs(video.currentTime - target) > 1) video.currentTime = target;
  }, [replay, replayProgress]);

  const rtspConfigured =
    cameraAvailable &&
    config?.mode === "rtsp" &&
    config.zones[zone].configured;
  const showRtsp = !disconnected && !replay && rtspConfigured && !streamFailed;
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
      {disconnected ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 text-center text-white">
          <div className="rounded-2xl border border-white/15 bg-white/5 px-6 py-5 shadow-xl backdrop-blur-sm">
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl"
              aria-hidden="true"
            >
              📷
            </div>
            <div className="mt-3 text-sm font-semibold">CCTV Disconnected</div>
          </div>
        </div>
      ) : !cameraAvailable ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-6 text-center text-white">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl">
              📷
            </div>
            <div className="mt-3 text-sm font-semibold">CCTV not available</div>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              Zone {zone} has environmental sensors, but no camera is installed.
            </p>
          </div>
        </div>
      ) : showRtsp && streamUrl ? (
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
          ref={videoRef}
          src={dummySrc}
          autoPlay={!replay || replayPlaying}
          loop
          muted
          playsInline
          className={className}
          onLoadedMetadata={(event) => {
            if (!replay) return;
            event.currentTarget.currentTime =
              Math.min(1, Math.max(0, replayProgress)) *
              event.currentTarget.duration;
            if (!replayPlaying) event.currentTarget.pause();
          }}
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

      {replay && !disconnected && cameraAvailable && (
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-violet-700/90 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          <span
            className={`h-2 w-2 rounded-full bg-white ${
              replayPlaying ? "animate-pulse" : "opacity-60"
            }`}
          />
          CCTV · {replayPlaying ? "Playing" : "Paused"}
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
