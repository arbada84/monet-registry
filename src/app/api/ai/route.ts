import { NextRequest, NextResponse } from "next/server";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { DEFAULT_GEMINI_TEXT_MODEL, DEFAULT_OPENAI_TEXT_MODEL } from "@/lib/ai-model-options";
import { callOpenAIText, OpenAITextError } from "@/lib/openai-text";
import { redis, checkRateLimit as redisCheckRateLimit } from "@/lib/redis";

// ── Rate Limit (IP당 분당 20회) — Redis 우선, 인메모리 폴백 ──
const rateLimitMap = new Map<string, { count: number; ts: number }>();
let rlEvictCounter = 0;
async function checkAiRateLimit(ip: string, maxPerMin = 20): Promise<boolean> {
  // Redis 기반 Rate Limiting (서버리스 콜드스타트 후에도 유지)
  if (redis || process.env.NODE_ENV === "production") {
    return redisCheckRateLimit(ip, "cp:ai:rate:", maxPerMin, 60, {
      failClosedInProduction: true,
      context: "ai",
    });
  }
  // 인메모리 폴백 (개발환경용)
  const now = Date.now();
  if (++rlEvictCounter % 100 === 0) {
    for (const [k, v] of rateLimitMap) {
      if (now - v.ts > 60000) rateLimitMap.delete(k);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.ts > 60000) {
    rateLimitMap.set(ip, { count: 1, ts: now });
    return true;
  }
  if (entry.count >= maxPerMin) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // Rate Limit 체크
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!await checkAiRateLimit(clientIp)) {
    return NextResponse.json(
      { success: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

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
  const aiSettings = await serverGetAiSettings();
  const resolvedKey = resolveAiApiKey(aiSettings, provider);

  if (!resolvedKey || !prompt || !content) {
    return NextResponse.json(
      { success: false, error: "API key not configured. Set it in AI settings or server environment variables." },
      { status: 400 },
    );
  }

  // content 길이 제한 (50,000자 = 약 토큰 12,500개)
  if (typeof content === "string" && content.length > 50000) {
    return NextResponse.json(
      { success: false, error: "content가 너무 깁니다. 50,000자 이하로 줄여주세요." },
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
      result = await callOpenAIText({
        apiKey: resolvedKey,
        model: model || DEFAULT_OPENAI_TEXT_MODEL,
        systemPrompt,
        content,
        temperature: tempToUse,
        maxOutputTokens: tokensToUse,
        timeoutMs: 45000,
      });
    } else if (provider === "gemini") {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_GEMINI_TEXT_MODEL}:generateContent`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": resolvedKey },
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
        signal: AbortSignal.timeout(45000),
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
    if (error instanceof OpenAITextError) {
      console.error("[AI API] OpenAI error:", error.status, error.providerMessage);
      const userMsg = error.status === 401 ? "API 키가 올바르지 않습니다."
        : error.status === 429 ? "API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."
        : error.status === 400 ? "요청 형식 오류입니다. 모델명 또는 계정의 모델 접근 권한을 확인해주세요."
        : "AI 처리 중 오류가 발생했습니다.";
      return NextResponse.json({ success: false, error: userMsg }, { status: 400 });
    }
    const isTimeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    if (isTimeout) {
      return NextResponse.json(
        { success: false, error: "AI 요청 시간이 초과되었습니다 (55초). 본문 길이를 줄이거나 다시 시도해주세요." },
        { status: 504 }
      );
    }
    console.error("[AI API] Unexpected error:", error);
    const safeError = process.env.NODE_ENV === "production"
      ? "서버 오류가 발생했습니다."
      : (error instanceof Error ? error.message : "알 수 없는 오류");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
