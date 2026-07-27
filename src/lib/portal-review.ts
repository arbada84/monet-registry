import type { Article } from "@/types/article";

export interface PortalReviewRow {
  no: number | "";
  id: string;
  title: string;
  category: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  articleUrl: string;
  sourceUrl: string;
  aiGenerated: boolean;
  reviewType: "자체기사 후보" | "보도자료/외부출처 후보" | "AI 생성 후보";
}

export interface PortalReviewSummary {
  total: number;
  period: {
    from: string | null;
    to: string | null;
    months: number | null;
  };
  generatedAt: string;
  aiGenerated: number;
  externalSource: number;
  ownArticleCandidate: number;
  byCategory: { name: string; count: number }[];
  byAuthor: { name: string; count: number }[];
  byMonth: { name: string; count: number }[];
}

export interface PortalReviewReport {
  rows: PortalReviewRow[];
  summary: PortalReviewSummary;
}

function parseDate(value: unknown): number | null {
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : null;
}

function normalizeIsoDate(value: unknown): string {
  const time = parseDate(value);
  return time === null ? "" : new Date(time).toISOString();
}

function addCount(map: Map<string, number>, key: string) {
  const safeKey = key.trim() || "미지정";
  map.set(safeKey, (map.get(safeKey) || 0) + 1);
}

function sortedCounts(map: Map<string, number>) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}

function monthKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "미지정";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function reviewType(article: Article): PortalReviewRow["reviewType"] {
  if (article.aiGenerated) return "AI 생성 후보";
  if (article.sourceUrl) return "보도자료/외부출처 후보";
  return "자체기사 후보";
}

export function filterPortalReviewArticles(
  articles: Article[],
  options: { from?: string | null; to?: string | null; months?: number | null },
): Article[] {
  const toTime = parseDate(options.to) ?? Date.now();
  const months = options.months && options.months > 0 ? options.months : null;
  const fromTime = parseDate(options.from) ?? (months ? new Date(toTime).setMonth(new Date(toTime).getMonth() - months) : null);
  const endOfDay = toTime + 24 * 60 * 60 * 1000 - 1;

  return articles.filter((article) => {
    const publishedTime = parseDate(article.date);
    if (publishedTime === null) return false;
    if (fromTime !== null && publishedTime < fromTime) return false;
    if (publishedTime > endOfDay) return false;
    return true;
  });
}

export function buildPortalReviewReport(
  articles: Article[],
  options: { baseUrl: string; from?: string | null; to?: string | null; months?: number | null; generatedAt?: string },
): PortalReviewReport {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const filtered = filterPortalReviewArticles(articles, options)
    .slice()
    .sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0));

  const rows: PortalReviewRow[] = filtered.map((article) => {
    const publicId = article.no ?? article.id;
    return {
      no: article.no ?? "",
      id: article.id,
      title: article.title,
      category: article.category || "",
      author: article.author || "",
      publishedAt: normalizeIsoDate(article.date),
      updatedAt: normalizeIsoDate(article.updatedAt || article.date),
      articleUrl: `${baseUrl}/article/${publicId}`,
      sourceUrl: article.sourceUrl || "",
      aiGenerated: article.aiGenerated === true,
      reviewType: reviewType(article),
    };
  });

  const byCategory = new Map<string, number>();
  const byAuthor = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let aiGenerated = 0;
  let externalSource = 0;
  let ownArticleCandidate = 0;

  for (const row of rows) {
    addCount(byCategory, row.category);
    addCount(byAuthor, row.author);
    addCount(byMonth, monthKey(row.publishedAt));
    if (row.aiGenerated) aiGenerated += 1;
    if (row.sourceUrl) externalSource += 1;
    if (!row.sourceUrl && !row.aiGenerated) ownArticleCandidate += 1;
  }

  return {
    rows,
    summary: {
      total: rows.length,
      period: {
        from: options.from || null,
        to: options.to || null,
        months: options.months ?? null,
      },
      generatedAt: options.generatedAt || new Date().toISOString(),
      aiGenerated,
      externalSource,
      ownArticleCandidate,
      byCategory: sortedCounts(byCategory),
      byAuthor: sortedCounts(byAuthor),
      byMonth: sortedCounts(byMonth).sort((a, b) => b.name.localeCompare(a.name)),
    },
  };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

export function portalReviewToCsv(report: PortalReviewReport): string {
  const headers = [
    "기사 번호",
    "ID",
    "제목",
    "카테고리",
    "기자/작성자",
    "발행일",
    "수정일",
    "기사 URL",
    "원문/출처 URL",
    "AI 생성 여부",
    "보도자료/자체기사 구분 후보",
  ];

  const lines = [
    headers.map(csvCell).join(","),
    ...report.rows.map((row) => [
      row.no,
      row.id,
      row.title,
      row.category,
      row.author,
      row.publishedAt,
      row.updatedAt,
      row.articleUrl,
      row.sourceUrl,
      row.aiGenerated ? "Y" : "N",
      row.reviewType,
    ].map(csvCell).join(",")),
  ];

  return `\uFEFF${lines.join("\n")}\n`;
}
