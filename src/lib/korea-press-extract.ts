/**
 * korea.kr press-release extraction helpers.
 *
 * korea.kr press-release pages often render the actual document inside a
 * document-viewer iframe, while the outer page contains breadcrumbs, attachment
 * lists, copyright notices, and previous/next article widgets. The RSS
 * description is usually the safest article-body source for those pages.
 */
import { extractDate, extractImages, extractTitle, toPlainText } from "@/lib/html-extract";
import { decodeHtmlEntities } from "@/lib/html-utils";
import { filterPressImageUrls } from "@/lib/press-image-policy";

export interface KoreaPressExtractResult {
  title: string;
  bodyHtml: string;
  bodyText: string;
  date: string;
  images: string[];
  sourceUrl: string;
}

export interface KoreaPressAttachment {
  url: string;
  label: string;
  extension: string;
}

const DANGEROUS_PROTOCOLS = /^(javascript|data|vbscript|blob):/i;
const KOREA_HOST_RE = /(^|\.)korea\.kr$/i;

export function isKoreaKrUrl(url: string): boolean {
  try {
    return KOREA_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function normalizeEntities(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&middot;/gi, "·")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&ldquo;/gi, "\"")
    .replace(/&rdquo;/gi, "\"")
    .replace(/&rarr;/gi, "→");
}

function absolutizeUrl(value: string, baseUrl: string): string {
  const url = normalizeEntities(value).trim();
  if (!url || DANGEROUS_PROTOCOLS.test(url)) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return "";
  }
}

function normalizeRemoteAttributes(html: string, baseUrl: string): string {
  return html
    .replace(/\bsrc=(["'])(.*?)\1/gi, (_match, _quote, src) => `src="${absolutizeUrl(src, baseUrl)}"`)
    .replace(/\bhref=(["'])(.*?)\1/gi, (_match, _quote, href) => {
      const next = absolutizeUrl(href, baseUrl);
      return `href="${next || "#"}"`;
    });
}

function stripUiImages(html: string): string {
  return html
    .replace(/<a\b[^>]*>\s*<img\b[^>]*(?:btn_textview|icon_logo|\/rss\/)[^>]*>\s*<\/a>/gi, "")
    .replace(/<img\b[^>]*(?:btn_textview|icon_logo|\/rss\/)[^>]*>/gi, "");
}

function stripUnsafeAndNoisyMarkup(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<button[\s\S]*?<\/button>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/\son\w+=(["']).*?\1/gi, "")
    .replace(/\s(?:class|style|role|id|data-[\w-]+)=(["']).*?\1/gi, "");
}

function unwrapInlineNoise(html: string): string {
  return html
    .replace(/<span\b[^>]*>\s*(?:&nbsp;|\s)*<\/span>/gi, "")
    .replace(/<\/?span\b[^>]*>/gi, "")
    .replace(/<\/?font\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>/gi, "")
    .replace(/<\/a>/gi, "");
}

function normalizeParagraphs(html: string): string {
  return html
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .replace(/<p>\s*(?:<br\s*\/?>|\s|&nbsp;)*<\/p>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

export function cleanKoreaPressBodyHtml(rawHtml: string, baseUrl: string): string {
  let body = normalizeEntities(rawHtml);

  // RSS descriptions append a korea.kr source-logo footer after the article.
  body = body.replace(/(?:<br\s*\/?>\s*)?\[\s*자료제공\s*:[\s\S]*$/i, "");
  body = stripUiImages(body);
  body = stripUnsafeAndNoisyMarkup(body);
  body = unwrapInlineNoise(body);
  body = normalizeRemoteAttributes(body, baseUrl);
  body = normalizeParagraphs(body);
  return body;
}

function textLooksLikePageShell(text: string): boolean {
  const noisyMarkers = [
    "사이트 이동경로",
    "본문 듣기 시작",
    "글자크기 설정",
    "첨부파일",
    "저작권정책",
    "이전다음기사",
    "실시간 인기뉴스",
    "정책 NOW",
  ];
  return noisyMarkers.filter((marker) => text.includes(marker)).length >= 2;
}

function isUsableBody(html: string): boolean {
  const text = toPlainText(html);
  if (text.length < 80) return false;
  if (textLooksLikePageShell(text)) return false;
  return /[가-힣]/.test(text);
}

function extractBetween(html: string, startRe: RegExp, endRe: RegExp): string {
  const start = html.search(startRe);
  if (start < 0) return "";
  const rest = html.slice(start);
  const end = rest.search(endRe);
  return end > -1 ? rest.slice(0, end) : rest;
}

function extractArticleBodyFragment(html: string): string {
  const articleBody = extractBetween(
    html,
    /<div\b[^>]+class=(["'])[^"']*\barticle_body\b[^"']*\1[^>]*>/i,
    /<div\b[^>]+class=(["'])[^"']*\barticle_footer\b[^"']*\1[^>]*>/i,
  );
  if (articleBody) return articleBody;

  return extractBetween(
    html,
    /<div\b[^>]+class=(["'])[^"']*\bview_cont\b[^"']*\1[^>]*>/i,
    /<div\b[^>]+class=(["'])[^"']*\barticle_footer\b[^"']*\1[^>]*>/i,
  );
}

export function extractKoreaPressAttachments(html: string, baseUrl: string): KoreaPressAttachment[] {
  const attachments = new Map<string, KoreaPressAttachment>();
  const anchorRegex = /<a\b[^>]+href=(["'])([^"']*\/common\/download\.do[^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const label = toPlainText(match[3]);
    const href = absolutizeUrl(match[2], baseUrl);
    if (!href) continue;
    const extMatch = label.match(/\.([a-z0-9]+)(?:\s|$)/i);
    const extension = extMatch?.[1]?.toLowerCase() ?? "";
    if (!extension) continue;
    const prev = attachments.get(href);
    if (!prev || prev.label === "내려받기") {
      attachments.set(href, { url: href, label, extension });
    }
  }
  return [...attachments.values()];
}

function extractAttachmentImages(html: string, baseUrl: string): string[] {
  return extractKoreaPressAttachments(html, baseUrl)
    .filter((item) => /^(?:jpe?g|png|gif|webp)$/i.test(item.extension))
    .map((item) => item.url);
}

function filterArticleImages(images: string[]): string[] {
  return filterPressImageUrls(images, { maxImages: 0 });
}

export function extractKoreaPressArticle(
  html: string,
  finalUrl: string,
  options: { rssDescriptionHtml?: string; documentBodyHtml?: string } = {},
): KoreaPressExtractResult | null {
  if (!isKoreaKrUrl(finalUrl)) return null;

  const candidates = [
    options.rssDescriptionHtml ? cleanKoreaPressBodyHtml(options.rssDescriptionHtml, finalUrl) : "",
    options.documentBodyHtml ? cleanKoreaPressBodyHtml(options.documentBodyHtml, finalUrl) : "",
    cleanKoreaPressBodyHtml(extractArticleBodyFragment(html), finalUrl),
  ].filter(Boolean);

  const bodyHtml = candidates.find(isUsableBody);
  if (!bodyHtml) return null;

  const bodyImages = filterArticleImages(extractImages(bodyHtml));
  const attachmentImages = extractAttachmentImages(html, finalUrl);
  const images = [...new Set([...bodyImages, ...attachmentImages])];

  return {
    title: extractTitle(html),
    bodyHtml,
    bodyText: toPlainText(bodyHtml),
    date: extractDate(html),
    images,
    sourceUrl: finalUrl,
  };
}
