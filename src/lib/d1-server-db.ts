import "server-only";

import { d1HttpFirst, d1HttpQuery } from "@/lib/d1-http-client";
import { findDuplicateArticleCandidate, type ArticleDuplicateCandidate } from "@/lib/article-dedupe";
import { parseTags } from "@/lib/html-utils";
import type { Article, ArticleStatus, Comment, DistributeLog, NotificationRecord, ViewLogEntry } from "@/types/article";

const PUBLISHED_STATUS = "\uAC8C\uC2DC";
const SCHEDULED_STATUS = "\uC608\uC57D";
const DRAFT_STATUS = "\uC784\uC2DC\uC800\uC7A5";
const ARTICLE_LIST_COLUMNS = [
  "id",
  "no",
  "title",
  "category",
  "date",
  "status",
  "views",
  "thumbnail",
  "thumbnail_alt",
  "tags",
  "author",
  "author_email",
  "summary",
  "slug",
  "meta_description",
  "og_image",
  "scheduled_publish_at",
  "updated_at",
  "created_at",
  "source_url",
  "deleted_at",
  "parent_article_id",
  "review_note",
  "audit_trail_json",
  "ai_generated",
].join(", ");
const ARTICLE_DETAIL_COLUMNS = `${ARTICLE_LIST_COLUMNS}, body`;

export interface D1FilteredArticlesOptions {
  q?: string;
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
  includeDeleted?: boolean;
  authed?: boolean;
}

export interface D1FeedArticlesOptions {
  category?: string;
  author?: string;
  limit?: number;
  includeBody?: boolean;
}

export interface D1MaintenanceArticlesOptions {
  page?: number;
  limit?: number;
  since?: string;
  includeBody?: boolean;
}

export interface D1CommentCreateInput {
  id?: string;
  articleId: string;
  articleTitle?: string;
  author: string;
  content: string;
  status?: Comment["status"];
  ip?: string;
  parentId?: string;
}

