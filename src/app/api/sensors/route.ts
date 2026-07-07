import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import {
  formatDate,
  getRollingSensorRange,
} from "@/app/lib/dateUtils";
import { mapRawSensorItems } from "@/app/lib/sensorData";
import type { RawSensorItem, SensorApiResponse } from "@/app/lib/types";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "broiler_data.json");
    const raw = await readFile(filePath, "utf-8");
    const json = JSON.parse(raw) as RawSensorItem[];
    const range = getRollingSensorRange(json);

    const response: SensorApiResponse = {
      data: mapRawSensorItems(json),
      meta: {
        sourceStart: formatDate(range.sourceStart),
        sourceEnd: formatDate(range.sourceEnd),
        runtimeStart: formatDate(range.targetStart),
        runtimeEnd: formatDate(range.targetEnd),
        records: json.length,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to load sensor data", error);
    return NextResponse.json(
      { error: "Failed to load sensor data" },
      { status: 500 }
    );
  }
}
