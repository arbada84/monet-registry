import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";

interface AiSettingsDB {
  openaiApiKey?: string;
  geminiApiKey?: string;
}

function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text.replace(/\s+/g, " ").trim();
}

const EXTRACT_PROMPT = `다음 기사들을 분석하여 공통 문체 패턴을 600자 이내로 압축 정리해주세요.

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

/** SSRF 방어: 내부 네트워크 주소 차단 */
function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    // 루프백, 링크-로컬, 프라이빗 IP, 메타데이터 서비스 차단
    if (host === "localhost") return false;
    if (host.startsWith("127.")) return false;
    if (host.startsWith("10.")) return false;
    if (host.startsWith("172.") && (() => { const p = parseInt(host.split(".")[1]); return p >= 16 && p <= 31; })()) return false;
    if (host.startsWith("192.168.")) return false;
    if (host === "169.254.169.254") return false; // AWS metadata
    if (host === "::1" || host === "0.0.0.0") return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { urls, existingContext, provider, model } = body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ success: false, error: "URL 목록이 비어있습니다." }, { status: 400 });
  }

  // API 키는 DB 설정 → 환경변수 순서로 로드 (request body에서 받지 않음)
  const aiSettings = await serverGetSetting<AiSettingsDB>("cp-ai-settings", {});
  const resolvedKey =
    provider === "openai"
      ? (aiSettings.openaiApiKey || process.env.OPENAI_API_KEY)
      : (aiSettings.geminiApiKey || process.env.GEMINI_API_KEY);

  if (!resolvedKey) {
    return NextResponse.json({ success: false, error: "API 키가 없습니다." }, { status: 400 });
  }

  // Fetch each URL and extract article text
  const textParts: string[] = [];
  let fetched = 0;

  for (const url of urls.slice(0, 10)) {
    if (!isSafeUrl(String(url))) continue; // SSRF 방어
    try {
      const resp = await fetch(String(url), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CulturePeople/1.0; +https://culturepeople.co.kr)" },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const html = await resp.text();
        const text = extractTextFromHtml(html).slice(0, 3000);
        if (text.length > 100) {
          textParts.push(`[기사 ${fetched + 1}]:\n${text}`);
          fetched++;
        }
      }
    } catch {
      // skip failed URLs
    }
  }

  if (fetched === 0) {
    return NextResponse.json(
      { success: false, error: "URL에서 내용을 가져올 수 없습니다. URL을 확인하거나 직접 파일로 업로드해주세요." },
      { status: 400 }
    );
  }

  const combinedText = textParts.join("\n\n---\n\n").slice(0, 10000);
  const mergeNote = existingContext
    ? `\n기존 스타일 컨텍스트:\n${existingContext}\n\n위 기존 패턴에 새로운 패턴을 병합하여 업데이트해주세요.`
    : "";

  const systemPrompt = `다음 ${fetched}개 기사를 분석하여 공통 문체 패턴을 600자 이내로 압축 정리해주세요.${mergeNote}\n\n[분석 항목]\n- 문장 길이와 구조 패턴\n- 자주 사용하는 표현과 어투\n- 단락 구성 방식\n- 특징적인 어휘, 접속사 사용\n- 기사 구조 (리드문, 본문, 마무리 방식)\n\n[출력 규칙]\n- 600자 이내의 텍스트로만 출력\n- JSON이나 마크다운 없이 순수 텍스트`;

  try {
    let styleContext = "";

    if (provider === "gemini") {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${resolvedKey}`;
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n---\n\n${combinedText}` }] }],
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
            { role: "user", content: combinedText },
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
    const summary = `${fetched}개 URL 학습 완료 (${new Date().toLocaleDateString("ko-KR")})`;

    return NextResponse.json({ success: true, styleContext, summary, fetched });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
