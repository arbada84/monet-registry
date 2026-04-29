/**
 * Supabase REST API - 서버 전용
 * 읽기: NEXT_PUBLIC_SUPABASE_ANON_KEY (RLS public_read 정책 사용)
 * 쓰기: SUPABASE_SERVICE_KEY (service_role, RLS 우회)
 */
import type { Article, Comment, NotificationRecord } from "@/types/article";
import { notifyTelegramDbNotification } from "@/lib/telegram-notify";
import { parseTags } from "./html-utils";

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getHeaders(write = false): Record<string, string> {
  if (write && !SERVICE_KEY) {
    console.warn("[Supabase] SUPABASE_SERVICE_KEY 없이 쓰기 시도 — RLS에 의해 차단될 수 있습니다.");
  }
  const key = write && SERVICE_KEY ? SERVICE_KEY : (ANON_KEY ?? "");
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: write ? "return=minimal" : "return=representation",
  };
}

export function isSupabaseEnabled(): boolean {
  return Boolean(BASE_URL && ANON_KEY);
}

/**
 * Supabase의 1000행 제한 없이 실제 전체 기사 수를 정확히 반환
 */
export async function sbGetTotalCount(): Promise<number> {
  if (!BASE_URL) return 0;
  try {
    // limit=1로 최소 데이터만 요청하면서 count=exact 헤더로 전체 개수 파악
    const res = await fetch(`${BASE_URL}/rest/v1/articles?select=id&limit=1`, {
      headers: { ...getHeaders(false), "Prefer": "count=exact" },
      cache: "no-store",
    });
    const range = res.headers.get("content-range");
    if (range) {
      const parts = range.split("/");
      if (parts[1]) return parseInt(parts[1], 10);
    }
    return 0;
  } catch (e) {
    console.error("[Supabase] Total count error:", e);
    return 0;
  }
}

function rowToArticle(r: Record<string, unknown>, includeBody = true): Article {
  const strOrUndef = (v: unknown): string | undefined =>
    v != null && v !== "" ? String(v) : undefined;
  return {
    id: r.id as string,
    no: r.no != null ? Number(r.no) : undefined,
    title: r.title as string,
    category: (r.category as string) || "뉴스",
    date: typeof r.date === "string" ? r.date.slice(0, 10) : String(r.date ?? ""),
    status: (r.status as import("@/types/article").ArticleStatus) || "임시저장",
    views: Number(r.views ?? 0),
    body: includeBody ? ((r.body as string) || "") : "",
    thumbnail: strOrUndef(r.thumbnail),
    thumbnailAlt: strOrUndef(r.thumbnail_alt),
    tags: strOrUndef(r.tags),
    author: strOrUndef(r.author),
    authorEmail: strOrUndef(r.author_email),
    summary: strOrUndef(r.summary),
    slug: strOrUndef(r.slug),
    metaDescription: strOrUndef(r.meta_description),
    ogImage: strOrUndef(r.og_image),
    scheduledPublishAt: strOrUndef(r.scheduled_publish_at),
    updatedAt: strOrUndef(r.updated_at),
    sourceUrl: strOrUndef(r.source_url),
    deletedAt: r.deleted_at ? String(r.deleted_at) : undefined,
    parentArticleId: strOrUndef(r.parent_article_id),
    reviewNote: strOrUndef(r.review_note),
    auditTrail: Array.isArray(r.audit_trail) ? r.audit_trail as import("@/types/article").AuditEntry[] : undefined,
    createdAt: strOrUndef(r.created_at),
    aiGenerated: r.aiGenerated === true || r.aiGenerated === "true" ? true : undefined,
  };
}