export interface D1NotificationCreateInput {
  id?: string;
  type: string;
  title: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

function strOrUndef(value: unknown): string | undefined {
  return value != null && value !== "" ? String(value) : undefined;
}

function numberOrUndef(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseJsonOrUndefined<T>(value: unknown): T | undefined {
  if (Array.isArray(value) || (value && typeof value === "object")) return value as T;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function boolFromSql(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  return undefined;
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  const number = Number(value || fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(Math.trunc(number), max));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArticleRow(row: Record<string, unknown>, includeBody = true): Article {
  return {
    id: String(row.id),
    no: numberOrUndef(row.no),
    title: String(row.title || ""),
    category: String(row.category || "\uB274\uC2A4"),
    date: typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date || ""),
    status: (row.status as ArticleStatus) || DRAFT_STATUS,
    views: Number(row.views || 0),
    body: includeBody ? String(row.body || "") : "",
    thumbnail: strOrUndef(row.thumbnail),
    thumbnailAlt: strOrUndef(row.thumbnail_alt),
    tags: strOrUndef(row.tags),
    author: strOrUndef(row.author),
    authorEmail: strOrUndef(row.author_email),
    summary: strOrUndef(row.summary),
    slug: strOrUndef(row.slug),
    metaDescription: strOrUndef(row.meta_description),
    ogImage: strOrUndef(row.og_image),
    scheduledPublishAt: strOrUndef(row.scheduled_publish_at),
    updatedAt: strOrUndef(row.updated_at),
    sourceUrl: strOrUndef(row.source_url),
    parentArticleId: strOrUndef(row.parent_article_id),
    reviewNote: strOrUndef(row.review_note),
    auditTrail: parseJsonOrUndefined(row.audit_trail_json),
    deletedAt: strOrUndef(row.deleted_at),
    createdAt: strOrUndef(row.created_at),
    aiGenerated: boolFromSql(row.ai_generated),
  };
}

function whereClause(filters: string[]): string {
  return filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
}

function notDeletedFilter(includeDeleted?: boolean): string[] {
  return includeDeleted ? [] : ["deleted_at IS NULL"];
}

function publishedFilter(): string[] {
  return ["status = ?"];
}

export function d1RowToArticle(row: Record<string, unknown>, includeBody = true): Article {
  return normalizeArticleRow(row, includeBody);
}

export function d1RowToComment(row: Record<string, unknown>): Comment {
  return {
    id: String(row.id),
    articleId: String(row.article_id),
    articleTitle: strOrUndef(row.article_title),
    author: String(row.author || ""),
    content: String(row.content || ""),
    createdAt: String(row.created_at || ""),
    status: (row.status as Comment["status"]) || "pending",
    ip: strOrUndef(row.ip),
    parentId: strOrUndef(row.parent_id),
  };
}

export function d1RowToNotification(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    type: String(row.type || ""),
    title: String(row.title || ""),
    message: String(row.message || ""),
    metadata: parseJsonOrUndefined<Record<string, unknown>>(row.metadata_json) || {},
    read: row.read === true || row.read === 1 || row.read === "1" || row.read === "true",
    created_at: String(row.created_at || ""),
  };
}

export function d1RowToViewLog(row: Record<string, unknown>): ViewLogEntry {
  return {
    articleId: String(row.article_id),
    timestamp: String(row.timestamp || ""),
    path: String(row.path || "/"),
    visitorKey: strOrUndef(row.visitor_key),
    isAdmin: row.is_admin === true || row.is_admin === 1 || row.is_admin === "1",
    isBot: row.is_bot === true || row.is_bot === 1 || row.is_bot === "1",
    botName: strOrUndef(row.bot_name),
  };
}

export function d1RowToDistributeLog(row: Record<string, unknown>): DistributeLog {
  return {
    id: String(row.id),
    articleId: String(row.article_id),
    articleTitle: String(row.article_title || ""),
    portal: String(row.portal || ""),
    status: row.status as DistributeLog["status"],
    timestamp: String(row.timestamp || ""),
    message: String(row.message || ""),
  };
}

export async function d1GetSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await d1HttpFirst<{ value_json?: string }>(
    "SELECT value_json FROM site_settings WHERE key = ? LIMIT 1",
    [key],
  );
  if (!row?.value_json) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export async function d1SaveSetting(key: string, value: unknown): Promise<void> {
  await d1HttpQuery(
    `INSERT INTO site_settings (key, value_json, updated_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`,
    [key, JSON.stringify(value ?? null)],
  );
}

function articleToD1Row(article: Article): Record<string, unknown> {
  return {
    id: article.id,
    no: article.no ?? null,
    title: article.title,
    category: article.category,
    date: article.date,
    status: article.status,
    views: article.views ?? 0,
    body: article.body || "",
    thumbnail: article.thumbnail || null,
    thumbnail_alt: article.thumbnailAlt || null,
    tags: article.tags || null,
    author: article.author || null,
    author_email: article.authorEmail || null,
    summary: article.summary || null,
    slug: article.slug || null,
    meta_description: article.metaDescription || null,
    og_image: article.ogImage || null,
    scheduled_publish_at: article.scheduledPublishAt || null,
    updated_at: article.updatedAt || null,
    source_url: article.sourceUrl || null,
    deleted_at: article.deletedAt || null,
    parent_article_id: article.parentArticleId || null,
    review_note: article.reviewNote || null,
    audit_trail_json: JSON.stringify(article.auditTrail || []),
    created_at: article.createdAt || new Date().toISOString(),
    ai_generated: article.aiGenerated ? 1 : 0,
  };
}

function articleUpdateToD1Row(updates: Partial<Article>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (updates.no !== undefined) row.no = updates.no ?? null;
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.category !== undefined) row.category = updates.category;
  if (updates.date !== undefined) row.date = updates.date;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.views !== undefined) row.views = updates.views;
  if (updates.body !== undefined) row.body = updates.body || "";
  if (updates.thumbnail !== undefined) row.thumbnail = updates.thumbnail || null;
  if (updates.thumbnailAlt !== undefined) row.thumbnail_alt = updates.thumbnailAlt || null;
  if (updates.tags !== undefined) row.tags = updates.tags || null;
  if (updates.author !== undefined) row.author = updates.author || null;
  if (updates.authorEmail !== undefined) row.author_email = updates.authorEmail || null;
  if (updates.summary !== undefined) row.summary = updates.summary || null;
  if (updates.slug !== undefined) row.slug = updates.slug || null;
  if (updates.metaDescription !== undefined) row.meta_description = updates.metaDescription || null;
  if (updates.ogImage !== undefined) row.og_image = updates.ogImage || null;
  if (updates.scheduledPublishAt !== undefined) row.scheduled_publish_at = updates.scheduledPublishAt || null;
  if (updates.updatedAt !== undefined) row.updated_at = updates.updatedAt || null;
  if (updates.sourceUrl !== undefined) row.source_url = updates.sourceUrl || null;
  if (updates.deletedAt !== undefined) row.deleted_at = updates.deletedAt || null;
  if (updates.parentArticleId !== undefined) row.parent_article_id = updates.parentArticleId || null;
  if (updates.reviewNote !== undefined) row.review_note = updates.reviewNote || null;
  if (updates.auditTrail !== undefined) row.audit_trail_json = JSON.stringify(updates.auditTrail || []);
  if (updates.createdAt !== undefined) row.created_at = updates.createdAt || new Date().toISOString();
  if (updates.aiGenerated !== undefined) row.ai_generated = updates.aiGenerated ? 1 : 0;
  return row;
}

