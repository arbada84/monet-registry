import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";

interface SeoSettings {
  indexNowApiKey?: string;
  canonicalUrl?: string;
}

// POST /api/seo/index-now
// body: { url: string, action: "URL_UPDATED" | "URL_DELETED" }
export async function POST(request: NextRequest) {
  try {
    const { url, action } = await request.json() as { url: string; action: "URL_UPDATED" | "URL_DELETED" };

    if (!url) {
      return NextResponse.json({ success: false, error: "url is required" }, { status: 400 });
    }

    const seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
    const indexNowKey = seoSettings.indexNowApiKey;

    if (!indexNowKey) {
      // IndexNow 키 미설정 시 skip
      return NextResponse.json({ success: true, skipped: true, reason: "IndexNow API 키가 설정되지 않았습니다." });
    }

    const baseUrl =
      seoSettings.canonicalUrl?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "https://culturepeople.co.kr";

    const host = new URL(baseUrl).hostname;
    const keyLocation = `${baseUrl}/${indexNowKey}.txt`;

    // IndexNow 프로토콜: Bing, Yandex, Naver 등 지원
    const indexNowPayload = {
      host,
      key: indexNowKey,
      keyLocation,
      urlList: [url],
    };

    const indexNowRes = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowPayload),
    });

    // IndexNow는 202 Accepted를 반환하면 성공
    const indexNowSuccess = indexNowRes.status === 200 || indexNowRes.status === 202;

    // TODO: Google Indexing API 구현
    // Google Indexing API는 서비스 계정 JWT 인증이 필요한 복잡한 과정을 거칩니다.
    // 구현 단계:
    // 1. seoSettings.googleIndexingServiceAccount에서 서비스 계정 JSON 파싱
    // 2. JWT 토큰 생성 (RS256 서명)
    // 3. Google OAuth2 토큰 엔드포인트에서 액세스 토큰 획득
    // 4. https://indexing.googleapis.com/v3/urlNotifications:publish 호출
    // 현재는 IndexNow만 구현되어 있습니다.

    return NextResponse.json({
      success: true,
      indexNow: {
        submitted: indexNowSuccess,
        status: indexNowRes.status,
        url,
        action,
      },
    });
  } catch (e) {
    console.error("[seo/index-now] error:", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
