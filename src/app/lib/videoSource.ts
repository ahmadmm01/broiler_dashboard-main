import "server-only";

import { createHash } from "crypto";
import type { VideoSourceMode, Zone } from "./types";

export const CAMERA_ZONES: readonly Zone[] = ["A", "B", "C"];

type RtspSource = {
  key: string;
  url: string;
};

export type ServerVideoSourceConfig = {
  mode: VideoSourceMode;
  ffmpegPath: string;
  transport: "tcp" | "udp";
  fps: number;
  maxWidth: number;
  jpegQuality: number;
  idleTimeoutMs: number;
  sources: Record<Zone, RtspSource | null>;
};

function cleanEnv(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function sourceKey(url: string) {
  return `camera-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

export function isCameraZone(value: string | null): value is Zone {
  return CAMERA_ZONES.includes(value as Zone);
}

export function getVideoSourceConfig(): ServerVideoSourceConfig {
  const mode: VideoSourceMode =
    process.env.VIDEO_SOURCE_MODE?.trim().toLowerCase() === "rtsp"
      ? "rtsp"
      : "dummy";
  const sharedUrl = cleanEnv(process.env.RTSP_URL);

  const sources = Object.fromEntries(
    CAMERA_ZONES.map((zone) => {
      const zoneUrl = cleanEnv(process.env[`RTSP_URL_${zone}`]);
      const url = zone === "A" ? zoneUrl ?? sharedUrl : null;
      return [zone, url ? { key: sourceKey(url), url } : null];
    })
  ) as Record<Zone, RtspSource | null>;

  return {
    mode,
    ffmpegPath: cleanEnv(process.env.FFMPEG_PATH) ?? "ffmpeg",
    transport:
      process.env.RTSP_TRANSPORT?.trim().toLowerCase() === "udp"
        ? "udp"
        : "tcp",
    fps: boundedInteger(process.env.RTSP_FPS, 10, 1, 30),
    maxWidth: boundedInteger(process.env.RTSP_MAX_WIDTH, 1280, 320, 3840),
    jpegQuality: boundedInteger(process.env.RTSP_JPEG_QUALITY, 5, 2, 31),
    idleTimeoutMs: boundedInteger(
      process.env.RTSP_IDLE_TIMEOUT_MS,
      5000,
      1000,
      60000
    ),
    sources,
  };
}
