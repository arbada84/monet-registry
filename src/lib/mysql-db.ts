/**
 * 서버 전용 MySQL DB 함수
 * API 라우트에서만 import — 클라이언트 컴포넌트에서 직접 사용 금지
 */
import pool from "./mysql";
import type { Article, ViewLogEntry, DistributeLog } from "@/types/article";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

// ─────────────────────────────────────────────
// Articles
// ─────────────────────────────────────────────

// 목록 조회: body 제외 (성능 최적화)
const LIST_COLUMNS =
  "id, no, title, category, date, status, views, thumbnail, thumbnail_alt, tags, author, author_email, summary, slug, meta_description, og_image, scheduled_publish_at, created_at, updated_at";

export async function dbGetArticles(): Promise<Article[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${LIST_COLUMNS} FROM articles ORDER BY date DESC, created_at DESC`
  );
  return rows.map((r) => rowToArticle(r, false));
}

export async function dbGetArticleById(id: string): Promise<Article | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM articles WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return null;
  return rowToArticle(rows[0], true);
}

export async function dbGetArticleByNo(no: number): Promise<Article | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM articles WHERE no = ? LIMIT 1",
    [no]
  );
  if (!rows.length) return null;
  return rowToArticle(rows[0], true);
}

export async function dbCreateArticle(article: Article): Promise<void> {
  await pool.query<ResultSetHeader>(
    `INSERT INTO articles
      (id, no, title, category, date, status, views, body, thumbnail, thumbnail_alt, tags, author, author_email,
       summary, slug, meta_description, og_image, scheduled_publish_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      article.id,
      article.no ?? null,
      article.title,
      article.category,
      article.date,
      article.status,
      article.views ?? 0,
      article.body,
      article.thumbnail ?? null,
      article.thumbnailAlt ?? null,
      article.tags ?? null,
      article.author ?? null,
      article.authorEmail ?? null,
      article.summary ?? null,
      article.slug ?? null,
      article.metaDescription ?? null,
      article.ogImage ?? null,
      article.scheduledPublishAt ?? null,
    ]
  );
}

export async function dbUpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  const map: Record<string, keyof Article> = {
    no: "no",
    title: "title",
    category: "category",
    date: "date",
    status: "status",
    views: "views",
    body: "body",
    thumbnail: "thumbnail",
    thumbnail_alt: "thumbnailAlt",
    tags: "tags",
    author: "author",
    author_email: "authorEmail",
    summary: "summary",
    slug: "slug",
    meta_description: "metaDescription",
    og_image: "ogImage",
    scheduled_publish_at: "scheduledPublishAt",
    updated_at: "updatedAt",
  };

  for (const [col, prop] of Object.entries(map)) {
    if (prop in updates) {
      fields.push(`${col} = ?`);
      values.push((updates as Record<string, unknown>)[prop] ?? null);
    }
  }
  if (!fields.length) return;
  values.push(id);
  await pool.query(`UPDATE articles SET ${fields.join(", ")} WHERE id = ?`, values);
}

export async function dbDeleteArticle(id: string): Promise<void> {
  await pool.query("DELETE FROM articles WHERE id = ?", [id]);
}

export async function dbIncrementViews(id: string): Promise<void> {
  await pool.query("UPDATE articles SET views = views + 1 WHERE id = ?", [id]);
}

// ─────────────────────────────────────────────
// View Logs
// ─────────────────────────────────────────────

export async function dbAddViewLog(entry: { articleId: string; path: string }): Promise<void> {
  await pool.query(
    "INSERT INTO view_logs (article_id, path) VALUES (?, ?)",
    [entry.articleId, entry.path]
  );
}

export async function dbGetViewLogs(): Promise<ViewLogEntry[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT article_id, path, created_at FROM view_logs ORDER BY created_at DESC LIMIT 10000"
  );
  return rows.map((r) => ({
    articleId: r.article_id as string,
    timestamp: (r.created_at as Date).toISOString(),
    path: r.path as string,
  }));
}

// ─────────────────────────────────────────────
// Distribute Logs
// ─────────────────────────────────────────────

export async function dbGetDistributeLogs(): Promise<DistributeLog[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM distribute_logs ORDER BY created_at DESC LIMIT 100"
  );
  return rows.map((r) => ({
    id: r.id as string,
    articleId: r.article_id as string,
    articleTitle: r.article_title as string,
    portal: r.portal as string,
    status: r.status as "success" | "failed" | "pending",
    timestamp: (r.created_at as Date).toISOString(),
    message: r.message as string,
  }));
}

export async function dbAddDistributeLogs(logs: DistributeLog[]): Promise<void> {
  if (!logs.length) return;
  const values = logs.map((l) => [
    l.id, l.articleId, l.articleTitle, l.portal, l.status, l.message,
  ]);
  await pool.query(
    `INSERT INTO distribute_logs (id, article_id, article_title, portal, status, message)
     VALUES ?`,
    [values]
  );
}

export async function dbClearDistributeLogs(): Promise<void> {
  await pool.query("DELETE FROM distribute_logs");
}

// ─────────────────────────────────────────────
// Site Settings (key-value JSON store)
// ─────────────────────────────────────────────

export async function dbGetSetting<T>(key: string, fallback: T): Promise<T> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT value FROM site_settings WHERE `key` = ? LIMIT 1",
    [key]
  );
  if (!rows.length) return fallback;
  try {
    return JSON.parse(rows[0].value as string) as T;
  } catch {
    return fallback;
  }
}

export async function dbSaveSetting(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await pool.query(
    `INSERT INTO site_settings (\`key\`, value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
    [key, json]
  );
}

// ─────────────────────────────────────────────
// Helper: DB row → Article 타입 변환
// ─────────────────────────────────────────────

function rowToArticle(r: RowDataPacket, includeBody = true): Article {
  return {
    id: r.id as string,
    no: r.no != null ? Number(r.no) : undefined,
    title: r.title as string,
    category: r.category as string,
    date: r.date instanceof Date
      ? r.date.toISOString().slice(0, 10)
      : String(r.date ?? ""),
    status: r.status as import("@/types/article").ArticleStatus,
    views: Number(r.views ?? 0),
    body: includeBody ? (r.body as string) : "",
    thumbnail: (r.thumbnail as string) || undefined,
    thumbnailAlt: (r.thumbnail_alt as string) || undefined,
    tags: (r.tags as string) || undefined,
    author: (r.author as string) || undefined,
    authorEmail: (r.author_email as string) || undefined,
    summary: (r.summary as string) || undefined,
    slug: (r.slug as string) || undefined,
    metaDescription: (r.meta_description as string) || undefined,
    ogImage: (r.og_image as string) || undefined,
    scheduledPublishAt: r.scheduled_publish_at
      ? (r.scheduled_publish_at instanceof Date
          ? r.scheduled_publish_at.toISOString()
          : String(r.scheduled_publish_at))
      : undefined,
    updatedAt: r.updated_at
      ? (r.updated_at instanceof Date
          ? r.updated_at.toISOString()
          : String(r.updated_at))
      : undefined,
  };
}