export async function sbGetArticleByNo(no: number): Promise<Article | null> {
  // 게시 상태 기사 우선 조회 (같은 no가 여러 개일 수 있음)
  const res = await fetch(
    `${BASE_URL}/rest/v1/articles?no=eq.${no}&select=*&order=status.asc&limit=10`,
    { headers: getHeaders(false), next: { revalidate: 60, tags: ["articles"] } }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Record<string, unknown>[];
  // 게시 상태 기사 우선, 삭제되지 않은 기사 반환
  const published = rows.find((r) => r.status === "게시" && !r.deleted_at);
  const row = published || rows.find((r) => !r.deleted_at);
  if (!row) return null;
  return rowToArticle(row, true);
}

export async function sbGetArticles(includeDeleted = false): Promise<Article[]> {
  const baseSelect = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,meta_description,og_image,scheduled_publish_at,updated_at,created_at,source_url,aiGenerated";
  // Supabase REST API 기본 1000행 제한을 우회하기 위해 페이지네이션 사용
  const PAGE_SIZE = 1000;
  let allRows: Record<string, unknown>[] = [];
  let offset = 0;
  let hasDeletedAt = true;

  while (true) {
    const selectCols = hasDeletedAt ? `${baseSelect},deleted_at` : baseSelect;
    const url = `${BASE_URL}/rest/v1/articles?select=${selectCols}&order=date.desc,created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;
    let res = await fetch(url, {
      headers: getHeaders(false),
      cache: "no-store",
    });
    // deleted_at 컬럼 미존재 시 폴백 (첫 페이지에서만 시도)
    if (!res.ok && hasDeletedAt && offset === 0) {
      hasDeletedAt = false;
      res = await fetch(
        `${BASE_URL}/rest/v1/articles?select=${baseSelect}&order=date.desc,created_at.desc&limit=${PAGE_SIZE}&offset=0`,
        { headers: getHeaders(false), next: { revalidate: 60, tags: ["articles"] } }
      );
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Supabase articles error ${res.status}: ${errText.slice(0, 200)}`);
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    allRows = allRows.concat(rows);
    if (rows.length < PAGE_SIZE) break; // 마지막 페이지
    offset += PAGE_SIZE;
  }

  const articles = allRows.map((r) => rowToArticle(r, false));
  // 삭제된 기사 필터링 (코드 레벨)
  if (!includeDeleted) return articles.filter((a) => !a.deletedAt);
  return articles;
}

/** 많이 본 뉴스 Top N — 최근 30일 이내 게시된 기사 중 조회수 순 */
export async function sbGetTopArticles(limit = 10): Promise<Article[]> {
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,summary";
  // 최근 30일 전 날짜 계산 (YYYY-MM-DD 형식)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffDateStr = cutoff.toISOString().slice(0, 10);

  const url = `${BASE_URL}/rest/v1/articles?select=${select}&status=eq.${encodeURIComponent("게시")}&date=gte.${cutoffDateStr}&order=views.desc.nullslast&limit=${limit}`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    next: { revalidate: 300, tags: ["articles"] },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, false));
}

export async function sbGetArticlesByCategory(category: string): Promise<Article[]> {
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,meta_description,og_image,scheduled_publish_at,updated_at,source_url";
  const url = `${BASE_URL}/rest/v1/articles?select=${select}&category=eq.${encodeURIComponent(category)}&status=eq.${encodeURIComponent("게시")}&order=date.desc,created_at.desc&limit=500`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, false));
}

export async function sbGetArticlesByTag(tag: string): Promise<Article[]> {
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,meta_description,og_image,scheduled_publish_at,updated_at,source_url";
  // ilike으로 태그 포함 여부를 DB 레벨에서 필터링 (쉼표 구분 tags 컬럼)
  const url = `${BASE_URL}/rest/v1/articles?select=${select}&status=eq.${encodeURIComponent("게시")}&tags=ilike.*${encodeURIComponent(tag)}*&order=date.desc,created_at.desc&limit=500`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  // DB ilike는 부분 일치이므로, 정확한 태그 매칭을 위해 코드 레벨에서 한 번 더 필터링
  return rows.map((r) => rowToArticle(r, false)).filter((a) =>
    parseTags(a.tags).includes(tag)
  );
}

/**
 * 전문검색 (tsvector + pg_trgm)
 * DB RPC `search_articles`로 가중치 랭킹된 article_id 목록을 받은 뒤
 * 해당 기사 데이터를 조회하여 관련도순으로 반환
 */