async function d1UpsertArticleSearchIndex(article: Article): Promise<void> {
  await d1HttpQuery(
    `INSERT INTO article_search_index (article_id, title, summary, tags, body_excerpt, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(article_id) DO UPDATE SET
       title = excluded.title,
       summary = excluded.summary,
       tags = excluded.tags,
       body_excerpt = excluded.body_excerpt,
       updated_at = excluded.updated_at`,
    [
      article.id,
      article.title || "",
      article.summary || "",
      article.tags || "",
      stripHtml(article.body || "").slice(0, 2000),
      article.updatedAt || article.createdAt || new Date().toISOString(),
    ],
  );
}

export async function d1CreateArticle(article: Article): Promise<void> {
  const row = articleToD1Row(article);
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns
    .filter((column) => column !== "id")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  await d1HttpQuery(
    `INSERT INTO articles (${columns.join(", ")})
     VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates}`,
    columns.map((column) => row[column]),
  );
  await d1UpsertArticleSearchIndex(article);
}

export async function d1UpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  const row = articleUpdateToD1Row(updates);
  const columns = Object.keys(row);
  if (columns.length === 0) return;

  await d1HttpQuery(
    `UPDATE articles SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`,
    [...columns.map((column) => row[column]), id],
  );

  const article = await d1GetArticleById(id, true);
  if (article) await d1UpsertArticleSearchIndex(article);
}

export async function d1IncrementViews(id: string): Promise<void> {
  await d1HttpQuery("UPDATE articles SET views = COALESCE(views, 0) + 1 WHERE id = ?", [id]);
}

export async function d1GetMaxArticleNo(): Promise<number> {
  const row = await d1HttpFirst<{ max_no?: number }>(
    "SELECT MAX(no) AS max_no FROM articles",
    [],
  );
  return Number(row?.max_no || 0);
}

export async function d1DeleteArticle(id: string): Promise<void> {
  await d1HttpQuery(
    "UPDATE articles SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    [id],
  );
}

export async function d1PurgeArticle(id: string): Promise<void> {
  await d1HttpQuery("DELETE FROM article_search_index WHERE article_id = ?", [id]);
  await d1HttpQuery("DELETE FROM articles WHERE id = ?", [id]);
}

export async function d1GetComments(opts: { articleId?: string; isAdmin?: boolean } = {}): Promise<Comment[]> {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (opts.articleId) {
    filters.push("article_id = ?");
    params.push(opts.articleId);
  }
  if (!opts.isAdmin) {
    filters.push("status = ?");
    params.push("approved");
  }
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT id, article_id, article_title, author, content, created_at, status, ip, parent_id
     FROM comments ${whereClause(filters)}
     ORDER BY created_at DESC`,
    params,
  );
  return rows.rows.map(d1RowToComment);
}

export async function d1CreateComment(data: D1CommentCreateInput): Promise<string> {
  const id = data.id || crypto.randomUUID();
  await d1HttpQuery(
    `INSERT INTO comments (id, article_id, article_title, author, content, status, ip, parent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       article_id = excluded.article_id,
       article_title = excluded.article_title,
       author = excluded.author,
       content = excluded.content,
       status = excluded.status,
       ip = excluded.ip,
       parent_id = excluded.parent_id`,
    [
      id,
      data.articleId,
      data.articleTitle || null,
      data.author,
      data.content,
      data.status || "pending",
      data.ip || null,
      data.parentId || null,
    ],
  );
  return id;
}

export async function d1UpdateCommentStatus(id: string, status: Comment["status"]): Promise<void> {
  await d1HttpQuery("UPDATE comments SET status = ? WHERE id = ?", [status, id]);
}

export async function d1DeleteComment(id: string): Promise<void> {
  await d1HttpQuery("DELETE FROM comments WHERE parent_id = ?", [id]);
  await d1HttpQuery("DELETE FROM comments WHERE id = ?", [id]);
}

export async function d1GetNotifications(limit = 50): Promise<NotificationRecord[]> {
  const safeLimit = clampLimit(limit, 50, 200);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT id, type, title, message, metadata_json, read, created_at
     FROM notifications
     ORDER BY created_at DESC
     LIMIT ?`,
    [safeLimit],
  );
  return rows.rows.map(d1RowToNotification);
}

