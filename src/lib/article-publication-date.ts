import type { Article } from "@/types/article";

const KST_TIME_ZONE = "Asia/Seoul";

type PublicationDateArticle = Pick<Article, "date" | "createdAt" | "scheduledPublishAt">;

function dateOnlyKey(value: string | undefined): string | undefined {
  const match = String(value || "").trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function kstDateKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : undefined;
}

/**
 * Prefer a precise timestamp only when it belongs to the article's editorial date.
 * This prevents historical imports from appearing newly published at import time.
 */
export function resolveArticlePublishedAt(article: PublicationDateArticle): string {
  const rawDate = String(article.date || "").trim();
  const explicit = new Date(rawDate);
  if (/T\d{2}:\d{2}/.test(rawDate) && !Number.isNaN(explicit.getTime())) return rawDate;

  const editorialDate = dateOnlyKey(rawDate);
  if (!editorialDate) return rawDate;

  for (const candidate of [article.scheduledPublishAt, article.createdAt]) {
    if (candidate && kstDateKey(candidate) === editorialDate) return candidate;
  }

  return `${editorialDate}T00:00:00+09:00`;
}

export function formatArticlePublishedAt(article: PublicationDateArticle): string {
  const publishedAt = resolveArticlePublishedAt(article);
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return String(article.date || "");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
