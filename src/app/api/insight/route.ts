import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { context, prompt } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    if (
      typeof context !== "string" ||
      typeof prompt !== "string" ||
      !context.trim() ||
      !prompt.trim()
    ) {
      return NextResponse.json(
        { error: "Insight context and prompt are required" },
        { status: 400 }
      );
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a poultry-monitoring decision-support analyst reviewing historical replay data. Use only the supplied context. Treat every supplied threshold status as authoritative. Never describe replay data as live. Do not invent measurements, diagnose disease, or prescribe medication. Give practical operational checks, state uncertainty, and recommend qualified farm or veterinary review for unusual health findings.",
          },
          { role: "user", content: context + "\n\n" + prompt },
        ],
        temperature: 0.3,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      const providerCode = String(json.error?.code ?? "").toLowerCase();
      const providerMessage = String(json.error?.message ?? "").toLowerCase();
      const quotaUnavailable =
        res.status === 429 ||
        providerCode.includes("quota") ||
        providerCode.includes("billing") ||
        providerMessage.includes("credit") ||
        providerMessage.includes("billing");

      console.error("OpenAI insight request failed", {
        status: res.status,
        code: json.error?.code,
        type: json.error?.type,
      });
      return NextResponse.json(
        {
          error: quotaUnavailable
            ? "AI service quota is unavailable for the configured account"
            : "The AI service could not generate an insight at this time",
        },
        { status: res.status }
      );
    }

    const insight = json.choices?.[0]?.message?.content;

    if (!insight) {
      return NextResponse.json(
        { error: "OpenAI response did not include an insight" },
        { status: 502 }
      );
    }

    return NextResponse.json({ insight, model });
  } catch (error) {
    console.error("Failed to generate insight", error);
    return NextResponse.json(
      { error: "Failed to generate AI insight" },
      { status: 500 }
    );
  }
}