export async function d1CountUnreadNotifications(): Promise<number> {
  const row = await d1HttpFirst<{ total?: number }>(
    "SELECT COUNT(*) AS total FROM notifications WHERE read = 0",
    [],
  );
  return Number(row?.total || 0);
}

export async function d1CreateNotification(data: D1NotificationCreateInput): Promise<string> {
  const id = data.id || crypto.randomUUID();
  await d1HttpQuery(
    `INSERT INTO notifications (id, type, title, message, metadata_json, read)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       title = excluded.title,
       message = excluded.message,
       metadata_json = excluded.metadata_json`,
    [
      id,
      data.type,
      data.title,
      data.message || "",
      JSON.stringify(data.metadata || {}),
    ],
  );
  return id;
}

export async function d1MarkNotificationsRead(opts: { ids?: string[]; all?: boolean }): Promise<void> {
  if (opts.all) {
    await d1HttpQuery("UPDATE notifications SET read = 1 WHERE read = 0", []);
    return;
  }

  const ids = Array.isArray(opts.ids) ? opts.ids.filter(Boolean) : [];
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  await d1HttpQuery(`UPDATE notifications SET read = 1 WHERE id IN (${placeholders})`, ids);
}

export async function d1DeleteAllNotifications(): Promise<void> {
  await d1HttpQuery("DELETE FROM notifications", []);
}

export async function d1GetViewLogs(limit = 2000): Promise<ViewLogEntry[]> {
  const safeLimit = clampLimit(limit, 2000, 10000);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT article_id, timestamp, path, visitor_key, is_admin, is_bot, bot_name
     FROM view_logs
     ORDER BY timestamp DESC
     LIMIT ?`,
    [safeLimit],
  );
  return rows.rows.map(d1RowToViewLog);
}

export async function d1AddViewLog(entry: ViewLogEntry): Promise<void> {
  await d1HttpQuery(
    `INSERT INTO view_logs (article_id, timestamp, path, visitor_key, is_admin, is_bot, bot_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.articleId,
      entry.timestamp,
      entry.path || "/",
      entry.visitorKey || null,
      entry.isAdmin ? 1 : 0,
      entry.isBot ? 1 : 0,
      entry.botName || null,
    ],
  );
}

export async function d1GetDistributeLogs(limit = 100): Promise<DistributeLog[]> {
  const safeLimit = clampLimit(limit, 100, 1000);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT id, article_id, article_title, portal, status, timestamp, message
     FROM distribute_logs
     ORDER BY timestamp DESC
     LIMIT ?`,
    [safeLimit],
  );
  return rows.rows.map(d1RowToDistributeLog);
}

export async function d1AddDistributeLogs(logs: DistributeLog[]): Promise<void> {
  for (const log of logs) {
    await d1HttpQuery(
      `INSERT INTO distribute_logs (id, article_id, article_title, portal, status, timestamp, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         article_id = excluded.article_id,
         article_title = excluded.article_title,
         portal = excluded.portal,
         status = excluded.status,
         timestamp = excluded.timestamp,
         message = excluded.message`,
      [
        log.id,
        log.articleId,
        log.articleTitle,
        log.portal,
        log.status,
        log.timestamp,
        log.message,
      ],
    );
  }
}

export async function d1ClearDistributeLogs(): Promise<void> {
  await d1HttpQuery("DELETE FROM distribute_logs", []);
}

export async function d1GetPublishedArticles(): Promise<Article[]> {
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS} FROM articles WHERE status = ? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC`,
    [PUBLISHED_STATUS],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, false));
}

