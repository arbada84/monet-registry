import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";

interface AiSettingsDB {
  openaiApiKey?: string;
  geminiApiKey?: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { provider, model, prompt, content, maxOutputTokens, temperature, styleContext } = body;

  // API 키는 DB 설정 → 환경변수 순서로 로드 (request body에서 받지 않음)
  const aiSettings = await serverGetSetting<AiSettingsDB>("cp-ai-settings", {});
  const resolvedKey =
    (provider === "openai" ? (aiSettings.openaiApiKey || process.env.OPENAI_API_KEY) : (aiSettings.geminiApiKey || process.env.GEMINI_API_KEY));

  if (!resolvedKey || !prompt || !content) {
    return NextResponse.json(
      { success: false, error: "API key not configured. Set it in AI settings or server environment variables." },
      { status: 400 },
    );
  }

  // Inject styleContext into system prompt if provided
  const systemPrompt = styleContext
    ? `${prompt}\n\n[문체 가이드라인]\n${styleContext}`
    : prompt;

  const tokensToUse = maxOutputTokens ?? 4000;
  const tempToUse = temperature ?? 0.7;

  try {
    let result = "";

    if (provider === "openai") {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedKey}`,
        },
        body: JSON.stringify({
          model: model || "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content },
          ],
          temperature: tempToUse,
          max_tokens: tokensToUse,
        }),
      });
      const data = await resp.json();
      if (data.error) {
        return NextResponse.json({ success: false, error: data.error.message }, { status: 400 });
      }
      result = data.choices?.[0]?.message?.content || "";
    } else if (provider === "gemini") {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${resolvedKey}`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `${systemPrompt}\n\n---\n\n${content}` },
              ],
            },
          ],
          generationConfig: {
            temperature: tempToUse,
            maxOutputTokens: tokensToUse,
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
