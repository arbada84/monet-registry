/**
 * Supabase REST API - 서버 전용
 * 읽기: NEXT_PUBLIC_SUPABASE_ANON_KEY (RLS public_read 정책 사용)
 * 쓰기: SUPABASE_SERVICE_KEY (service_role, RLS 우회)
 */
import type { Article } from "@/types/article";
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

// ── Articles ─────────────────────────────────────────────

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
    deletedAt: strOrUndef(r.deleted_at),
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
      next: { revalidate: 60, tags: ["articles"] },
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

/** 많이 본 뉴스 Top N — DB 레벨 정렬+제한 (전체 조회 불필요) */
export async function sbGetTopArticles(limit = 10): Promise<Article[]> {
  const select = "id,no,title,category,date,status,views,thumbnail,thumbnail_alt,tags,author,summary";
  const url = `${BASE_URL}/rest/v1/articles?select=${select}&status=eq.게시&order=views.desc.nullslast&limit=${limit}`;
  const res = await fetch(url, {
    headers: getHeaders(false),
    next: { revalidate: 60, tags: ["articles"] },
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
    next: { revalidate: 60, tags: ["articles"] },
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
    next: { revalidate: 60, tags: ["articles"] },
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
