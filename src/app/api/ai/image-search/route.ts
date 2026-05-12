import { NextRequest, NextResponse } from "next/server";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import { DEFAULT_GEMINI_TEXT_MODEL } from "@/lib/ai-model-options";

interface PexelsPhoto {
  id: number;
  src: {
    medium: string;
    small: string;
    large: string;
  };
  alt: string;
  photographer: string;
  url: string;
}

interface PexelsResponse {
  photos: PexelsPhoto[];
  error?: string;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { title, bodyText, keywords: providedKeywords } = body as {
    title?: string;
    bodyText?: string;
    keywords?: string[];
  };

  const aiSettings = await serverGetAiSettings();
  const geminiKey = resolveAiApiKey(aiSettings, "gemini");
  const pexelsKey = process.env.PEXELS_API_KEY || aiSettings.pexelsApiKey;

  if (!pexelsKey) {
    return NextResponse.json(
      { success: false, error: "Pexels API 키가 설정되지 않았습니다. 관리자 > AI 설정에서 입력하거나 PEXELS_API_KEY 환경변수를 설정해주세요." },
      { status: 400 }
    );
  }

  let keywords: string[] = [];

  // keywords가 직접 제공된 경우 Gemini 생략
  if (providedKeywords && providedKeywords.length > 0) {
    keywords = providedKeywords;
  } else {
    // Gemini로 키워드 추출
    if (!geminiKey) {
      return NextResponse.json(
        { success: false, error: "Gemini API 키가 설정되지 않았습니다. 관리자 > AI 설정에서 입력하거나 GEMINI_API_KEY 환경변수를 설정해주세요." },
        { status: 400 }
      );
    }

    if (!title && !bodyText) {
      return NextResponse.json(
        { success: false, error: "제목 또는 본문을 입력해주세요." },
        { status: 400 }
      );
    }

    const inputText = [title, bodyText].filter(Boolean).join("\n").slice(0, 2000);

    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_TEXT_MODEL}:generateContent`;
      const geminiResp = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `다음 기사의 내용을 보고 이미지 검색에 사용할 영어 키워드를 3~5개 추출해주세요.
키워드는 Pexels 이미지 검색에 최적화된 명사/구문으로, 시각적으로 표현 가능한 것이어야 합니다.
반드시 JSON 배열 형식으로만 답하세요. 예: ["culture", "art exhibition", "people", "museum"]

기사 내용:
${inputText}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 200,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      const geminiData = await geminiResp.json().catch(() => ({}));
      if (geminiData.error) {
        console.error("[image-search] Gemini error:", geminiData.error.message);
        return NextResponse.json(
          { success: false, error: "키워드 추출 중 오류가 발생했습니다." },
          { status: 400 }
        );
      }

      const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      // JSON 배열 파싱 (마크다운 코드블록 제거)
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          keywords = parsed.filter((k): k is string => typeof k === "string").slice(0, 5);
        }
      } catch {
        // 파싱 실패 시 텍스트에서 단어 추출
        keywords = cleaned
          .replace(/[\[\]"]/g, "")
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
          .slice(0, 5);
      }

      if (keywords.length === 0) {
        keywords = ["culture", "art", "people"];
      }
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      if (isTimeout) {
        return NextResponse.json(
          { success: false, error: "키워드 추출 시간이 초과되었습니다. 다시 시도해주세요." },
          { status: 504 }
        );
      }
      console.error("[image-search] Gemini fetch error:", error);
      return NextResponse.json({ success: false, error: "키워드 추출 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  // Pexels 이미지 검색
  const searchQuery = keywords.join(" ");
  try {
    const pexelsResp = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=9&orientation=landscape`,
      {
        headers: { Authorization: pexelsKey },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!pexelsResp.ok) {
      const errText = await pexelsResp.text().catch(() => "");
      console.error("[image-search] Pexels error:", pexelsResp.status, errText);
      return NextResponse.json(
        { success: false, error: pexelsResp.status === 401 ? "Pexels API 키가 올바르지 않습니다." : "이미지 검색 중 오류가 발생했습니다." },
        { status: 400 }
      );
    }

    const pexelsData: PexelsResponse = await pexelsResp.json();
    const images = (pexelsData.photos || []).map((photo) => ({
      id: photo.id,
      url: photo.src.large,
      thumb: photo.src.medium,
      alt: photo.alt || keywords[0] || "image",
      photographer: photo.photographer,
      pexelsUrl: photo.url,
    }));

    return NextResponse.json({ success: true, keywords, images });
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    if (isTimeout) {
      return NextResponse.json(
        { success: false, error: "이미지 검색 시간이 초과되었습니다. 다시 시도해주세요." },
        { status: 504 }
      );
    }
    console.error("[image-search] Pexels fetch error:", error);
    return NextResponse.json({ success: false, error: "이미지 검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
