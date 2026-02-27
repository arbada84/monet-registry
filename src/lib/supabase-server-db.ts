/**
 * Supabase REST API - 서버 전용
 * 읽기: NEXT_PUBLIC_SUPABASE_ANON_KEY (RLS public_read 정책 사용)
 * 쓰기: SUPABASE_SERVICE_KEY (service_role, RLS 우회)
 */
import type { Article } from "@/types/article";

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getHeaders(write = false): Record<string, string> {
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
  return {
    id: r.id as string,
    title: r.title as string,
    category: (r.category as string) || "뉴스",
    date: typeof r.date === "string" ? r.date.slice(0, 10) : String(r.date ?? ""),
    status: (r.status as import("@/types/article").ArticleStatus) || "임시저장",
    views: Number(r.views ?? 0),
    body: includeBody ? ((r.body as string) || "") : "",
    thumbnail: (r.thumbnail as string) || "",
    tags: (r.tags as string) || "",
    author: (r.author as string) || "",
    authorEmail: (r.author_email as string) || "",
    summary: (r.summary as string) || "",
    slug: (r.slug as string) || "",
    metaDescription: (r.meta_description as string) || "",
    ogImage: (r.og_image as string) || "",
    scheduledPublishAt: (r.scheduled_publish_at as string) || "",
  };
}

export async function sbGetArticles(): Promise<Article[]> {
  const res = await fetch(
    `${BASE_URL}/rest/v1/articles?select=id,title,category,date,status,views,thumbnail,tags,author,author_email,summary,slug,meta_description,og_image,scheduled_publish_at&order=date.desc,created_at.desc`,
    { headers: getHeaders(false), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Supabase articles error ${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map((r) => rowToArticle(r, false));
}

export async function sbGetArticleById(id: string): Promise<Article | null> {
  const res = await fetch(
    `${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: getHeaders(false), cache: "no-store" }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows[0] ? rowToArticle(rows[0], true) : null;
}

export async function sbCreateArticle(article: Article): Promise<void> {
  const res = await fetch(`${BASE_URL}/rest/v1/articles`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({
      id: article.id, title: article.title, category: article.category,
      date: article.date, status: article.status, views: article.views ?? 0,
      body: article.body, thumbnail: article.thumbnail, tags: article.tags,
      author: article.author, author_email: article.authorEmail,
      summary: article.summary, slug: article.slug,
      meta_description: article.metaDescription, og_image: article.ogImage,
      scheduled_publish_at: article.scheduledPublishAt || null,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase create article error ${res.status}: ${await res.text()}`);
}

export async function sbUpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.category !== undefined) body.category = updates.category;
  if (updates.date !== undefined) body.date = updates.date;
  if (updates.status !== undefined) body.status = updates.status;
  if (updates.views !== undefined) body.views = updates.views;
  if (updates.body !== undefined) body.body = updates.body;
  if (updates.thumbnail !== undefined) body.thumbnail = updates.thumbnail;
  if (updates.tags !== undefined) body.tags = updates.tags;
  if (updates.author !== undefined) body.author = updates.author;
  if (updates.authorEmail !== undefined) body.author_email = updates.authorEmail;
  if (updates.summary !== undefined) body.summary = updates.summary;
  if (updates.slug !== undefined) body.slug = updates.slug;
  if (updates.metaDescription !== undefined) body.meta_description = updates.metaDescription;
  if (updates.ogImage !== undefined) body.og_image = updates.ogImage;
  if (updates.scheduledPublishAt !== undefined) body.scheduled_publish_at = updates.scheduledPublishAt || null;

  const res = await fetch(`${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: getHeaders(true),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase update article error ${res.status}: ${await res.text()}`);
}

export async function sbDeleteArticle(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE", headers: getHeaders(true), cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase delete article error ${res.status}`);
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

export async function sbGetSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(
      `${BASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
      { headers: getHeaders(false), cache: "no-store" }
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
