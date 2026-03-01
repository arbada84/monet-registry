import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";

interface AiSettingsDB {
  openaiApiKey?: string;
  geminiApiKey?: string;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }
  const { provider, model, prompt, content, maxOutputTokens, temperature, styleContext } = body as {
    provider?: string; model?: string; prompt?: string; content?: string;
    maxOutputTokens?: number; temperature?: number; styleContext?: string;
  };

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
        signal: AbortSignal.timeout(55000), // Vercel 함수 제한(60s) 이전 중단
      });
      const data = await resp.json().catch(() => ({ error: { message: "" } }));
      if (data.error) {
        console.error("[AI API] OpenAI error:", resp.status, data.error.message);
        const userMsg = resp.status === 401 ? "API 키가 올바르지 않습니다."
          : resp.status === 429 ? "API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."
          : resp.status === 400 ? "요청 형식 오류입니다. 모델명을 확인해주세요."
          : "AI 처리 중 오류가 발생했습니다.";
        return NextResponse.json({ success: false, error: userMsg }, { status: 400 });
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
        signal: AbortSignal.timeout(55000),
      });
      const data = await resp.json().catch(() => ({ error: { message: "" } }));
      if (data.error) {
        console.error("[AI API] Gemini error:", resp.status, data.error.message);
        const userMsg = resp.status === 400 ? "API 키가 올바르지 않습니다."
          : resp.status === 429 ? "API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."
          : "AI 처리 중 오류가 발생했습니다.";
        return NextResponse.json({ success: false, error: userMsg }, { status: 400 });
      }
      result = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      return NextResponse.json({ success: false, error: "Unknown provider. Use 'openai' or 'gemini'" }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[AI API] Unexpected error:", error);
    return NextResponse.json({ success: false, error: "AI 요청 중 오류가 발생했습니다." }, { status: 500 });
  }
}
