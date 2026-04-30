/**
 * /api/press-feed/detail — 개별 기사 URL에서 본문 추출
 *
 * Query params:
 *   url: 기사 원문 URL
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { isNewswireUrl, extractNewswireArticle } from "@/lib/newswire-extract";
import { extractKoreaPressArticle, isKoreaKrUrl } from "@/lib/korea-press-extract";
import {
  extractTitle, extractDate, extractBodyHtml,
  toPlainText, extractImages, extractThumbnail,
} from "@/lib/html-extract";
import { decodeHtmlEntities } from "@/lib/html-utils";
import { getPressFeedByUrl } from "@/lib/cockroach-db";
import { assertSafeRemoteUrl, isPlausiblySafeRemoteUrl, safeFetch } from "@/lib/safe-remote-url";

const KOREA_RSS_BY_PATH: Array<{ path: string; feed: string }> = [
  { path: "pressReleaseView.do", feed: "https://www.korea.kr/rss/pressrelease.xml" },
  { path: "policyNewsView.do", feed: "https://www.korea.kr/rss/policy.xml" },
  { path: "actuallyView.do", feed: "https://www.korea.kr/rss/fact.xml" },
  { path: "reporterView.do", feed: "https://www.korea.kr/rss/reporter.xml" },
  { path: "ebriefingView.do", feed: "https://www.korea.kr/rss/ebriefing.xml" },
];

function normalizeRssValue(value: string): string {
  return decodeHtmlEntities(value.trim());
}

function extractRssTag(block: string, tag: string): string {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdata = block.match(cdataRe);
  if (cdata) return normalizeRssValue(cdata[1]);

  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const plain = block.match(plainRe);
  return plain ? normalizeRssValue(plain[1]) : "";
}

function sameKoreaArticle(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const aNewsId = a.searchParams.get("newsId");
    const bNewsId = b.searchParams.get("newsId");
    if (aNewsId && bNewsId) return aNewsId === bNewsId;
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return left === right;
  }
}

function koreaRssCandidates(articleUrl: string): string[] {
  const candidates = new Set<string>();
  const path = (() => {
    try { return new URL(articleUrl).pathname; } catch { return ""; }
  })();
  for (const item of KOREA_RSS_BY_PATH) {
    if (path.includes(item.path)) candidates.add(item.feed);
  }
  candidates.add("https://www.korea.kr/rss/pressrelease.xml");
  candidates.add("https://www.korea.kr/rss/policy.xml");
  return [...candidates];
}

async function fetchKoreaRssDescription(articleUrl: string): Promise<string> {
  for (const feedUrl of koreaRssCandidates(articleUrl)) {
    try {
      const resp = await safeFetch(feedUrl, {
        headers: { "User-Agent": "CulturePeople-Bot/1.0" },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
        maxRedirects: 5,
      });
      if (!resp.ok) continue;
      const xml = await resp.text();
      const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const link = extractRssTag(block, "link");
        if (!link || !sameKoreaArticle(link, articleUrl)) continue;
        return extractRssTag(block, "description");
      }
    } catch {
      // Try the next feed candidate.
    }
  }
  return "";
}

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
  if (!isPlausiblySafeRemoteUrl(articleUrl)) {
    return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
  }
  try {
    await assertSafeRemoteUrl(articleUrl);
  } catch {
    return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
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
    const resp = await safeFetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(15000),
      maxRedirects: 5,
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

    // korea.kr 보도자료는 바깥 HTML이 문서뷰어/첨부/저작권 UI 위주라
    // RSS description 또는 전용 본문 영역만 신뢰한다.
    if (isKoreaKrUrl(finalUrl) || isKoreaKrUrl(articleUrl)) {
      const rssDescriptionHtml = await fetchKoreaRssDescription(articleUrl);
      const kr = extractKoreaPressArticle(html, finalUrl, { rssDescriptionHtml });
      if (kr) {
        return NextResponse.json({
          success: true,
          title: kr.title,
          bodyHtml: kr.bodyHtml,
          bodyText: kr.bodyText,
          date: kr.date,
          writer: "",
          images: kr.images,
          sourceUrl: kr.sourceUrl,
          outboundLinks: [],
        });
      }
      return NextResponse.json({
        success: false,
        error: "정부 보도자료 본문을 신뢰할 수 없어 등록하지 않았습니다.",
      }, { status: 422 });
    }

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
