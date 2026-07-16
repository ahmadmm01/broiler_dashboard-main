import { NextResponse } from "next/server";
import { subscribeToRtsp } from "@/app/lib/rtspStreamManager";
import {
  getVideoSourceConfig,
  isCameraZone,
} from "@/app/lib/videoSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const zone = new URL(request.url).searchParams.get("zone");
  if (!isCameraZone(zone)) {
    return NextResponse.json(
      { error: "A valid camera zone (A, B, or C) is required" },
      { status: 400 }
    );
  }

  const config = getVideoSourceConfig();
  if (config.mode !== "rtsp") {
    return NextResponse.json(
      { error: "RTSP mode is not enabled" },
      { status: 409 }
    );
  }

  const source = config.sources[zone];
  if (!source) {
    return NextResponse.json(
      { error: `No RTSP camera is configured for Zone ${zone}` },
      { status: 404 }
    );
  }

  const { stream, unsubscribe } = subscribeToRtsp({
    sourceKey: source.key,
    rtspUrl: source.url,
    ffmpegPath: config.ffmpegPath,
    transport: config.transport,
    fps: config.fps,
    maxWidth: config.maxWidth,
    jpegQuality: config.jpegQuality,
    idleTimeoutMs: config.idleTimeoutMs,
  });

  const abort = () => unsubscribe();
  if (request.signal.aborted) abort();
  else request.signal.addEventListener("abort", abort, { once: true });

  return new Response(stream, {
    headers: {
      "Content-Type": "multipart/x-mixed-replace; boundary=ffmpeg",
      "Cache-Control": "no-store, no-cache, must-revalidate, no-transform",
      Connection: "keep-alive",
      Pragma: "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
