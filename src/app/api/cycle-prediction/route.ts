import { NextResponse } from "next/server";
import type {
  CyclePredictionAdvice,
  CyclePredictionBaseline,
} from "../../lib/cyclePrediction";

const cleanText = (value: unknown, maxLength = 320) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

function sanitizeAdvice(value: unknown): CyclePredictionAdvice | null {
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

  return { summary, keyRisks, priorityActions, monitoringFocus };
}

function isPredictionBaseline(value: unknown): value is CyclePredictionBaseline {
  if (!value || typeof value !== "object") return false;
  const baseline = value as Partial<CyclePredictionBaseline>;

  return (
    typeof baseline.cycleId === "string" &&
    typeof baseline.houseName === "string" &&
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
    const baseline = payload?.baseline;

    if (!isPredictionBaseline(baseline)) {
      return NextResponse.json(
        { error: "A valid current-cycle prediction baseline is required" },
        { status: 400 }
      );
    }

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
              "You are a poultry-farm decision-support analyst. Use only the verified baseline supplied by the application. Do not change, recalculate, or invent numeric forecasts. Do not diagnose disease or prescribe medication. Recommend practical checks and operational actions, state uncertainty, and advise escalation to farm management or a veterinarian for unusual health findings. Return valid JSON only.",
          },
          {
            role: "user",
            content: `Review this verified current-cycle forecast baseline:\n${JSON.stringify(
              baseline,
              null,
              2
            )}\n\nReturn this exact JSON structure:\n{\n  "summary": "short outlook based on the fixed forecast",\n  "keyRisks": [{"title":"...","evidence":"cite supplied data","impact":"..."}],\n  "priorityActions": [{"timeframe":"Now | Next 24 hours | Before harvest | Before sign-off","action":"...","reason":"..."}],\n  "monitoringFocus": ["..."]\n}\nProvide 1-4 risks, 3-5 actions, and up to 5 monitoring items.`,
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

    const advice = sanitizeAdvice(parsed);
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
