import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { provider, model, apiKey, prompt, content } = body;

  if (!apiKey || !prompt || !content) {
    return NextResponse.json({ success: false, error: "apiKey, prompt, content required" }, { status: 400 });
  }

  try {
    let result = "";

    if (provider === "openai") {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o",
          messages: [
            { role: "system", content: prompt },
            { role: "user", content },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });
      const data = await resp.json();
      if (data.error) {
        return NextResponse.json({ success: false, error: data.error.message }, { status: 400 });
      }
      result = data.choices?.[0]?.message?.content || "";
    } else if (provider === "gemini") {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${apiKey}`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `${prompt}\n\n---\n\n${content}` },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4000,
          },
        }),
      });
      const data = await resp.json();
      if (data.error) {
        return NextResponse.json({ success: false, error: data.error.message }, { status: 400 });
      }
      result = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      return NextResponse.json({ success: false, error: "Unknown provider. Use 'openai' or 'gemini'" }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
