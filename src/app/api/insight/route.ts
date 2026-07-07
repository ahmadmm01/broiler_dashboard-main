import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { context, prompt } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    if (!context || !prompt) {
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
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an AI analyst for poultry monitoring.",
          },
          { role: "user", content: context + "\n\n" + prompt },
        ],
        temperature: 0.3,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? "OpenAI request failed" },
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

    return NextResponse.json({ insight });
  } catch (error) {
    console.error("Failed to generate insight", error);
    return NextResponse.json(
      { error: "Failed to generate AI insight" },
      { status: 500 }
    );
  }
}
