import { NextResponse } from "next/server";
import type {
  HistoricalCycleAdvice,
  HistoricalCycleAnalysisBaseline,
} from "../../lib/historicalCycleAnalysis";

const cleanText = (value: unknown, maxLength = 320) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

function sanitizeAdvice(value: unknown): HistoricalCycleAdvice | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const summary = cleanText(raw.summary, 600);
  const rawFindings = Array.isArray(raw.keyFindings) ? raw.keyFindings : [];
  const rawActions = Array.isArray(raw.nextCycleActions)
    ? raw.nextCycleActions
    : [];
  const rawMonitoring = Array.isArray(raw.monitoringFocus)
    ? raw.monitoringFocus
    : [];

  const keyFindings = rawFindings
    .slice(0, 4)
    .map((item) => {
      const record =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        title: cleanText(record.title, 100),
        evidence: cleanText(record.evidence, 240),
        meaning: cleanText(record.meaning, 240),
      };
    })
    .filter((item) => item.title && item.evidence && item.meaning);

  const nextCycleActions = rawActions
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

  if (!summary || keyFindings.length === 0 || nextCycleActions.length === 0) {
    return null;
  }

  return { summary, keyFindings, nextCycleActions, monitoringFocus };
}

function isHistoricalBaseline(
  value: unknown
): value is HistoricalCycleAnalysisBaseline {
  if (!value || typeof value !== "object") return false;
  const baseline = value as Partial<HistoricalCycleAnalysisBaseline>;

  return (
    typeof baseline.cycleId === "string" &&
    typeof baseline.period === "string" &&
    typeof baseline.records === "number" &&
    typeof baseline.riskLevel === "string" &&
    typeof baseline.production === "object" &&
    Array.isArray(baseline.metrics)
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const baseline = payload?.baseline;

    if (!isHistoricalBaseline(baseline)) {
      return NextResponse.json(
        { error: "A valid historical-cycle analysis baseline is required" },
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
              "You are a poultry-house retrospective production and environmental analyst. Use only the supplied completed-cycle baseline, including sensor, mortality, feed, water, and body-weight results. Do not invent missing data, disease, or harvest facts, and do not prescribe medication. Keep all supplied numbers unchanged. Focus on combined outcome patterns, operational lessons, and practical preparation for the next cycle. Return valid JSON only.",
          },
          {
            role: "user",
            content: `Analyse this verified historical sensor baseline:\n${JSON.stringify(
              baseline,
              null,
              2
            )}\n\nReturn this exact JSON structure:\n{\n  "summary": "retrospective environmental summary",\n  "keyFindings": [{"title":"...","evidence":"cite supplied data","meaning":"..."}],\n  "nextCycleActions": [{"timeframe":"Before next placement | Early next cycle | Throughout next cycle","action":"...","reason":"..."}],\n  "monitoringFocus": ["..."]\n}\nProvide 1-4 findings, 3-5 actions, and up to 5 monitoring items.`,
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
        { error: "OpenAI response did not include historical analysis" },
        { status: 502 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "OpenAI historical analysis was not valid JSON" },
        { status: 502 }
      );
    }

    const advice = sanitizeAdvice(parsed);
    if (!advice) {
      return NextResponse.json(
        { error: "OpenAI historical analysis was incomplete" },
        { status: 502 }
      );
    }

    return NextResponse.json({ advice, model });
  } catch (error) {
    console.error("Failed to generate historical-cycle analysis", error);
    return NextResponse.json(
      { error: "Failed to generate historical-cycle analysis" },
      { status: 500 }
    );
  }
}
