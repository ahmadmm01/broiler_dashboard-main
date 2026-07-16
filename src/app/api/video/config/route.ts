import { NextResponse } from "next/server";
import type { VideoSourceConfigResponse, Zone } from "@/app/lib/types";
import {
  CAMERA_ZONES,
  getVideoSourceConfig,
} from "@/app/lib/videoSource";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getVideoSourceConfig();
  const zones = Object.fromEntries(
    CAMERA_ZONES.map((zone) => [
      zone,
      { configured: Boolean(config.sources[zone]) },
    ])
  ) as Record<Zone, { configured: boolean }>;

  const response: VideoSourceConfigResponse = {
    mode: config.mode,
    streamEndpoint: "/api/video/stream",
    zones,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
