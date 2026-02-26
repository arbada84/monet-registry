import { NextRequest, NextResponse } from "next/server";

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
  const body = await req.json();
  const { fileContent, fileName, existingContext, provider, model, apiKey } = body;

  const resolvedKey =
    apiKey ||
    (provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY);

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
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${resolvedKey}`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n---\n\n${content}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        }),
      });
      const data = await resp.json();
      if (data.error) {
        return NextResponse.json({ success: false, error: data.error.message }, { status: 400 });
      }
      styleContext = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolvedKey}` },
        body: JSON.stringify({
          model: model || "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });
      const data = await resp.json();
      if (data.error) {
        return NextResponse.json({ success: false, error: data.error.message }, { status: 400 });
      }
      styleContext = data.choices?.[0]?.message?.content || "";
    }

    styleContext = styleContext.trim().slice(0, 600);
    const summary = `${fileName || "파일"} 학습 완료 (${new Date().toLocaleDateString("ko-KR")})`;

    return NextResponse.json({ success: true, styleContext, summary });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