export async function sbSearchArticles(query: string): Promise<Article[]> {
  // 1단계: RPC로 관련도 랭킹된 article_id 조회
  const rpcRes = await fetch(
    `${BASE_URL}/rest/v1/rpc/search_articles`,
    {
      method: "POST",
      headers: { ...getHeaders(false), "Content-Type": "application/json" },
      body: JSON.stringify({ search_query: query, max_results: 50 }),
      cache: "no-store",
    }
  );

  if (!rpcRes.ok) {
    // RPC 실패 시 기존 ilike 폴백
    const encoded = encodeURIComponent(`%${query}%`);
    const filter = `or=(title.ilike.${encoded},summary.ilike.${encoded},tags.ilike.${encoded},body.ilike.${encoded})`;
    const res = await fetch(
      `${BASE_URL}/rest/v1/articles?${filter}&status=eq.게시&select=*&order=date.desc,created_at.desc`,
      { headers: getHeaders(false), cache: "no-store" }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.map((r) => rowToArticle(r, true)).filter((a) => !a.deletedAt);
  }

  const ranked = (await rpcRes.json()) as { article_id: string; relevance: number }[];
  if (ranked.length === 0) return [];

  // 2단계: 랭킹된 ID로 기사 데이터 일괄 조회
  const ids = ranked.map((r) => r.article_id);
  const idFilter = `id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`;
  const dataRes = await fetch(
    `${BASE_URL}/rest/v1/articles?${idFilter}&select=*`,
    { headers: getHeaders(false), cache: "no-store" }
  );
  if (!dataRes.ok) return [];
  const rows = (await dataRes.json()) as Record<string, unknown>[];
  const articleMap = new Map<string, Article>();
  for (const r of rows) {
    const a = rowToArticle(r, true);
    if (!a.deletedAt) articleMap.set(a.id, a);
  }

  // 3단계: 관련도순 정렬 유지하며 반환
  return ranked
    .filter((r) => articleMap.has(r.article_id))
    .map((r) => articleMap.get(r.article_id)!);
}

/** 게시 상태 기사 전체 (body 제외, deleted_at=null) — 홈/기자/외부API용 */
export async function sbGetPublishedArticles(): Promise<Article[]> {
  const baseSelect = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,meta_description,og_image,scheduled_publish_at,updated_at,created_at,source_url,aiGenerated";
  const PAGE_SIZE = 1000;
  let allRows: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const url = `${BASE_URL}/rest/v1/articles?select=${baseSelect}&status=eq.${encodeURIComponent("게시")}&order=date.desc,created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: getHeaders(false),
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Supabase published articles error ${res.status}: ${errText.slice(0, 200)}`);
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    allRows = allRows.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows.map((r) => rowToArticle(r, false));
}

/** 최신 N건 게시 기사 (body 제외) — 피드/사이드바용 */
export async function sbGetRecentArticles(limit: number): Promise<Article[]> {
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,source_url,updated_at";
  const url = `${BASE_URL}/rest/v1/articles?select=${select}&status=eq.${encodeURIComponent("게시")}&order=date.desc,created_at.desc&limit=${limit}`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, false));
}

/** sitemap 전용 — no/date/tags/author 4컬럼만 조회 */
export async function sbGetFeedArticles(opts: {
  category?: string;
  author?: string;
  limit?: number;
  includeBody?: boolean;
}): Promise<Article[]> {
  const safeLimit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  const select = opts.includeBody
    ? "id,no,title,category,date,status,views,body,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,source_url,updated_at"
    : "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,source_url,updated_at";
  const filters = [
    `select=${select}`,
    `status=eq.${encodeURIComponent("\uAC8C\uC2DC")}`,
  ];

  if (opts.category) filters.push(`category=eq.${encodeURIComponent(opts.category)}`);
  if (opts.author) filters.push(`author=eq.${encodeURIComponent(opts.author)}`);

  const url = `${BASE_URL}/rest/v1/articles?${filters.join("&")}&order=date.desc,created_at.desc&limit=${safeLimit}`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, Boolean(opts.includeBody)));
}

export async function sbGetArticlesByAuthor(author: string, limit = 500): Promise<Article[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,source_url,updated_at";
  const url = `${BASE_URL}/rest/v1/articles?select=${select}&status=eq.${encodeURIComponent("\uAC8C\uC2DC")}&author=eq.${encodeURIComponent(author)}&order=date.desc,created_at.desc&limit=${safeLimit}`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    next: { revalidate: 300, tags: ["articles"] },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, false));
}

export async function sbGetHomeArticles(limit = 240): Promise<Article[]> {
  const safeLimit = Math.max(1, Math.min(limit, 300));
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,source_url,updated_at";
  const url = `${BASE_URL}/rest/v1/articles?select=${select}&status=eq.${encodeURIComponent("\uAC8C\uC2DC")}&order=date.desc,created_at.desc&limit=${safeLimit}`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    next: { revalidate: 300, tags: ["articles"] },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, false));
}

