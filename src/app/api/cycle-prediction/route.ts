import { NextResponse } from "next/server";
import type {
  CyclePredictionAdvice,
  CyclePredictionBaseline,
} from "../../lib/cyclePrediction";
import type { Zone } from "../../lib/types";

const cleanText = (value: unknown, maxLength = 320) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

function sanitizeAdvice(
  value: unknown,
  expectedZones: Zone[] = []
): CyclePredictionAdvice | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const summary = cleanText(raw.summary, 600);
  const rawRisks = Array.isArray(raw.keyRisks) ? raw.keyRisks : [];
  const rawActions = Array.isArray(raw.priorityActions)
    ? raw.priorityActions
    : [];
  const rawMonitoring = Array.isArray(raw.monitoringFocus)
    ? raw.monitoringFocus
    : [];
  const rawZoneSummaries = Array.isArray(raw.zoneSummaries)
    ? raw.zoneSummaries
    : [];

  const zoneSummaries = rawZoneSummaries
    .map((item) => {
      const record =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      const zone = cleanText(record.zone, 1);
      const riskLevel = cleanText(record.riskLevel, 10);
      const summary = cleanText(record.summary, 420);

      if (
        !(["A", "B", "C"] as string[]).includes(zone) ||
        !(["Low", "Moderate", "High"] as string[]).includes(riskLevel) ||
        !summary
      ) {
        return null;
      }

      return {
        zone: zone as Zone,
        riskLevel: riskLevel as "Low" | "Moderate" | "High",
        summary,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const keyRisks = rawRisks
    .slice(0, 4)
    .map((item) => {
      const record =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        title: cleanText(record.title, 100),
        evidence: cleanText(record.evidence, 240),
        impact: cleanText(record.impact, 240),
      };
    })
    .filter((item) => item.title && item.evidence && item.impact);

  const priorityActions = rawActions
    .slice(0, 5)
    .map((item) => {
      const record =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        timeframe: cleanText(record.timeframe, 60),
        action: cleanText(record.action, 240),
        reason: cleanText(record.reason, 240),
      };
    })
    .filter((item) => item.timeframe && item.action && item.reason);

  const monitoringFocus = rawMonitoring
    .map((item) => cleanText(item, 140))
    .filter(Boolean)
    .slice(0, 5);

  if (!summary || keyRisks.length === 0 || priorityActions.length === 0) {
    return null;
  }

  if (
    expectedZones.length > 0 &&
    !expectedZones.every((zone) =>
      zoneSummaries.some((item) => item.zone === zone)
    )
  ) {
    return null;
  }

  if (expectedZones.length > 0) {
    const multiZoneText = [
      summary,
      ...zoneSummaries.map((item) => item.summary),
    ].join(" ");
    if (
      /\b(projected|projection|forecast|harvest timing|days remaining|live weight)\b/i.test(
        multiZoneText
      )
    ) {
      return null;
    }
  }

  return {
    summary,
    zoneSummaries: zoneSummaries.length > 0 ? zoneSummaries : undefined,
    keyRisks,
    priorityActions,
    monitoringFocus,
  };
}

