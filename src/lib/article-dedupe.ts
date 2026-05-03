export type ArticleDuplicateReason = "source_url" | "title";

export interface ArticleDedupeInput {
  id?: string | null;
  no?: number | null;
  title?: string | null;
  sourceUrl?: string | null;
}

export interface ArticleDuplicateCandidate {
  id?: string;
  no?: number;
  title?: string;
  sourceUrl?: string;
  reason: ArticleDuplicateReason;
  normalizedValue: string;
}

export class ArticleDuplicateError extends Error {
  duplicate: ArticleDuplicateCandidate;

  constructor(duplicate: ArticleDuplicateCandidate) {
    const ref = duplicate.no ? `#${duplicate.no}` : duplicate.id || "unknown";
    super(`DUPLICATE_ARTICLE: 기존 기사(${ref})와 ${duplicate.reason === "source_url" ? "원문 URL" : "제목"}이 중복됩니다.`);
    this.name = "ArticleDuplicateError";
    this.duplicate = duplicate;
  }
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "yclid",
  "mc_cid",
  "mc_eid",
  "source",
  "sourceType",
  "source_type",
  "ref",
  "referer",
]);

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function isTrackingParam(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_PARAMS.has(key) || TRACKING_PARAMS.has(normalized);
}

export function normalizeArticleSourceUrl(value?: string | null): string {
  const raw = decodeBasicEntities(String(value || "").trim());
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    const params = [...url.searchParams.entries()]
      .filter(([key, paramValue]) => !isTrackingParam(key) && String(paramValue || "").trim() !== "")
      .sort(([aKey, aValue], [bKey, bValue]) => `${aKey}=${aValue}`.localeCompare(`${bKey}=${bValue}`));
    url.search = "";
    for (const [key, paramValue] of params) {
      url.searchParams.append(key, String(paramValue).trim());
    }

    const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/g, "");
    return `${url.protocol}//${url.host}${pathname}${url.search}`.normalize("NFC");
  } catch {
    return raw
      .replace(/#.*$/, "")
      .replace(/[?&](utm_[^=&]+|fbclid|gclid|sourceType|source_type|ref|referer)=[^&]*/gi, "")
      .replace(/[?&]$/, "")
      .replace(/\/+$/g, "")
      .toLowerCase()
      .normalize("NFC");
  }
}

export function stripHtmlToPlainText(value?: string | null): string {
  return decodeBasicEntities(String(value || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeArticleTitle(value?: string | null): string {
  return stripHtmlToPlainText(value)
    .replace(/\s*-\s*뉴스와이어\s*$/i, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .normalize("NFC");
}

export function normalizeArticleText(value?: string | null): string {
  return stripHtmlToPlainText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .normalize("NFC");
}

function makeBigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) {
    grams.push(value.slice(i, i + 2));
  }
  return grams;
}

export function textSimilarity(a?: string | null, b?: string | null): number {
  const left = normalizeArticleText(a);
  const right = normalizeArticleText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftGrams = makeBigrams(left);
  const rightGrams = makeBigrams(right);
  const rightCounts = new Map<string, number>();
  for (const gram of rightGrams) {
    rightCounts.set(gram, (rightCounts.get(gram) || 0) + 1);
  }

  let intersection = 0;
  for (const gram of leftGrams) {
    const count = rightCounts.get(gram) || 0;
    if (count > 0) {
      intersection += 1;
      rightCounts.set(gram, count - 1);
    }
  }
  return (2 * intersection) / (leftGrams.length + rightGrams.length);
}

export function findDuplicateArticleCandidate(
  input: ArticleDedupeInput,
  candidates: ArticleDedupeInput[],
): ArticleDuplicateCandidate | null {
  const inputId = String(input.id || "");
  const inputSource = normalizeArticleSourceUrl(input.sourceUrl);
  const inputTitle = normalizeArticleTitle(input.title);

  for (const candidate of candidates) {
    if (inputId && candidate.id && String(candidate.id) === inputId) continue;

    const candidateSource = normalizeArticleSourceUrl(candidate.sourceUrl);
    if (inputSource && candidateSource && inputSource === candidateSource) {
      return {
        id: candidate.id ? String(candidate.id) : undefined,
        no: candidate.no ?? undefined,
        title: candidate.title ?? undefined,
        sourceUrl: candidate.sourceUrl ?? undefined,
        reason: "source_url",
        normalizedValue: inputSource,
      };
    }

    const candidateTitle = normalizeArticleTitle(candidate.title);
    if (inputTitle.length >= 8 && candidateTitle && inputTitle === candidateTitle) {
      return {
        id: candidate.id ? String(candidate.id) : undefined,
        no: candidate.no ?? undefined,
        title: candidate.title ?? undefined,
        sourceUrl: candidate.sourceUrl ?? undefined,
        reason: "title",
        normalizedValue: inputTitle,
      };
    }
  }

  return null;
}

export function isSubstantiallyEdited(input: {
  sourceText: string;
  editedHtml: string;
  minSourceChars?: number;
  maxSimilarity?: number;
}): { ok: boolean; similarity: number; reason?: string } {
  const source = normalizeArticleText(input.sourceText);
  const edited = normalizeArticleText(input.editedHtml);
  const minSourceChars = input.minSourceChars ?? 160;
  const maxSimilarity = input.maxSimilarity ?? 0.94;

  if (!source || !edited) {
    return { ok: false, similarity: 1, reason: "AI 편집 결과 본문이 비어 있습니다." };
  }

  if (source === edited) {
    return { ok: false, similarity: 1, reason: "AI 편집 결과가 원문과 동일합니다." };
  }

  const shorter = Math.min(source.length, edited.length);
  const longer = Math.max(source.length, edited.length);
  if (shorter >= 80 && longer > 0) {
    const coverage = shorter / longer;
    if (coverage >= 0.9 && (source.includes(edited) || edited.includes(source))) {
      return { ok: false, similarity: coverage, reason: "AI 편집 결과가 원문을 거의 그대로 포함합니다." };
    }
  }

  const similarity = textSimilarity(source, edited);
  if (source.length >= minSourceChars && edited.length >= minSourceChars && similarity >= maxSimilarity) {
    return {
      ok: false,
      similarity,
      reason: `AI 편집 결과의 원문 유사도가 너무 높습니다(${Math.round(similarity * 100)}%).`,
    };
  }

  return { ok: true, similarity };
}