export async function sbGetMaintenanceArticles(opts: {
  page?: number;
  limit?: number;
  since?: string;
  includeBody?: boolean;
} = {}): Promise<Article[]> {
  const safePage = Math.max(1, opts.page ?? 1);
  const safeLimit = Math.max(1, Math.min(opts.limit ?? 200, 500));
  const offset = (safePage - 1) * safeLimit;
  const select = opts.includeBody
    ? "id,no,title,category,date,status,views,body,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,source_url,updated_at,created_at,deleted_at"
    : "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,source_url,updated_at,created_at,deleted_at";
  const filters = [`select=${select}`];

  if (opts.since) {
    filters.push(`updated_at=gte.${encodeURIComponent(opts.since)}`);
  }

  const url = `${BASE_URL}/rest/v1/articles?${filters.join("&")}&order=updated_at.desc.nullslast,date.desc,created_at.desc&limit=${safeLimit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, Boolean(opts.includeBody)));
}

export async function sbGetArticleSitemapData(): Promise<{ no: number; date: string; tags?: string; author?: string }[]> {
  const PAGE_SIZE = 1000;
  let allRows: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const url = `${BASE_URL}/rest/v1/articles?select=no,date,tags,author&status=eq.${encodeURIComponent("게시")}&order=date.desc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: getHeaders(false),
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Supabase sitemap data error ${res.status}: ${errText.slice(0, 200)}`);
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    allRows = allRows.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows.map((r) => ({
    no: Number(r.no ?? 0),
    date: typeof r.date === "string" ? r.date.slice(0, 10) : String(r.date ?? ""),
    tags: r.tags != null && r.tags !== "" ? String(r.tags) : undefined,
    author: r.author != null && r.author !== "" ? String(r.author) : undefined,
  }));
}

/** 예약 발행 대상 — status=예약, scheduled_publish_at <= 현재 시각 (body 포함) */
export async function sbGetScheduledArticles(): Promise<Article[]> {
  const baseSelect = "id,no,title,category,date,status,views,body,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,meta_description,og_image,scheduled_publish_at,updated_at,created_at,source_url,aiGenerated";
  const now = new Date().toISOString();
  const url = `${BASE_URL}/rest/v1/articles?select=${baseSelect}&status=eq.${encodeURIComponent("예약")}&scheduled_publish_at=lte.${encodeURIComponent(now)}&order=scheduled_publish_at.asc`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, true));
}

/** 최근 N일 기사 제목+sourceUrl — 중복 확인용 */
export async function sbGetRecentTitles(days: number): Promise<{ title: string; sourceUrl?: string }[]> {
  const cutoffDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const PAGE_SIZE = 1000;
  let allRows: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const url = `${BASE_URL}/rest/v1/articles?select=title,source_url&status=eq.${encodeURIComponent("게시")}&date=gte.${cutoffDate}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: getHeaders(false),
      cache: "no-store",
    });
    if (!res.ok) break;
    const rows = (await res.json()) as Record<string, unknown>[];
    allRows = allRows.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows.map((r) => ({
    title: String(r.title ?? ""),
    sourceUrl: r.source_url != null && r.source_url !== "" ? String(r.source_url) : undefined,
  }));
}

/**
 * DB 레벨 필터링 + 페이지네이션 + 총 개수 반환
 * 어드민 기사 목록 API(/api/db/articles)에서 사용
 */
export async function sbGetFilteredArticles(opts: {
  q?: string;
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
  includeDeleted?: boolean;
  authed?: boolean;
}): Promise<{ articles: Article[]; total: number }> {
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,updated_at,created_at,source_url,aiGenerated";
  const filters: string[] = [];

  // 삭제되지 않은 기사만 (기본) - DB에 컬럼이 생길 때까지 비활성화
  /*
  if (!opts.includeDeleted) {
    filters.push("deleted_at=is.null");
  }
  */

  // 비인증 요청: 게시 상태만
  if (!opts.authed) {
    filters.push(`status=eq.${encodeURIComponent("게시")}`);
  } else if (opts.status) {
    filters.push(`status=eq.${encodeURIComponent(opts.status)}`);
  }

  if (opts.category) {
    filters.push(`category=eq.${encodeURIComponent(opts.category)}`);
  }

  if (opts.q) {
    const q = opts.q.trim();
    if (q) {
      const encoded = encodeURIComponent(q);
      filters.push(`or=(title.ilike.*${encoded}*,author.ilike.*${encoded}*,tags.ilike.*${encoded}*)`);
    }
  }

  const limit = opts.limit || 20;
  const offset = ((opts.page || 1) - 1) * limit;
  const filterStr = filters.length ? `&${filters.join("&")}` : "";

  const url = `${BASE_URL}/rest/v1/articles?select=${select}${filterStr}&order=date.desc,created_at.desc&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { ...getHeaders(false), "Prefer": "count=exact" },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase filtered articles error ${res.status}: ${errText.slice(0, 200)}`);
  }

  // content-range 헤더에서 총 개수 추출: "0-19/4235" 또는 "*/0"
  const range = res.headers.get("content-range");
  let total = 0;
  if (range) {
    const parts = range.split("/");
    if (parts[1] && parts[1] !== "*") total = parseInt(parts[1], 10);
  }

  // 만약 total이 limit과 같거나 1000개 근처에서 멈춘다면, 실제 더 있는지 검증이 필요할 수 있음
  // (현재는 count=exact가 정상 작동한다고 가정하되, UI에서 1000개로 보이면 이 부분을 보강)

  const rows = (await res.json()) as Record<string, unknown>[];
  return { articles: rows.map(r => rowToArticle(r, false)), total };
}

