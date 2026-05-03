import { NextRequest, NextResponse } from "next/server";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { DEFAULT_GEMINI_TEXT_MODEL, DEFAULT_OPENAI_AUTOMATION_MODEL } from "@/lib/ai-model-options";
import { callOpenAIText, OpenAITextError } from "@/lib/openai-text";

const EXTRACT_PROMPT = `다음 기사/글의 문체 패턴을 분석하여 600자 이내로 압축 정리해주세요.

[분석 항목]
- 문장 길이와 구조 패턴
- 자주 사용하는 표현과 어투
- 단락 구성 방식
- 특징적인 어휘, 접속사 사용
- 기사 구조 (리드문, 본문, 마무리 방식)

[출력 규칙]
- 600자 이내의 텍스트로만 출력
- JSON이나 마크다운 없이 순수 텍스트
- "~로 시작", "~를 주로 사용" 등 구체적 패턴 기술`;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }
  const { fileContent, fileName, existingContext, provider, model } = body as {
    fileContent?: string; fileName?: string; existingContext?: string; provider?: string; model?: string;
  };

  // API 키는 DB 설정 → 환경변수 순서로 로드 (request body에서 받지 않음)
  const aiSettings = await serverGetAiSettings();
  const resolvedKey = resolveAiApiKey(aiSettings, provider);

  if (!resolvedKey || !fileContent) {
    return NextResponse.json(
      { success: false, error: "API 키 또는 파일 내용이 없습니다." },
      { status: 400 }
    );
  }

  const mergeNote = existingContext
    ? `\n기존 스타일 컨텍스트:\n${existingContext}\n\n위 기존 패턴에 새로운 패턴을 병합하여 업데이트해주세요.`
    : "";

  const systemPrompt = EXTRACT_PROMPT + mergeNote;
  const content = String(fileContent).slice(0, 8000);

  try {
    let styleContext = "";

    if (provider === "gemini") {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_GEMINI_TEXT_MODEL}:generateContent`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": resolvedKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n---\n\n${content}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await resp.json().catch(() => ({ error: { message: `Gemini 응답 오류 (${resp.status})` } }));
      if (data.error) {
        console.error("[learn-file] Gemini error:", data.error.message);
        const userMsg = resp.status === 400 ? "API 키가 올바르지 않습니다."
          : resp.status === 429 ? "API 요청 한도를 초과했습니다."
          : "AI 처리 중 오류가 발생했습니다.";
        return NextResponse.json({ success: false, error: userMsg }, { status: 400 });
      }
      styleContext = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      try {
        styleContext = await callOpenAIText({
          apiKey: resolvedKey,
          model: model || DEFAULT_OPENAI_AUTOMATION_MODEL,
          systemPrompt,
          content,
          temperature: 0.3,
          maxOutputTokens: 500,
          timeoutMs: 45000,
        });
      } catch (error) {
        if (error instanceof OpenAITextError) {
          console.error("[learn-file] OpenAI error:", error.providerMessage);
          const userMsg = error.status === 401 ? "API 키가 올바르지 않습니다."
            : error.status === 429 ? "API 요청 한도를 초과했습니다."
            : "AI 처리 중 오류가 발생했습니다.";
          return NextResponse.json({ success: false, error: userMsg }, { status: 400 });
        }
        throw error;
      }
    }

    styleContext = styleContext.trim().slice(0, 600);
    const summary = `${fileName || "파일"} 학습 완료 (${new Date().toLocaleDateString("ko-KR")})`;

    return NextResponse.json({ success: true, styleContext, summary });
  } catch (error) {
    console.error("[learn-file] Unexpected error:", error);
    return NextResponse.json({ success: false, error: "AI 요청 중 오류가 발생했습니다." }, { status: 500 });
  }
}
