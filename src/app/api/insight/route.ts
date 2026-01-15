import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { context, prompt } = await req.json();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an AI analyst for poultry monitoring." },
        { role: "user", content: context + "\n\n" + prompt },
      ],
      temperature: 0.3,
    }),
  });

  const json = await res.json();

  return NextResponse.json({
    insight: json.choices?.[0]?.message?.content,
  });
}
