/**
 * 뉴스와이어(newswire.co.kr) 전용 본문/이미지/메타데이터 추출기
 *
 * 뉴스와이어 기사 페이지(newsRead.php)의 고유 HTML 구조에 특화된 파서.
 * 범용 html-extract.ts는 section.article_column 구조를 제대로 잡지 못하므로
 * 전용 파서가 필요하다.
 */
import { toPlainText } from "@/lib/html-extract";
import { decodeHtmlEntities } from "@/lib/html-utils";

/** 뉴스와이어 기사 URL인지 확인 */
export function isNewswireUrl(url: string): boolean {
  return url.includes("newswire.co.kr/newsRead.php");
}

/** 뉴스와이어 이미지 URL을 고해상도 원본으로 변환 */
function toHighResNewswireImage(url: string): string {
  return url
    .replace("/thumb_640/", "/data/")
    .replace("/thumb_480/", "/data/")
    .replace("/thumb/", "/data/");
}

export interface NewswireExtractResult {
  title: string;
  bodyHtml: string;
  bodyText: string;
  date: string;
  images: string[];
  sourceUrl: string;
  author: string;
  keywords: string[];
}

/**
 * 뉴스와이어 기사 HTML에서 본문/이미지/메타데이터를 추출한다.
 *
 * @param html - 뉴스와이어 newsRead.php 페이지의 전체 HTML
 * @param finalUrl - 최종 URL (리다이렉트 후)
 * @returns 추출 결과 또는 null (본문 영역을 찾을 수 없는 경우)
 */
export function extractNewswireArticle(
  html: string,
  finalUrl: string
): NewswireExtractResult | null {
  // 1. 제목: og:title에서 " - 뉴스와이어" 접미사 제거
  const ogTitle =
    html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ??
    html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  const title = ogTitle
    ? decodeHtmlEntities(ogTitle[1].replace(/\s*-\s*뉴스와이어$/, "").trim())
    : "";

  // 2. 날짜: article:published_time 또는 div.release-time
  const pubTime =
    html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i) ??
    html.match(/<meta[^>]+content="([^"]+)"[^>]+property="article:published_time"/i);
  let date = pubTime ? pubTime[1].trim() : "";
  if (!date) {
    const releaseTime = html.match(/<div\s+class="release-time"[^>]*>([^<]+)<\/div>/i);
    if (releaseTime) date = releaseTime[1].trim();
  }

  // 3. 작성자: meta[name="author"]
  const authorMeta =
    html.match(/<meta[^>]+name="author"[^>]+content="([^"]+)"/i) ??
    html.match(/<meta[^>]+content="([^"]+)"[^>]+name="author"/i);
  const author = authorMeta ? decodeHtmlEntities(authorMeta[1].trim()) : "";

  // 4. 키워드: meta[name="news_keywords"]
  const kwMeta =
    html.match(/<meta[^>]+name="news_keywords"[^>]+content="([^"]+)"/i) ??
    html.match(/<meta[^>]+content="([^"]+)"[^>]+name="news_keywords"/i);
  const keywords = kwMeta
    ? kwMeta[1].split(",").map((k) => k.trim()).filter(Boolean)
    : [];

  // 5. 본문: section.article_column 추출
  const articleMatch = html.match(
    /<section\s+class="article_column">([\s\S]*?)<\/section>/i
  );
  if (!articleMatch) return null;

  let body = articleMatch[1];

  // 6. 불필요 영역 제거: release-contact부터 끝까지 잘라냄
  const contactIdx = body.indexOf('<div class="release-contact">');
  if (contactIdx > -1) {
    body = body.slice(0, contactIdx);
  }
  // 안전 제거: release-source-news, release-source (contactIdx 이전에 있을 수도 있으므로)
  body = body.replace(/<div\s+class="release-source-news">[\s\S]*$/gi, "");
  body = body.replace(/<div\s+class="release-source">[\s\S]*?<\/div>/gi, "");

  // 7. 뉴스와이어 바이라인 제거
  // HTML 버전: "XXX--(<a href="...">뉴스와이어</a>)--"
  body = body.replace(/[^<]*--\(<a[^>]*>뉴스와이어<\/a>\)--/g, "");
  // 텍스트 버전: "XXX--(뉴스와이어)--"
  body = body.replace(/[^<]*--\(뉴스와이어\)--/g, "");

  // 8. 이미지 추출: data-src(원본 고해상도) 우선
  const images: string[] = [];
  const dataSrcRegex = /data-src="(https:\/\/file\.newswire\.co\.kr[^"]+)"/gi;
  let dsMatch;
  while ((dsMatch = dataSrcRegex.exec(body)) !== null) {
    const url = dsMatch[1];
    if (!images.includes(url)) images.push(url);
  }

  // fallback: img src에서 추출 (thumb 제외)
  if (images.length === 0) {
    const imgSrcRegex = /<img[^>]+src=["'](https:\/\/file\.newswire\.co\.kr[^"']+)["'][^>]*>/gi;
    let isMatch;
    while ((isMatch = imgSrcRegex.exec(body)) !== null) {
      const url = isMatch[1];
      if (!url.includes("/thumb/") && !images.includes(url)) {
        images.push(url);
      }
    }
  }

  // OG 이미지도 포함 (fallback, 고해상도 변환)
  const ogImg =
    html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ??
    html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  if (ogImg) {
    const hiRes = toHighResNewswireImage(ogImg[1]);
    if (!images.includes(hiRes)) images.unshift(hiRes);
  }

  // 9. images_column 복잡 구조를 단순 <figure><img> 로 변환
  body = body.replace(
    /<div\s+class="images_column[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi,
    (match) => {
      const dataSrc = match.match(/data-src="([^"]+)"/);
      const alt = match.match(/alt="([^"]*)"/);
      if (dataSrc) {
        return `<figure><img src="${dataSrc[1]}" alt="${alt?.[1] || ""}" style="max-width:100%;height:auto;" /></figure>`;
      }
      // data-src 없으면 img src에서
      const imgSrc = match.match(/<img[^>]+src="([^"]+)"/);
      if (imgSrc && !imgSrc[1].includes("/thumb/")) {
        return `<figure><img src="${imgSrc[1]}" alt="${alt?.[1] || ""}" style="max-width:100%;height:auto;" /></figure>`;
      }
      return "";
    }
  );

  // 10. 스크립트/스타일 제거
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // 11. 불필요한 빈 줄 정리
  body = body.replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>").trim();

  const bodyText = toPlainText(body);

  return {
    title,
    bodyHtml: body,
    bodyText,
    date,
    images,
    sourceUrl: finalUrl,
    author,
    keywords,
  };
}
