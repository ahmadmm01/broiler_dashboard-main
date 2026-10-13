import { NextResponse } from "next/server";
import type {
  CycleOutcomeAnalysis,
  FarmerOutcomeAdvice,
} from "../../lib/outcomeAnalysis";

const cleanText = (value: unknown, maxLength = 360) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

function cleanList(value: unknown, limit: number, maxLength = 280) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, limit);
}

function sanitizeAdvice(value: unknown): FarmerOutcomeAdvice | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const summary = cleanText(raw.summary, 650);
  const whatHappened = cleanList(raw.whatHappened, 4);
  const whyItMatters = cleanList(raw.whyItMatters, 4);
  const monitoringFocus = cleanList(raw.monitoringFocus, 6, 140);
  const suggestedActions = (Array.isArray(raw.suggestedActions)
    ? raw.suggestedActions
    : []
  )
    .map((item) => {
      const record =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        action: cleanText(record.action, 260),
        reason: cleanText(record.reason, 300),
      };
    })
    .filter((item) => item.action && item.reason)
    .slice(0, 5);

  if (
    !summary ||
    whatHappened.length === 0 ||
    whyItMatters.length === 0 ||
    monitoringFocus.length === 0 ||
    suggestedActions.length === 0
  ) {
    return null;
  }

  return {
    summary,
    whatHappened,
    whyItMatters,
    monitoringFocus,
    suggestedActions,
  };
}

function isOutcomeBaseline(value: unknown): value is CycleOutcomeAnalysis {
  if (!value || typeof value !== "object") return false;
  const baseline = value as Partial<CycleOutcomeAnalysis>;

  return (
    typeof baseline.cycleId === "string" &&
    typeof baseline.zone === "string" &&
    typeof baseline.currentDay === "number" &&
    typeof baseline.targetDay === "number" &&
    typeof baseline.isFinal === "boolean" &&
    typeof baseline.initialBirds === "number" &&
    typeof baseline.survivingBirds === "number" &&
    typeof baseline.mortalityRate === "number" &&
    typeof baseline.averageWeightKg === "number" &&
    typeof baseline.cumulativeFcr === "number" &&
    typeof baseline.sensorRecords === "number" &&
    Array.isArray(baseline.sensorMetrics)
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const baseline = payload?.baseline;

    if (!isOutcomeBaseline(baseline)) {
      return NextResponse.json(
        { error: "A valid cycle outcome baseline is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Outcome insight service is not configured" },
        { status: 503 }
      );
    }

    const reviewInput = {
      cycleId: baseline.cycleId,
      zone: baseline.zone,
      batch: baseline.batch,
      currentDay: baseline.currentDay,
      targetDay: baseline.targetDay,
      isFinal: baseline.isFinal,
      initialBirds: baseline.initialBirds,
      survivingBirds: baseline.survivingBirds,
      survivalRate: baseline.survivalRate,
      totalMortality: baseline.totalMortality,
      mortalityRate: baseline.mortalityRate,
      averageWeightKg: baseline.averageWeightKg,
      cumulativeFcr: baseline.cumulativeFcr,
      alertCount: baseline.alertCount,
      sensorRecords: baseline.sensorRecords,
      readingsWithinLimitsPercent: baseline.readingsWithinLimitsPercent,
      sensorMetrics: baseline.sensorMetrics,
      efficiencyIndex: baseline.efficiencyIndex,
      finalComparison: baseline.finalComparison,
    };
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
        max_tokens: 1000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a poultry-farm decision-support analyst. Explain the supplied historical replay outcome to a farmer in practical, cautious language. Use only the supplied baseline. Never invent, recalculate, or change numeric values. If isFinal is false, treat every production value as cumulative through currentDay and never infer the final outcome. Do not claim that environmental readings caused production results; describe only patterns that coincided or should be reviewed together. Do not diagnose disease or prescribe medication. Recommend operational checks and escalation through normal farm management or veterinary procedures when physical health signs are unusual. Return valid JSON only.",
          },
          {
            role: "user",
            content: `Review this verified cycle-outcome baseline:\n${JSON.stringify(
              reviewInput,
              null,
              2
            )}\n\nReturn exactly this JSON structure:\n{\n  "summary": "concise farmer-facing outcome summary",\n  "whatHappened": ["2-4 evidence-based observations"],\n  "whyItMatters": ["2-4 cautious interpretations"],\n  "monitoringFocus": ["up to 6 specific items"],\n  "suggestedActions": [{"action":"practical action","reason":"why it follows from the supplied data"}]\n}\nProvide 2-5 suggested actions. Keep partial-cycle and final-cycle language distinct.`,
          },
        ],
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? "Outcome insight request failed" },
        { status: response.status }
      );
    }

    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "Outcome insight response was incomplete" },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "Outcome insight response was not valid JSON" },
        { status: 502 }
      );
    }

    const advice = sanitizeAdvice(parsed);
    if (!advice) {
      return NextResponse.json(
        { error: "Outcome insight response was incomplete" },
        { status: 502 }
      );
    }

    return NextResponse.json({ advice });
  } catch (error) {
    console.error("Failed to generate cycle outcome analysis", error);
    return NextResponse.json(
      { error: "Failed to generate cycle outcome analysis" },
      { status: 500 }
    );
  }
}