export async function sbGetArticleById(id: string, includeDeleted = false): Promise<Article | null> {
  // deleted_at 컬럼 유무에 관계없이 동작하도록 기본 쿼리 사용
  const res = await fetch(
    `${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: getHeaders(false), next: { revalidate: 60, tags: ["articles"] } }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return null;
  // 삭제된 기사 필터링 (includeDeleted가 아닌 경우)
  if (!includeDeleted && row.deleted_at) return null;
  return rowToArticle(row, true);
}

export async function sbCreateArticle(article: Article): Promise<void> {
  const payload: Record<string, unknown> = {
    id: article.id, no: article.no ?? null, title: article.title, category: article.category,
    date: article.date, status: article.status, views: article.views ?? 0,
    body: article.body, thumbnail: article.thumbnail, thumbnail_alt: article.thumbnailAlt || null, tags: article.tags,
    author: article.author, author_email: article.authorEmail,
    summary: article.summary, slug: article.slug,
    meta_description: article.metaDescription, og_image: article.ogImage,
    scheduled_publish_at: article.scheduledPublishAt || null,
    source_url: article.sourceUrl || null,
  };
  // 새 컬럼: 값이 있을 때만 포함 (컬럼 미존재 시 에러 방지)
  if (article.parentArticleId) payload.parent_article_id = article.parentArticleId;
  if (article.reviewNote) payload.review_note = article.reviewNote;
  if (article.auditTrail?.length) payload.audit_trail = article.auditTrail;
  if (article.aiGenerated) payload.aiGenerated = true;

  let res = await fetch(`${BASE_URL}/rest/v1/articles`, {
    method: "POST", headers: getHeaders(true),
    body: JSON.stringify(payload), cache: "no-store",
  });
  // 새 컬럼 관련 에러 시 해당 필드 제거 후 재시도
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    delete payload.parent_article_id;
    delete payload.review_note;
    delete payload.audit_trail;
    res = await fetch(`${BASE_URL}/rest/v1/articles`, {
      method: "POST", headers: getHeaders(true),
      body: JSON.stringify(payload), cache: "no-store",
    });
  }
  if (!res.ok) throw new Error(`Supabase create article error ${res.status}: ${await res.text()}`);
}

export async function sbUpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.no !== undefined) body.no = updates.no ?? null;
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.category !== undefined) body.category = updates.category;
  if (updates.date !== undefined) body.date = updates.date;
  if (updates.status !== undefined) body.status = updates.status;
  if (updates.views !== undefined) body.views = updates.views;
  if (updates.body !== undefined) body.body = updates.body;
  if (updates.thumbnail !== undefined) body.thumbnail = updates.thumbnail;
  if (updates.thumbnailAlt !== undefined) body.thumbnail_alt = updates.thumbnailAlt || null;
  if (updates.tags !== undefined) body.tags = updates.tags;
  if (updates.author !== undefined) body.author = updates.author;
  if (updates.authorEmail !== undefined) body.author_email = updates.authorEmail;
  if (updates.summary !== undefined) body.summary = updates.summary;
  if (updates.slug !== undefined) body.slug = updates.slug;
  if (updates.metaDescription !== undefined) body.meta_description = updates.metaDescription;
  if (updates.ogImage !== undefined) body.og_image = updates.ogImage;
  if (updates.scheduledPublishAt !== undefined) body.scheduled_publish_at = updates.scheduledPublishAt || null;
  if (updates.updatedAt !== undefined) body.updated_at = updates.updatedAt || null;
  if (updates.sourceUrl !== undefined) body.source_url = updates.sourceUrl || null;
  if (updates.deletedAt !== undefined) body.deleted_at = updates.deletedAt || null;
  if (updates.parentArticleId !== undefined) body.parent_article_id = updates.parentArticleId || null;
  if (updates.reviewNote !== undefined) body.review_note = updates.reviewNote || null;
  if (updates.auditTrail !== undefined) body.audit_trail = updates.auditTrail || null;
  if (updates.aiGenerated !== undefined) body.aiGenerated = updates.aiGenerated || false;

  let res = await fetch(`${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: getHeaders(true),
    body: JSON.stringify(body), cache: "no-store",
  });
  // 새 컬럼 관련 에러 시 해당 필드 제거 후 재시도
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    delete body.parent_article_id;
    delete body.review_note;
    delete body.audit_trail;
    res = await fetch(`${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: getHeaders(true),
      body: JSON.stringify(body), cache: "no-store",
    });
  }
  if (!res.ok) throw new Error(`Supabase update article error ${res.status}: ${await res.text()}`);
}

/** 소프트 삭제 — deleted_at 설정 (휴지통 이동) */
export async function sbDeleteArticle(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: getHeaders(true),
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    cache: "no-store",
  });
  // deleted_at 컬럼 미존재 시 기존 영구 삭제로 폴백
  if (!res.ok) {
    const fallback = await fetch(`${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE", headers: getHeaders(true), cache: "no-store",
    });
    if (!fallback.ok) throw new Error(`Supabase delete article error ${fallback.status}`);
  }
}

