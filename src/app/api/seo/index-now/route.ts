import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";
import { getCanonicalUrl } from "@/lib/get-base-url";

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

    const { getBaseUrl } = await import("@/lib/get-base-url");
    const siteUrl = getBaseUrl();
    if (!url.startsWith(siteUrl)) {
      return NextResponse.json({ success: false, error: "자사 도메인 URL만 제출 가능합니다." }, { status: 400 });
    }

    const seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
    const indexNowKey = seoSettings.indexNowApiKey;

    if (!indexNowKey) {
      // IndexNow 키 미설정 시 skip
      return NextResponse.json({ success: true, skipped: true, reason: "IndexNow API 키가 설정되지 않았습니다." });
    }

    const baseUrl = getCanonicalUrl(seoSettings.canonicalUrl);

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

    // Google 일반 기사 URL은 Indexing API 대상이 아니므로 Search Console sitemap/news sitemap 제출로 처리합니다.

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
    return NextResponse.json({ success: false, error: "IndexNow 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
