import { NextRequest, NextResponse } from "next/server";

// 허용 프로토콜만 허용, 내부 IP 차단 (SSRF 방어)
function isSafeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
  if (h === "metadata.google.internal") return false;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

// HTML 엔티티 디코딩
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// 제목 추출 (우선순위: og:title > h1 > title 태그)
function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  if (og) return decodeHtmlEntities(og[1].trim());

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeHtmlEntities(h1[1].replace(/<[^>]+>/g, "").trim());

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) return decodeHtmlEntities(title[1].replace(/\s*[-|]\s*.*$/, "").trim());

  return "";
}

// 날짜 추출 (og:article:published_time > meta > JSON-LD)
function extractDate(html: string): string {
  // og:article:published_time
  const ogDate = html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="article:published_time"/i);
  if (ogDate) return ogDate[1].trim();

  // JSON-LD datePublished
  const jsonld = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonld) {
    for (const block of jsonld) {
      const content = block.replace(/<[^>]+>/g, "");
      const dateMatch = content.match(/"datePublished"\s*:\s*"([^"]+)"/);
      if (dateMatch) return dateMatch[1];
    }
  }

  // meta name=date / pubdate
  const metaDate = html.match(/<meta[^>]+name="(?:date|pubdate|publishdate|publish_date)"[^>]+content="([^"]+)"/i);
  if (metaDate) return metaDate[1].trim();

  return "";
}

// 썸네일 추출 (og:image 우선)
function extractThumbnail(html: string, baseUrl: string): string {
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  if (og) {
    const url = og[1].trim();
    if (url.startsWith("http")) return url;
    try { return new URL(url, baseUrl).href; } catch { return ""; }
  }
  return "";
}

// 본문 추출 (article/main 태그 우선, 없으면 body)
function extractBodyHtml(html: string, baseUrl: string): string {
  // script/style/nav/header/footer/aside 제거
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  // article 태그 내용 추출 시도
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  let bodyFragment = articleMatch ? articleMatch[1] : "";

  // main 태그 시도
  if (!bodyFragment) {
    const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    bodyFragment = mainMatch ? mainMatch[1] : "";
  }

  // role=main 시도
  if (!bodyFragment) {
    const roleMain = cleaned.match(/<[^>]+role="main"[^>]*>([\s\S]*?)<\/(?:div|section|main)>/i);
    bodyFragment = roleMain ? roleMain[1] : "";
  }

  // 콘텐츠 영역 클래스 휴리스틱
  if (!bodyFragment) {
    const contentClass = cleaned.match(/<(?:div|section)[^>]+(?:class|id)="[^"]*(?:article|content|body|text|news|story)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/i);
    bodyFragment = contentClass ? contentClass[1] : "";
  }

  if (!bodyFragment) bodyFragment = cleaned;

  // 상대 URL → 절대 URL 변환
  return bodyFragment
    .replace(/\bsrc="([^"]*)"/gi, (_, src) => {
      if (!src || src.startsWith("http") || src.startsWith("data:")) return `src="${src}"`;
      try { return `src="${new URL(src, baseUrl).href}"`; } catch { return `src="${src}"`; }
    })
    .replace(/\bhref="([^"]*)"/gi, (_, href) => {
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return `href="${href}"`;
      try { return `href="${new URL(href, baseUrl).href}"`; } catch { return `href="${href}"`; }
    })
    .trim();
}

// 본문 텍스트 변환
function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 이미지 추출
function extractImages(html: string): string[] {
  const images: string[] = [];
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
  let m;
  while ((m = imgRegex.exec(html)) !== null) {
    const src = m[1];
    if (src && !src.includes("icon") && !src.includes("btn") && !src.includes("logo") && !src.startsWith("data:")) {
      images.push(src);
    }
  }
  return [...new Set(images)];
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
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CulturepeopleBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });

    if (!resp.ok) {
      return NextResponse.json(
        { success: false, error: `원문 페이지 응답 오류: ${resp.status}` },
        { status: 502 }
      );
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return NextResponse.json({ success: false, error: "HTML 페이지가 아닙니다." }, { status: 400 });
    }

    const html = await resp.text();
    const finalUrl = resp.url || url;

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
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[netpro/origin]", url, msg);
    return NextResponse.json(
      { success: false, error: "원문을 가져오는데 실패했습니다." },
      { status: 500 }
    );
  }
}