export async function d1GetArticlesByCategory(category: string): Promise<Article[]> {
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS}
     FROM articles
     WHERE status = ? AND deleted_at IS NULL AND category = ?
     ORDER BY date DESC, created_at DESC
     LIMIT ?`,
    [PUBLISHED_STATUS, category, 500],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, false));
}

export async function d1GetArticlesByTag(tag: string): Promise<Article[]> {
  const like = `%${escapeLike(tag)}%`;
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS}
     FROM articles
     WHERE status = ? AND deleted_at IS NULL AND tags LIKE ? ESCAPE '\\'
     ORDER BY date DESC, created_at DESC
     LIMIT ?`,
    [PUBLISHED_STATUS, like, 500],
  );
  return rows.rows
    .map((row) => normalizeArticleRow(row, false))
    .filter((article) => parseTags(article.tags).includes(tag));
}

export async function d1GetRecentArticles(limit: number): Promise<Article[]> {
  const safeLimit = clampLimit(limit, 10, 100);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS} FROM articles WHERE status = ? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC LIMIT ?`,
    [PUBLISHED_STATUS, safeLimit],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, false));
}

export async function d1GetFeedArticles(opts: D1FeedArticlesOptions): Promise<Article[]> {
  const filters = ["status = ?", "deleted_at IS NULL"];
  const params: unknown[] = [PUBLISHED_STATUS];
  if (opts.category) {
    filters.push("category = ?");
    params.push(opts.category);
  }
  if (opts.author) {
    filters.push("author = ?");
    params.push(opts.author);
  }

  const safeLimit = clampLimit(opts.limit, 50, 200);
  const columns = opts.includeBody ? ARTICLE_DETAIL_COLUMNS : ARTICLE_LIST_COLUMNS;
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${columns}
     FROM articles
     ${whereClause(filters)}
     ORDER BY date DESC, created_at DESC
     LIMIT ?`,
    [...params, safeLimit],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, Boolean(opts.includeBody)));
}

export async function d1GetArticlesByAuthor(author: string, limit = 500): Promise<Article[]> {
  const safeLimit = clampLimit(limit, 500, 500);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS}
     FROM articles
     WHERE status = ? AND deleted_at IS NULL AND author = ?
     ORDER BY date DESC, created_at DESC
     LIMIT ?`,
    [PUBLISHED_STATUS, author, safeLimit],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, false));
}

export async function d1GetHomeArticles(limit = 240): Promise<Article[]> {
  const safeLimit = clampLimit(limit, 240, 300);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS}
     FROM articles
     WHERE status = ? AND deleted_at IS NULL
     ORDER BY date DESC, created_at DESC
     LIMIT ?`,
    [PUBLISHED_STATUS, safeLimit],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, false));
}

export async function d1GetTopArticles(limit = 10): Promise<Article[]> {
  const safeLimit = clampLimit(limit, 10, 50);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS}
     FROM articles
     WHERE status = ? AND deleted_at IS NULL AND date >= ?
     ORDER BY views DESC, date DESC, created_at DESC
     LIMIT ?`,
    [PUBLISHED_STATUS, cutoffDate, safeLimit],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, false));
}

export async function d1GetArticleSitemapData(limit = 10000): Promise<{ no: number; date: string; tags?: string; author?: string }[]> {
  const safeLimit = clampLimit(limit, 10000, 50000);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT no, date, tags, author
     FROM articles
     WHERE status = ? AND deleted_at IS NULL AND no IS NOT NULL
     ORDER BY date DESC
     LIMIT ?`,
    [PUBLISHED_STATUS, safeLimit],
  );
  return rows.rows.map((row) => ({
    no: Number(row.no || 0),
    date: typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date || ""),
    tags: strOrUndef(row.tags),
    author: strOrUndef(row.author),
  }));
}

export async function d1GetMaintenanceArticles(opts: D1MaintenanceArticlesOptions = {}): Promise<Article[]> {
  const page = Math.max(1, Math.trunc(Number(opts.page || 1)));
  const limit = clampLimit(opts.limit, 200, 500);
  const offset = (page - 1) * limit;
  const filters: string[] = [];
  const params: unknown[] = [];
  if (opts.since) {
    filters.push("updated_at >= ?");
    params.push(opts.since);
  }

  const columns = opts.includeBody ? ARTICLE_DETAIL_COLUMNS : ARTICLE_LIST_COLUMNS;
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${columns}
     FROM articles
     ${whereClause(filters)}
     ORDER BY updated_at IS NULL, updated_at DESC, date DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, Boolean(opts.includeBody)));
}