/** 영구 삭제 — DB에서 완전 제거 */
export async function sbPurgeArticle(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE", headers: getHeaders(true), cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase purge article error ${res.status}`);
}

/** 휴지통 기사 목록 조회 */
export async function sbGetDeletedArticles(): Promise<Article[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/rest/v1/articles?deleted_at=not.is.null&select=id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,author_email,summary,slug,meta_description,og_image,scheduled_publish_at,updated_at,source_url,deleted_at&order=deleted_at.desc`,
      { headers: getHeaders(false), cache: "no-store" }
    );
    if (!res.ok) return []; // deleted_at 컬럼 미존재 시 빈 배열
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.map((r) => rowToArticle(r, false));
  } catch { return []; }
}

export async function sbIncrementViews(id: string): Promise<void> {
  await fetch(`${BASE_URL}/rest/v1/rpc/increment_views`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({ article_id: id }),
    cache: "no-store",
  });
}

// ── Settings ─────────────────────────────────────────────

export async function sbGetSetting<T>(key: string, fallback: T, useServiceKey = false): Promise<T> {
  try {
    const res = await fetch(
      `${BASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
      { headers: getHeaders(useServiceKey), next: { revalidate: 60, tags: ["settings", `setting:${key}`] } }
    );
    if (!res.ok) return fallback;
    const rows = (await res.json()) as { value: T }[];
    return rows[0]?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function sbSaveSetting(key: string, value: unknown): Promise<void> {
  const res = await fetch(`${BASE_URL}/rest/v1/site_settings`, {
    method: "POST",
    headers: {
      ...getHeaders(true),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ key, value }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase save setting error ${res.status}: ${await res.text()}`);
}

// ── Image Upload Settings ─────────────────────────────────

export interface ImageUploadSettings {
  enabled: boolean;    // WebP 변환 활성화 여부 (기본: true)
  maxWidth: number;    // 최대 가로 크기 px (기본: 1920)
  quality: number;     // WebP 품질 1-100 (기본: 80)
}

const DEFAULT_IMAGE_SETTINGS: ImageUploadSettings = {
  enabled: true,
  maxWidth: 1920,
  quality: 80,
};

/** Supabase settings에서 이미지 업로드 설정 조회 (watermark.ts의 getWatermarkSettings와 동일 패턴) */
export async function getImageUploadSettings(): Promise<ImageUploadSettings> {
  if (!BASE_URL || !SERVICE_KEY) return DEFAULT_IMAGE_SETTINGS;
  try {
    const res = await fetch(
      `${BASE_URL}/rest/v1/site_settings?key=eq.cp-image-settings&select=value&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return DEFAULT_IMAGE_SETTINGS;
    const rows = (await res.json()) as { value: ImageUploadSettings | string }[];
    if (rows.length === 0) return DEFAULT_IMAGE_SETTINGS;
    const stored = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    return { ...DEFAULT_IMAGE_SETTINGS, ...stored };
  } catch {
    return DEFAULT_IMAGE_SETTINGS;
  }
}

/**
 * 기사 순서 번호를 원자적으로 증가 (PostgreSQL 함수 호출)
 * Supabase SQL Editor에서 get_next_article_no() 함수가 생성되어 있어야 함
 * 함수 미존재 시 null 반환 → 호출자에서 fallback 처리
 */
/** articles 테이블에서 현재 MAX(no)를 읽어 반환 — 카운터 실패 시 최후 폴백용 */
export async function sbGetMaxArticleNo(): Promise<number> {
  try {
    const res = await fetch(
      `${BASE_URL}/rest/v1/articles?select=no&order=no.desc&limit=1`,
      { headers: getHeaders(false), cache: "no-store" }
    );
    if (!res.ok) return 0;
    const rows = (await res.json()) as { no?: number | null }[];
    return Number(rows[0]?.no ?? 0);
  } catch {
    return 0;
  }
}

export async function sbGetNextArticleNo(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_URL}/rest/v1/rpc/get_next_article_no`, {
      method: "POST",
      headers: { ...getHeaders(true), Prefer: "return=representation" },
      body: JSON.stringify({}),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const result = await res.json();
    // Supabase RPC 응답은 number | number[] | { get_next_article_no: number } 등 형태 다양
    if (typeof result === "number" && result > 0) return result;
    if (Array.isArray(result) && typeof result[0] === "number" && result[0] > 0) return result[0];
    if (result && typeof result === "object" && "get_next_article_no" in result) {
      const v = Number((result as Record<string, unknown>)["get_next_article_no"]);
      if (v > 0) return v;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Comments ────────────────────────────────────────────

function rowToComment(r: Record<string, unknown>): Comment {
  return {
    id: r.id as string,
    articleId: r.article_id as string,
    articleTitle: (r.article_title as string) || undefined,
    author: r.author as string,
    content: r.content as string,
    createdAt: r.created_at as string,
    status: r.status as Comment["status"],
    ip: (r.ip as string) || undefined,
    parentId: (r.parent_id as string) || undefined,
  };
}

function rowToNotification(r: Record<string, unknown>): NotificationRecord {
  return {
    id: String(r.id),
    type: String(r.type || ""),
    title: String(r.title || ""),
    message: String(r.message || ""),
    metadata: (r.metadata && typeof r.metadata === "object") ? r.metadata as Record<string, unknown> : {},
    read: r.read === true || r.read === "true" || r.read === 1,
    created_at: String(r.created_at || ""),
  };
}

/** 댓글 목록 조회 */
export async function sbGetComments(opts?: { articleId?: string; isAdmin?: boolean }): Promise<Comment[]> {
  let url = `${BASE_URL}/rest/v1/comments?order=created_at.desc`;
  if (opts?.articleId) {
    url += `&article_id=eq.${encodeURIComponent(opts.articleId)}`;
  }
  if (!opts?.isAdmin) {
    url += `&status=eq.approved`;
  }
  // 관리자는 service key (전체 조회), 일반은 anon key (RLS 적용)
  const res = await fetch(url, {
    headers: getHeaders(!!opts?.isAdmin),
    next: { tags: ["comments"] },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase comments query failed: ${res.status}: ${errText.slice(0, 200)}`);
  }
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map(rowToComment);
}

