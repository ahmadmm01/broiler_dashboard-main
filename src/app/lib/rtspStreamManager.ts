import "server-only";

import { spawn, type ChildProcess } from "child_process";

type SubscriberController = ReadableStreamDefaultController<Uint8Array>;

export type RtspStreamOptions = {
  sourceKey: string;
  rtspUrl: string;
  ffmpegPath: string;
  transport: "tcp" | "udp";
  fps: number;
  maxWidth: number;
  jpegQuality: number;
  idleTimeoutMs: number;
};

type StreamEntry = {
  key: string;
  process: ChildProcess | null;
  subscribers: Map<symbol, SubscriberController>;
  shutdownTimer: NodeJS.Timeout | null;
  options: RtspStreamOptions;
};

type GlobalWithRtspStreams = typeof globalThis & {
  __broilerRtspStreams?: Map<string, StreamEntry>;
};

const globalWithStreams = globalThis as GlobalWithRtspStreams;
const streams =
  globalWithStreams.__broilerRtspStreams ?? new Map<string, StreamEntry>();

globalWithStreams.__broilerRtspStreams = streams;

function closeSubscribers(entry: StreamEntry, error?: Error) {
  entry.subscribers.forEach((controller) => {
    try {
      if (error) controller.error(error);
      else controller.close();
    } catch {
      // The browser may have closed the response before FFmpeg stopped.
    }
  });
  entry.subscribers.clear();
}

function removeEntry(entry: StreamEntry, error?: Error) {
  if (entry.shutdownTimer) clearTimeout(entry.shutdownTimer);
  if (streams.get(entry.key) === entry) streams.delete(entry.key);
  entry.process = null;
  closeSubscribers(entry, error);
}

function stopProcess(entry: StreamEntry) {
  const process = entry.process;
  if (process && !process.killed) process.kill("SIGTERM");
}

function scheduleIdleShutdown(entry: StreamEntry) {
  if (entry.subscribers.size > 0 || entry.shutdownTimer) return;

  entry.shutdownTimer = setTimeout(() => {
    entry.shutdownTimer = null;
    if (entry.subscribers.size === 0) stopProcess(entry);
  }, entry.options.idleTimeoutMs);
  entry.shutdownTimer.unref();
}

function startProcess(entry: StreamEntry) {
  if (entry.process) return;

  const { options } = entry;
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-rtsp_transport",
    options.transport,
    "-fflags",
    "nobuffer",
    "-flags",
    "low_delay",
    "-i",
    options.rtspUrl,
    "-map",
    "0:v:0",
    "-an",
    "-vf",
    `fps=${options.fps},scale=${options.maxWidth}:-2:force_original_aspect_ratio=decrease`,
    "-c:v",
    "mjpeg",
    "-q:v",
    String(options.jpegQuality),
    "-f",
    "mpjpeg",
    "-boundary_tag",
    "ffmpeg",
    "pipe:1",
  ];

  const ffmpeg = spawn(options.ffmpegPath, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  entry.process = ffmpeg;

  let finished = false;
  const fail = (message: string) => {
    if (finished) return;
    finished = true;
    console.error(`[RTSP] ${message} (${entry.key})`);
    removeEntry(entry, new Error(message));
  };

  ffmpeg.stdout?.on("data", (chunk: Buffer) => {
    entry.subscribers.forEach((controller, subscriberId) => {
      try {
        controller.enqueue(chunk);
      } catch {
        entry.subscribers.delete(subscriberId);
      }
    });
    scheduleIdleShutdown(entry);
  });

  // Drain stderr so the child process cannot block. The content is deliberately
  // not logged because some camera implementations echo URLs with credentials.
  ffmpeg.stderr?.resume();

  ffmpeg.once("error", (error) => {
    fail(
      error.message.includes("ENOENT")
        ? "FFmpeg was not found; configure FFMPEG_PATH or install FFmpeg"
        : "FFmpeg could not start"
    );
  });

  ffmpeg.once("close", (code, signal) => {
    if (finished) return;
    finished = true;

    if (entry.subscribers.size === 0) {
      removeEntry(entry);
      return;
    }

    console.error(
      `[RTSP] FFmpeg stopped unexpectedly (${entry.key}, code=${code ?? "none"}, signal=${signal ?? "none"})`
    );
    removeEntry(entry, new Error("The RTSP stream stopped unexpectedly"));
  });
}

function getOrCreateEntry(options: RtspStreamOptions) {
  const existing = streams.get(options.sourceKey);
  if (existing) {
    existing.options = options;
    return existing;
  }

  const entry: StreamEntry = {
    key: options.sourceKey,
    process: null,
    subscribers: new Map(),
    shutdownTimer: null,
    options,
  };
  streams.set(options.sourceKey, entry);
  return entry;
}

export function subscribeToRtsp(options: RtspStreamOptions) {
  const entry = getOrCreateEntry(options);
  const subscriberId = Symbol("rtsp-subscriber");
  let unsubscribed = false;

  const unsubscribe = () => {
    if (unsubscribed) return;
    unsubscribed = true;
    entry.subscribers.delete(subscriberId);
    scheduleIdleShutdown(entry);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (entry.shutdownTimer) {
        clearTimeout(entry.shutdownTimer);
        entry.shutdownTimer = null;
      }
      entry.subscribers.set(subscriberId, controller);
      startProcess(entry);
    },
    cancel() {
      unsubscribe();
    },
  });

  return { stream, unsubscribe };
}