export async function d1GetScheduledArticles(): Promise<Article[]> {
  const now = new Date().toISOString();
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_DETAIL_COLUMNS}
     FROM articles
     WHERE status = ? AND deleted_at IS NULL AND scheduled_publish_at <= ?
     ORDER BY scheduled_publish_at ASC`,
    [SCHEDULED_STATUS, now],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, true));
}

export async function d1GetRecentTitles(days: number): Promise<{ title: string; sourceUrl?: string }[]> {
  const safeDays = Math.max(1, Math.min(Math.trunc(Number(days) || 1), 365));
  const cutoffDate = new Date(Date.now() - safeDays * 86_400_000).toISOString().slice(0, 10);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT title, source_url
     FROM articles
     WHERE status = ? AND deleted_at IS NULL AND date >= ?
     ORDER BY date DESC, created_at DESC
     LIMIT ?`,
    [PUBLISHED_STATUS, cutoffDate, 10000],
  );
  return rows.rows.map((row) => ({
    title: String(row.title || ""),
    sourceUrl: strOrUndef(row.source_url),
  }));
}

export async function d1FindArticleDuplicate(input: {
  id?: string;
  title?: string;
  sourceUrl?: string;
}): Promise<ArticleDuplicateCandidate | null> {
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT id, no, title, source_url
     FROM articles
     WHERE deleted_at IS NULL
       AND (source_url IS NOT NULL OR title IS NOT NULL)
     ORDER BY date DESC, created_at DESC
     LIMIT ?`,
    [50000],
  );

  return findDuplicateArticleCandidate(input, rows.rows.map((row) => ({
    id: strOrUndef(row.id),
    no: numberOrUndef(row.no),
    title: strOrUndef(row.title),
    sourceUrl: strOrUndef(row.source_url),
  })));
}

export async function d1GetDeletedArticles(): Promise<Article[]> {
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS}
     FROM articles
     WHERE deleted_at IS NOT NULL
     ORDER BY deleted_at DESC`,
    [],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, false));
}

export async function d1GetArticleById(id: string, includeDeleted = false): Promise<Article | null> {
  const filters = ["id = ?", ...notDeletedFilter(includeDeleted)];
  const row = await d1HttpFirst<Record<string, unknown>>(
    `SELECT ${ARTICLE_DETAIL_COLUMNS} FROM articles ${whereClause(filters)} LIMIT 1`,
    [id],
  );
  return row ? normalizeArticleRow(row, true) : null;
}

export async function d1GetArticleByNo(no: number): Promise<Article | null> {
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_DETAIL_COLUMNS} FROM articles WHERE no = ? AND deleted_at IS NULL ORDER BY CASE WHEN status = ? THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`,
    [no, PUBLISHED_STATUS],
  );
  return rows.rows[0] ? normalizeArticleRow(rows.rows[0], true) : null;
}

export async function d1SearchArticles(query: string, limit = 50): Promise<Article[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${escapeLike(q)}%`;
  const safeLimit = clampLimit(limit, 50, 100);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_DETAIL_COLUMNS}
     FROM articles
     WHERE status = ? AND deleted_at IS NULL
       AND (title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
     ORDER BY date DESC, created_at DESC
     LIMIT ?`,
    [PUBLISHED_STATUS, like, like, like, like, safeLimit],
  );
  return rows.rows.map((row) => normalizeArticleRow(row, true));
}

export async function d1GetFilteredArticles(opts: D1FilteredArticlesOptions): Promise<{ articles: Article[]; total: number }> {
  const filters = notDeletedFilter(opts.includeDeleted);
  const params: unknown[] = [];

  if (!opts.authed) {
    filters.push(...publishedFilter());
    params.push(PUBLISHED_STATUS);
  } else if (opts.status) {
    filters.push("status = ?");
    params.push(opts.status);
  }

  if (opts.category) {
    filters.push("category = ?");
    params.push(opts.category);
  }

  if (opts.q?.trim()) {
    const like = `%${escapeLike(opts.q.trim())}%`;
    filters.push("(title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }

  const limit = clampLimit(opts.limit, 20, 100);
  const page = Math.max(1, Math.trunc(Number(opts.page || 1)));
  const offset = (page - 1) * limit;
  const where = whereClause(filters);
  const countRow = await d1HttpFirst<{ total?: number }>(
    `SELECT COUNT(*) AS total FROM articles ${where}`,
    params,
  );
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT ${ARTICLE_LIST_COLUMNS} FROM articles ${where} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return {
    articles: rows.rows.map((row) => normalizeArticleRow(row, false)),
    total: Number(countRow?.total || 0),
  };
}