/** 댓글 생성 */
export async function sbCreateComment(data: {
  id?: string;
  articleId: string;
  articleTitle?: string;
  author: string;
  content: string;
  status?: Comment["status"];
  ip?: string;
  parentId?: string;
}): Promise<string> {
  const id = data.id || crypto.randomUUID();
  const row = {
    id,
    article_id: data.articleId,
    article_title: data.articleTitle || null,
    author: data.author,
    content: data.content,
    status: data.status || "pending",
    ip: data.ip || null,
    parent_id: data.parentId || null,
  };
  const res = await fetch(`${BASE_URL}/rest/v1/comments?select=id`, {
    method: "POST",
    headers: { ...getHeaders(true), Prefer: "return=representation" },
    body: JSON.stringify(row),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase create comment error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const rows = (await res.json().catch(() => [])) as Array<{ id?: string }>;
  return rows[0]?.id || id;
}

/** 댓글 상태 변경 (승인/거절/스팸) */
export async function sbUpdateCommentStatus(id: string, status: Comment["status"]): Promise<void> {
  const res = await fetch(`${BASE_URL}/rest/v1/comments?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...getHeaders(true), Prefer: "return=minimal" },
    body: JSON.stringify({ status }),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase update comment status error ${res.status}: ${errText.slice(0, 200)}`);
  }
}

/** 서버사이드 알림 생성 (fire-and-forget 패턴) */
export async function sbGetNotifications(limit = 50): Promise<NotificationRecord[]> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(Number(limit) || 50), 200));
  const res = await fetch(`${BASE_URL}/rest/v1/notifications?order=created_at.desc&limit=${safeLimit}`, {
    headers: getHeaders(true),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase notifications query failed: ${res.status}: ${errText.slice(0, 200)}`);
  }
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map(rowToNotification);
}

export async function sbCountUnreadNotifications(): Promise<number> {
  const res = await fetch(`${BASE_URL}/rest/v1/notifications?read=eq.false&select=id`, {
    headers: getHeaders(true),
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const rows = (await res.json().catch(() => [])) as unknown[];
  return rows.length;
}

export async function sbCreateNotification(data: {
  id?: string;
  type: string;
  title: string;
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const id = data.id || crypto.randomUUID();
  const res = await fetch(`${BASE_URL}/rest/v1/notifications?select=id`, {
    method: "POST",
    headers: { ...getHeaders(true), Prefer: "return=representation" },
    body: JSON.stringify({
      id,
      type: data.type,
      title: data.title,
      message: data.message || "",
      metadata: data.metadata || {},
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase create notification error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const rows = (await res.json().catch(() => [])) as Array<{ id?: string }>;
  return rows[0]?.id || id;
}

export async function sbMarkNotificationsRead(opts: { ids?: string[]; all?: boolean }): Promise<void> {
  if (opts.all) {
    const res = await fetch(`${BASE_URL}/rest/v1/notifications?read=eq.false`, {
      method: "PATCH",
      headers: { ...getHeaders(true), Prefer: "return=minimal" },
      body: JSON.stringify({ read: true }),
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Supabase mark all notifications read error ${res.status}: ${errText.slice(0, 200)}`);
    }
    return;
  }

  const ids = Array.isArray(opts.ids) ? opts.ids.filter(Boolean) : [];
  for (const id of ids) {
    const res = await fetch(`${BASE_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...getHeaders(true), Prefer: "return=minimal" },
      body: JSON.stringify({ read: true }),
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Supabase mark notification read error ${res.status}: ${errText.slice(0, 200)}`);
    }
  }
}

