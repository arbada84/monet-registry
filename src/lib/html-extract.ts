/**
 * HTML 원문 파싱 유틸리티
 * netpro/origin API와 auto-press 크론에서 공용으로 사용
 */
import { decodeHtmlEntities as sharedDecodeHtml } from "@/lib/html-utils";

/** HTML 엔티티 디코딩 (공유 유틸리티 래퍼) */
function decodeHtmlEntities(str: string): string {
  return sharedDecodeHtml(str).replace(/&nbsp;/g, " ");
}

/** 제목 추출 (우선순위: og:title > h1 > title 태그) */
export function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  if (og) return decodeHtmlEntities(og[1].trim());

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeHtmlEntities(h1[1].replace(/<[^>]+>/g, "").trim());

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) return decodeHtmlEntities(title[1].replace(/\s*[-|]\s*.*$/, "").trim());

  return "";
}

/** 날짜 추출 (og:article:published_time > meta > JSON-LD) */
export function extractDate(html: string): string {
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

/** 썸네일 추출 (og:image 우선) */
export function extractThumbnail(html: string, baseUrl: string): string {
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  if (og) {
    const url = og[1].trim();
    if (url.startsWith("http")) return url;
    try { return new URL(url, baseUrl).href; } catch { return ""; }
  }
  return "";
}

/** 본문 추출 (article/main 태그 우선, 없으면 body) */
export function extractBodyHtml(html: string, baseUrl: string): string {
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

  // 위험 프로토콜 체크 (XSS 방어)
  const DANGEROUS_PROTOCOLS = /^(javascript|data|vbscript|blob):/i;

  // 상대 URL → 절대 URL 변환
  return bodyFragment
    .replace(/\bsrc="([^"]*)"/gi, (_, src) => {
      if (!src) return `src=""`;
      if (DANGEROUS_PROTOCOLS.test(src)) return `src=""`;
      if (src.startsWith("http")) return `src="${src}"`;
      try { return `src="${new URL(src, baseUrl).href}"`; } catch { return `src=""`; }
    })
    .replace(/\bhref="([^"]*)"/gi, (_, href) => {
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return `href="${href}"`;
      if (DANGEROUS_PROTOCOLS.test(href)) return `href="#"`;
      if (href.startsWith("http")) return `href="${href}"`;
      try { return `href="${new URL(href, baseUrl).href}"`; } catch { return `href="#"`; }
    })
    .trim();
}

/** 본문 텍스트 변환 */
export function toPlainText(html: string): string {
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

/** 이미지 추출 */
export function extractImages(html: string): string[] {
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