function isPredictionBaseline(value: unknown): value is CyclePredictionBaseline {
  if (!value || typeof value !== "object") return false;
  const baseline = value as Partial<CyclePredictionBaseline>;

  return (
    typeof baseline.cycleId === "string" &&
    typeof baseline.houseName === "string" &&
    typeof baseline.zone === "string" &&
    typeof baseline.currentDay === "number" &&
    typeof baseline.targetHarvestDay === "number" &&
    typeof baseline.projectedAverageWeightKg === "number" &&
    typeof baseline.projectedSurvivingBirds === "number" &&
    typeof baseline.sensor === "object"
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const baselines = Array.isArray(payload?.baselines)
      ? payload.baselines
      : payload?.baseline
        ? [payload.baseline]
        : [];

    if (
      baselines.length === 0 ||
      baselines.length > 3 ||
      !baselines.every(isPredictionBaseline)
    ) {
      return NextResponse.json(
        {
          error:
            "One to three valid current-cycle prediction baselines are required",
        },
        { status: 400 }
      );
    }

    const isMultiZone = baselines.length > 1;
    const expectedZoneList = baselines
      .map((baseline: CyclePredictionBaseline) => baseline.zone)
      .join(", ");
    const responseInstructions = isMultiZone
      ? `Return this exact JSON structure:\n{\n  "summary": "short overall current-condition comparison without forecasting",\n  "zoneSummaries": [{"zone":"A | B | C","riskLevel":"Low | Moderate | High","summary":"current production and environmental condition for this zone; no forecasting"}],\n  "keyRisks": [{"title":"...","evidence":"cite supplied data and zone","impact":"..."}],\n  "priorityActions": [{"timeframe":"Now | Next 24 hours","action":"...","reason":"..."}],\n  "monitoringFocus": ["..."]\n}\nProvide exactly one zoneSummaries entry for every supplied zone (${expectedZoneList}). Keep the response at current-condition summary level and exclude projected weight, projected birds, projected live weight, harvest timing, and all other forecasting. Provide 1-4 risks, 2-4 actions, and up to 5 monitoring items.`
      : `Return this exact JSON structure:\n{\n  "summary": "deep outlook based on the fixed single-zone forecast",\n  "zoneSummaries": [],\n  "keyRisks": [{"title":"...","evidence":"cite supplied data","impact":"..."}],\n  "priorityActions": [{"timeframe":"Now | Next 24 hours | Before harvest | Before sign-off","action":"...","reason":"..."}],\n  "monitoringFocus": ["..."]\n}\nProvide deep analysis for the selected zone with 1-4 risks, 3-5 actions, and up to 5 monitoring items.`;
    const reviewInput = isMultiZone
      ? baselines.map((baseline: CyclePredictionBaseline) => ({
          cycleId: baseline.cycleId,
          houseName: baseline.houseName,
          zone: baseline.zone,
          currentDay: baseline.currentDay,
          mortalityRate: baseline.mortalityRate,
          fcr: baseline.fcr,
          alertCount: baseline.alertCount,
          riskLevel: baseline.riskLevel,
          sensorCompleteness: baseline.sensorCompleteness,
          latestReading: baseline.latestReading,
          sensor: baseline.sensor,
        }))
      : baselines[0];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 503 }
      );
    }

    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a poultry-farm decision-support analyst. Use only the verified baseline or zone baselines supplied by the application. When multiple zone baselines are supplied, provide a concise current-condition summary for every zone and compare zones explicitly; do not present forecasting, projected weight, projected birds, projected live weight, or harvest timing in the multi-zone response. Forecasting and deep harvest analysis are allowed only when one zone baseline is supplied. Name the relevant zone in each finding. Do not combine bird counts across zones unless the supplied values make that operation explicit. Do not change, recalculate, or invent numeric values. Do not diagnose disease or prescribe medication. Recommend practical checks and operational actions, state uncertainty, and advise escalation to farm management or a veterinarian for unusual health findings. Return valid JSON only.",
          },
          {
            role: "user",
            content: `Review ${
              isMultiZone
                ? "these verified current-cycle baselines for all active zones"
                : "this verified current-cycle forecast baseline"
            }:\n${JSON.stringify(
              reviewInput,
              null,
              2
            )}\n\n${responseInstructions}`,
          },
        ],
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? "OpenAI request failed" },
        { status: response.status }
      );
    }

    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "OpenAI response did not include prediction advice" },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "OpenAI prediction advice was not valid JSON" },
        { status: 502 }
      );
    }

    const advice = sanitizeAdvice(
      parsed,
      isMultiZone
        ? baselines.map(
            (baseline: CyclePredictionBaseline) => baseline.zone
          )
        : []
    );
    if (!advice) {
      return NextResponse.json(
        { error: "OpenAI prediction advice was incomplete" },
        { status: 502 }
      );
    }

    return NextResponse.json({ advice, model });
  } catch (error) {
    console.error("Failed to generate current-cycle prediction", error);
    return NextResponse.json(
      { error: "Failed to generate current-cycle prediction" },
      { status: 500 }
    );
  }
}
