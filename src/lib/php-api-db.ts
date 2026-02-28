/**
 * Cafe24 PHP API 클라이언트 (서버 전용)
 * =========================================================
 * Vercel 무료 플랜의 동적 IP 문제로 Cafe24 MySQL에 직접 접속 불가.
 * 이 모듈은 Cafe24에 배포된 PHP 게이트웨이를 통해 MySQL 연산을 수행합니다.
 *
 * 환경변수 (Vercel에 설정):
 *   PHP_API_URL    = https://curpy.cafe24.com/db-api.php
 *   PHP_API_SECRET = (Vercel 환경변수에서 설정 — 소스코드에 기재 금지)
 *
 * 이 파일의 함수 시그니처는 mysql-db.ts 와 동일하게 유지됩니다.
 * =========================================================
 */

import type { Article, ViewLogEntry, DistributeLog } from "@/types/article";

const PHP_API_URL    = process.env.PHP_API_URL!;
const PHP_API_SECRET = process.env.PHP_API_SECRET!;
// DNS 변경 후 IP로 접속할 때 가상호스트 라우팅을 위한 Host 헤더 (선택)
const PHP_API_HOST   = process.env.PHP_API_HOST;;

// ─────────────────────────────────────────────
// HTTP 헬퍼
// ─────────────────────────────────────────────

interface PhpFetchOptions {
  method?: string;
  params?: Record<string, string>;
  body?: unknown;
}

async function phpFetch<T = Record<string, unknown>>(
  action: string,
  { method = "GET", params, body }: PhpFetchOptions = {}
): Promise<T> {
  const url = new URL(PHP_API_URL);
  url.searchParams.set("action", action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${PHP_API_SECRET}`,
  };
  if (PHP_API_HOST) headers["Host"] = PHP_API_HOST;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PHP API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────
// Articles
// ─────────────────────────────────────────────

export async function dbGetArticles(): Promise<Article[]> {
  const data = await phpFetch<{ articles: Record<string, unknown>[] }>("articles");
  return (data.articles ?? []).map((r) => rowToArticle(r, false));
}

export async function dbGetArticleById(id: string): Promise<Article | null> {
  const data = await phpFetch<{ article?: Record<string, unknown> }>("articles", {
    params: { id },
  });
  if (!data.article) return null;
  return rowToArticle(data.article, true);
}

export async function dbGetArticleByNo(no: number): Promise<Article | null> {
  const data = await phpFetch<{ article?: Record<string, unknown> }>("articles", {
    params: { no: String(no) },
  });
  if (!data.article) return null;
  return rowToArticle(data.article, true);
}

export async function dbCreateArticle(article: Article): Promise<void> {
  await phpFetch("articles", { method: "POST", body: article });
}

export async function dbUpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  await phpFetch("articles", { method: "PATCH", body: { id, ...updates } });
}

export async function dbDeleteArticle(id: string): Promise<void> {
  await phpFetch("articles", { method: "DELETE", params: { id } });
}

export async function dbIncrementViews(id: string): Promise<void> {
  await phpFetch("article-views", { method: "POST", body: { id } });
}

// ─────────────────────────────────────────────
// View Logs
// ─────────────────────────────────────────────

export async function dbAddViewLog(entry: { articleId: string; path: string }): Promise<void> {
  await phpFetch("view-logs", { method: "POST", body: entry });
}

export async function dbGetViewLogs(): Promise<ViewLogEntry[]> {
  const data = await phpFetch<{ logs: ViewLogEntry[] }>("view-logs");
  return data.logs ?? [];
}

// ─────────────────────────────────────────────
// Distribute Logs
// ─────────────────────────────────────────────

export async function dbGetDistributeLogs(): Promise<DistributeLog[]> {
  const data = await phpFetch<{ logs: DistributeLog[] }>("distribute-logs");
  return data.logs ?? [];
}

export async function dbAddDistributeLogs(logs: DistributeLog[]): Promise<void> {
  await phpFetch("distribute-logs", { method: "POST", body: { logs } });
}

export async function dbClearDistributeLogs(): Promise<void> {
  await phpFetch("distribute-logs", { method: "DELETE" });
}

// ─────────────────────────────────────────────
// Site Settings
// ─────────────────────────────────────────────

export async function dbGetSetting<T>(key: string, fallback: T): Promise<T> {
  const data = await phpFetch<{ value: T | null }>("settings", { params: { key } });
  return data.value !== null && data.value !== undefined ? data.value : fallback;
}

export async function dbSaveSetting(key: string, value: unknown): Promise<void> {
  await phpFetch("settings", { method: "PUT", body: { key, value } });
}

// ─────────────────────────────────────────────
// Helper: PHP API 응답 row → Article 타입
// ─────────────────────────────────────────────

function rowToArticle(r: Record<string, unknown>, includeBody = true): Article {
  return {
    id:       r.id as string,
    no:       r.no != null ? Number(r.no) : undefined,
    title:    r.title as string,
    category: r.category as string,
    date:     typeof r.date === "string"
      ? r.date.slice(0, 10)
      : String(r.date ?? ""),
    status: r.status as import("@/types/article").ArticleStatus,
    views:  Number(r.views ?? 0),
    body:   includeBody ? ((r.body as string) ?? "") : "",
    thumbnail:         (r.thumbnail as string)         || undefined,
    thumbnailAlt:      (r.thumbnail_alt as string)     || undefined,
    tags:              (r.tags as string)              || undefined,
    author:            (r.author as string)            || undefined,
    authorEmail:       (r.author_email as string)      || undefined,
    summary:           (r.summary as string)           || undefined,
    slug:              (r.slug as string)              || undefined,
    metaDescription:   (r.meta_description as string)  || undefined,
    ogImage:           (r.og_image as string)          || undefined,
    sourceUrl:         (r.source_url as string)        || undefined,
    scheduledPublishAt: r.scheduled_publish_at
      ? String(r.scheduled_publish_at)
      : undefined,
    updatedAt: r.updated_at
      ? String(r.updated_at)
      : undefined,
  };
}
