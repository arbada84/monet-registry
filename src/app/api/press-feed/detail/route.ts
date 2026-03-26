/**
 * /api/press-feed/detail — 개별 기사 URL에서 본문 추출
 *
 * Query params:
 *   url: 기사 원문 URL
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { isNewswireUrl, extractNewswireArticle } from "@/lib/newswire-extract";
import {
  extractTitle, extractDate, extractBodyHtml,
  toPlainText, extractImages, extractThumbnail,
} from "@/lib/html-extract";
import { getPressFeedByUrl } from "@/lib/cockroach-db";

export async function GET(req: NextRequest) {
  // 인증 확인
  const cookie = req.cookies.get("cp-admin-auth");
  const auth = await verifyAuthToken(cookie?.value ?? "");
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: "인증 필요" }, { status: 401 });
  }

  const articleUrl = req.nextUrl.searchParams.get("url");
  if (!articleUrl) {
    return NextResponse.json({ success: false, error: "url 파라미터 필요" }, { status: 400 });
  }

  // URL 검증 (SSRF 방어)
  try {
    const parsed = new URL(articleUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ success: false, error: "잘못된 URL" }, { status: 400 });
    }
    // 내부 네트워크 접근 차단
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("172.") ||
      hostname.endsWith(".local")
    ) {
      return NextResponse.json({ success: false, error: "내부 네트워크 접근 불가" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ success: false, error: "잘못된 URL" }, { status: 400 });
  }

  // CockroachDB에서 body_html 우선 조회
  try {
    const feed = await getPressFeedByUrl(articleUrl);
    if (feed?.body_html) {
      return NextResponse.json({
        success: true,
        title: feed.title,
        bodyHtml: feed.body_html,
        bodyText: feed.body_html.replace(/<[^>]+>/g, ""),
        date: feed.date || "",
        writer: feed.company || "",
        images: feed.images || [],
        sourceUrl: feed.url,
        outboundLinks: [],
      });
    }
  } catch (e) {
    console.warn("[press-feed/detail] CockroachDB 조회 실패, 원문 fetch fallback:", e instanceof Error ? e.message : e);
  }

  // 원문 fetch fallback
  try {
    const resp = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!resp.ok) {
      return NextResponse.json({ success: false, error: `원문 서버 응답 오류: ${resp.status}` }, { status: 502 });
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return NextResponse.json({ success: false, error: "HTML이 아닌 콘텐츠" }, { status: 400 });
    }

    const html = await resp.text();
    const finalUrl = resp.url || articleUrl;

    // 뉴스와이어 전용 파서
    if (isNewswireUrl(finalUrl) || isNewswireUrl(articleUrl)) {
      const nw = extractNewswireArticle(html, finalUrl);
      if (nw) {
        return NextResponse.json({
          success: true,
          title: nw.title,
          bodyHtml: nw.bodyHtml,
          bodyText: nw.bodyText,
          date: nw.date,
          writer: nw.author,
          images: nw.images,
          sourceUrl: nw.sourceUrl,
          outboundLinks: [],
        });
      }
    }

    // 범용 HTML 추출
    const title = extractTitle(html);
    const date = extractDate(html);
    const bodyHtml = extractBodyHtml(html, finalUrl);
    const bodyText = toPlainText(bodyHtml);
    const images = extractImages(bodyHtml);
    const thumbnail = extractThumbnail(html, finalUrl);
    if (thumbnail && !images.includes(thumbnail)) {
      images.unshift(thumbnail);
    }

    return NextResponse.json({
      success: true,
      title,
      bodyHtml,
      bodyText,
      date,
      writer: "",
      images,
      sourceUrl: finalUrl,
      outboundLinks: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ success: false, error: `원문 추출 실패: ${message}` }, { status: 500 });
  }
}
