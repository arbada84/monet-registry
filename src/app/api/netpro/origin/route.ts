import { NextRequest, NextResponse } from "next/server";
import {
  extractTitle, extractDate, extractThumbnail,
  extractBodyHtml, toPlainText, extractImages,
} from "@/lib/html-extract";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { decodeHtmlEntities } from "@/lib/html-utils";
import { fetchKoreaPressDocumentBodyHtml } from "@/lib/korea-press-document";
import { extractKoreaPressArticle, isKoreaKrUrl } from "@/lib/korea-press-extract";
import { readResponseText } from "@/lib/response-text";
import { assertSafeRemoteUrl, isPlausiblySafeRemoteUrl, safeFetch } from "@/lib/safe-remote-url";

const KOREA_RSS_BY_PATH: Array<{ path: string; feed: string }> = [
  { path: "pressReleaseView.do", feed: "https://www.korea.kr/rss/pressrelease.xml" },
  { path: "policyNewsView.do", feed: "https://www.korea.kr/rss/policy.xml" },
  { path: "actuallyView.do", feed: "https://www.korea.kr/rss/fact.xml" },
  { path: "reporterView.do", feed: "https://www.korea.kr/rss/reporter.xml" },
  { path: "ebriefingView.do", feed: "https://www.korea.kr/rss/ebriefing.xml" },
];

interface KoreaRssArticle {
  title: string;
  link: string;
  date: string;
  descriptionHtml: string;
}

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
    try {
      return new URL(articleUrl).pathname;
    } catch {
      return "";
    }
  })();
  for (const item of KOREA_RSS_BY_PATH) {
    if (path.includes(item.path)) candidates.add(item.feed);
  }
  candidates.add("https://www.korea.kr/rss/pressrelease.xml");
  candidates.add("https://www.korea.kr/rss/policy.xml");
  return [...candidates];
}

function normalizeKoreaRssDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

async function fetchKoreaRssArticle(articleUrl: string): Promise<KoreaRssArticle | null> {
  for (const feedUrl of koreaRssCandidates(articleUrl)) {
    try {
      const resp = await fetchWithRetry(feedUrl, {
        headers: { "User-Agent": "CulturePeople-Bot/1.0" },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
        maxRetries: 2,
        retryDelayMs: 1000,
        safeRemote: true,
        safeMaxRedirects: 5,
      });
      if (!resp.ok) continue;
      const xml = await readResponseText(resp);
      const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const link = extractRssTag(block, "link");
        if (!link || !sameKoreaArticle(link, articleUrl)) continue;
        return {
          title: extractRssTag(block, "title"),
          link,
          date: normalizeKoreaRssDate(extractRssTag(block, "pubDate") || extractRssTag(block, "dc:date")),
          descriptionHtml: extractRssTag(block, "description"),
        };
      }
    } catch {
      // Try the next Korea.kr RSS candidate.
    }
  }
  return null;
}

function createKoreaOriginResponse(
  article: NonNullable<ReturnType<typeof extractKoreaPressArticle>>,
  rssArticle?: KoreaRssArticle | null,
) {
  const images = article.images || [];
  return NextResponse.json({
    success: true,
    url: article.sourceUrl || rssArticle?.link || "",
    title: article.title || rssArticle?.title || "",
    date: article.date || rssArticle?.date || "",
    thumbnail: images[0] || "",
    bodyHtml: article.bodyHtml,
    bodyText: article.bodyText,
    images,
  });
}

function extractKoreaRssFallback(articleUrl: string, rssArticle?: KoreaRssArticle | null) {
  if (!rssArticle?.descriptionHtml) return null;
  return extractKoreaPressArticle("", articleUrl, { rssDescriptionHtml: rssArticle.descriptionHtml });
}

// 허용 프로토콜만 허용, 내부 IP 차단 (SSRF 방어)
function isSafeUrl(rawUrl: string): boolean {
  return isPlausiblySafeRemoteUrl(rawUrl);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";

  if (!url) {
    return NextResponse.json({ success: false, error: "url 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!isSafeUrl(url)) {
    return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
  }

  try {
    await assertSafeRemoteUrl(url);
  } catch {
    return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
  }

  const isKoreaArticle = isKoreaKrUrl(url);
  const koreaRssArticle = isKoreaArticle ? await fetchKoreaRssArticle(url) : null;
  const koreaFallback = () => {
    const fallback = extractKoreaRssFallback(url, koreaRssArticle);
    return fallback ? createKoreaOriginResponse(fallback, koreaRssArticle) : null;
  };

  try {
    const fetchHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    };
    const resp = await safeFetch(url, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(15000),
      maxRedirects: 5,
    });
    // SSRF 방어: 리다이렉트 후 최종 URL이 내부 네트워크가 아닌지 검증
    if (resp.redirected && resp.url) {
      if (!isSafeUrl(resp.url)) {
        return NextResponse.json({ success: false, error: "허용되지 않는 URL로 리다이렉트되었습니다." }, { status: 400 });
      }
    }

    if (!resp.ok) {
      const fallback = koreaFallback();
      if (fallback) return fallback;
      return NextResponse.json(
        { success: false, error: `원문 페이지 응답 오류: ${resp.status}` },
        { status: 502 }
      );
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      const fallback = koreaFallback();
      if (fallback) return fallback;
      return NextResponse.json({ success: false, error: "HTML 페이지가 아닙니다." }, { status: 400 });
    }

    const html = await readResponseText(resp);
    const finalUrl = resp.url || url;

    if (isKoreaKrUrl(finalUrl) || isKoreaArticle) {
      const documentBodyHtml = koreaRssArticle?.descriptionHtml
        ? ""
        : await fetchKoreaPressDocumentBodyHtml(html, finalUrl);
      const koreaArticle = extractKoreaPressArticle(html, finalUrl, {
        rssDescriptionHtml: koreaRssArticle?.descriptionHtml ?? "",
        documentBodyHtml,
      });
      if (koreaArticle) return createKoreaOriginResponse(koreaArticle, koreaRssArticle);
      const fallback = koreaFallback();
      if (fallback) return fallback;
      return NextResponse.json(
        { success: false, error: "정부 보도자료 본문을 추출할 수 없습니다." },
        { status: 422 }
      );
    }

    const title = extractTitle(html);
    const date = extractDate(html);
    const thumbnail = extractThumbnail(html, finalUrl);
    const bodyHtml = extractBodyHtml(html, finalUrl);
    const bodyText = toPlainText(bodyHtml);
    const images = extractImages(bodyHtml);
    if (thumbnail && !images.includes(thumbnail)) images.unshift(thumbnail);

    return NextResponse.json({
      success: true,
      url: finalUrl,
      title,
      date,
      thumbnail,
      bodyHtml,
      bodyText,
      images,
    });
  } catch (error) {
    const fallback = koreaFallback();
    if (fallback) return fallback;
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[netpro/origin]", url, msg);
    return NextResponse.json(
      { success: false, error: "원문을 가져오는데 실패했습니다." },
      { status: 500 }
    );
  }
}