export async function sbDeleteAllNotifications(): Promise<void> {
  const res = await fetch(`${BASE_URL}/rest/v1/notifications?id=not.is.null`, {
    method: "DELETE",
    headers: { ...getHeaders(true), Prefer: "return=minimal" },
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase delete notifications error ${res.status}: ${errText.slice(0, 200)}`);
  }
}

export async function createNotification(
  type: string,
  title: string,
  message: string = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!BASE_URL || !SERVICE_KEY) {
    await notifyTelegramDbNotification(type, title, message, metadata).catch(() => false);
    return;
  }
  try {
    await sbCreateNotification({ type, title, message, metadata });
    await notifyTelegramDbNotification(type, title, message, metadata).catch(() => false);
  } catch (e) {
    console.error("[createNotification] failed:", e);
    await notifyTelegramDbNotification(type, title, message, metadata).catch(() => false);
  }
}

/** 댓글 삭제 (자식 답글 연쇄 삭제 포함) */
export async function sbDeleteComment(id: string): Promise<void> {
  // 1) 자식 답글 먼저 삭제 (고아 댓글 방지)
  const childRes = await fetch(`${BASE_URL}/rest/v1/comments?parent_id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...getHeaders(true), Prefer: "return=minimal" },
    cache: "no-store",
  });
  if (!childRes.ok) {
    const errText = await childRes.text().catch(() => "");
    throw new Error(`Supabase delete child comments error ${childRes.status}: ${errText.slice(0, 200)}`);
  }
  // 2) 부모 댓글 삭제
  const res = await fetch(`${BASE_URL}/rest/v1/comments?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...getHeaders(true), Prefer: "return=minimal" },
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase delete comment error ${res.status}: ${errText.slice(0, 200)}`);
  }
}
