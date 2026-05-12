#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT = "exports/supabase";
const DEFAULT_OUTPUT = "cloudflare/d1/import/generated-import.sql";
const DEFAULT_MEDIA_MANIFEST = "cloudflare/d1/import/media-manifest.json";
const DEFAULT_DUPLICATE_REPORT = "cloudflare/d1/import/duplicate-articles.json";
const DEFAULT_R2_BUCKET = "culturepeople-media-prod";
const DEFAULT_R2_PREFIX = "migrated";

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      i += 1;
    } else {
      flags.add(key);
    }
  }

  return { flags, values };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const body = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(body);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.result)) return parsed.result;

  throw new Error(`Unsupported JSON export shape: ${filePath}`);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sha(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function makeId(prefix, value) {
  return `${prefix}_${sha(value).slice(0, 24)}`;
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function booleanInt(value) {
  return value === true || value === "true" || value === 1 || value === "1" ? 1 : 0;
}

function jsonString(value, fallback = null) {
  if (value === undefined) return fallback === null ? null : JSON.stringify(fallback);
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value ?? fallback);
}

function sqlValue(value) {
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, row, options = {}) {
  const keys = Object.keys(row);
  const columns = keys.map((key) => `"${key}"`).join(", ");
  const values = keys.map((key) => sqlValue(row[key])).join(", ");
  const mode = options.mode || "OR REPLACE";
  return `INSERT ${mode} INTO "${table}" (${columns}) VALUES (${values});`;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function decodeBasicEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function isTrackingParam(key) {
  const normalized = String(key || "").trim().toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_PARAMS.has(key) || TRACKING_PARAMS.has(normalized);
}

function normalizeArticleSourceUrl(value) {
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
    for (const [key, paramValue] of params) url.searchParams.append(key, String(paramValue).trim());
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

function normalizeArticleTitle(value) {
  return stripHtml(value)
    .replace(/\s*-\s*뉴스와이어\s*$/i, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .normalize("NFC");
}

function duplicateKeyForArticle(article) {
  const source = normalizeArticleSourceUrl(article.source_url);
  if (source) return `source:${source}`;
  const title = normalizeArticleTitle(article.title);
  return title.length >= 8 ? `title:${title}` : "";
}

function dedupeArticlePairs(articlePairs, existingArticles = []) {
  const seen = new Map();
  const skipped = [];

  for (const existing of existingArticles) {
    const key = duplicateKeyForArticle(existing);
    if (key) seen.set(key, { scope: "existing", article: existing });
  }

  const kept = [];
  for (const pair of articlePairs) {
    const article = pair.article;
    const keys = [
      article.id ? `id:${article.id}` : "",
      article.no != null ? `no:${article.no}` : "",
      duplicateKeyForArticle(article),
    ].filter(Boolean);

    const duplicate = keys.map((key) => seen.get(key)).find(Boolean);
    if (duplicate) {
      skipped.push({
        id: article.id,
        no: article.no,
        title: article.title,
        source_url: article.source_url,
        reason: duplicate.scope === "existing" ? "existing_database_duplicate" : "incoming_export_duplicate",
        duplicate_id: duplicate.article.id || null,
        duplicate_no: duplicate.article.no ?? null,
        duplicate_title: duplicate.article.title || null,
        duplicate_source_url: duplicate.article.source_url || null,
      });
      continue;
    }

    kept.push(pair);
    for (const key of keys) seen.set(key, { scope: "incoming", article });
  }

  return { kept, skipped };
}

function extractUrlsFromHtml(html) {
  const urls = [];
  const body = String(html || "");
  for (const match of body.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

function normalizeArticle(row) {
  const id = stringOrNull(pick(row, "id")) || makeId("article", JSON.stringify(row));
  const body = stringOrNull(pick(row, "body")) || "";
  const title = stringOrNull(pick(row, "title")) || "(untitled)";
  const summary = stringOrNull(pick(row, "summary"));
  const tags = stringOrNull(pick(row, "tags"));

  return {
    article: {
      id,
      no: pick(row, "no") === undefined || pick(row, "no") === null ? null : Number(pick(row, "no")),
      title,
      category: stringOrNull(pick(row, "category")) || "news",
      date: stringOrNull(pick(row, "date")) || String(pick(row, "created_at", "createdAt") || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      status: stringOrNull(pick(row, "status")) || "draft",
      views: numberOrZero(pick(row, "views")),
      body,
      thumbnail: stringOrNull(pick(row, "thumbnail")),
      thumbnail_alt: stringOrNull(pick(row, "thumbnail_alt", "thumbnailAlt")),
      tags,
      author: stringOrNull(pick(row, "author")),
      author_email: stringOrNull(pick(row, "author_email", "authorEmail")),
      summary,
      slug: stringOrNull(pick(row, "slug")),
      meta_description: stringOrNull(pick(row, "meta_description", "metaDescription")),
      og_image: stringOrNull(pick(row, "og_image", "ogImage")),
      scheduled_publish_at: stringOrNull(pick(row, "scheduled_publish_at", "scheduledPublishAt")),
      updated_at: stringOrNull(pick(row, "updated_at", "updatedAt")),
      source_url: stringOrNull(pick(row, "source_url", "sourceUrl")),
      deleted_at: stringOrNull(pick(row, "deleted_at", "deletedAt")),
      parent_article_id: stringOrNull(pick(row, "parent_article_id", "parentArticleId")),
      review_note: stringOrNull(pick(row, "review_note", "reviewNote")),
      audit_trail_json: jsonString(pick(row, "audit_trail", "auditTrail"), []),
      created_at: stringOrNull(pick(row, "created_at", "createdAt")) || new Date().toISOString(),
      ai_generated: booleanInt(pick(row, "aiGenerated", "ai_generated")),
    },
    search: {
      article_id: id,
      title,
      summary: summary || "",
      tags: tags || "",
      body_excerpt: stripHtml(body).slice(0, 2000),
      updated_at: stringOrNull(pick(row, "updated_at", "updatedAt", "created_at", "createdAt")) || new Date().toISOString(),
    },
  };
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/);
    if (match?.[1]) {
      const ext = match[1];
      if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
    }
  } catch {
    // Fall through to webp. Most migrated images are optimized before new writes.
  }
  return "webp";
}

function shouldCopyToR2(url) {
  return /supabase|\/storage\/v1\/object\/public\//i.test(url);
}

function planR2Object(url, { mediaBaseUrl, bucket, prefix }) {
  if (!shouldCopyToR2(url)) return null;

  const hash = sha(url);
  const ext = extensionFromUrl(url);
  const object_key = `${prefix.replace(/^\/+|\/+$/g, "")}/${hash.slice(0, 2)}/${hash}.${ext}`;
  const publicBase = mediaBaseUrl ? mediaBaseUrl.replace(/\/+$/g, "") : "";

  return {
    bucket,
    object_key,
    public_url: publicBase ? `${publicBase}/${object_key}` : null,
  };
}

function replaceAllLiteral(value, replacements) {
  let result = value;
  for (const [source, target] of replacements) {
    result = result.split(source).join(target);
  }
  return result;
}

function rewriteArticlesForR2(articles, mediaManifest) {
  const replacements = mediaManifest
    .filter((entry) => entry.public_url)
    .map((entry) => [entry.source_url, entry.public_url]);

  if (replacements.length === 0) return articles;

  return articles.map((article) => ({
    ...article,
    body: replaceAllLiteral(article.body || "", replacements),
    thumbnail: article.thumbnail && replacements.find(([source]) => source === article.thumbnail)
      ? replacements.find(([source]) => source === article.thumbnail)[1]
      : article.thumbnail,
    og_image: article.og_image && replacements.find(([source]) => source === article.og_image)
      ? replacements.find(([source]) => source === article.og_image)[1]
      : article.og_image,
  }));
}

function normalizeSetting(row) {
  const key = stringOrNull(pick(row, "key"));
  if (!key) return null;

  return {
    key,
    value_json: jsonString(pick(row, "value", "value_json"), {}),
    updated_at: stringOrNull(pick(row, "updated_at", "updatedAt")) || new Date().toISOString(),
  };
}

function normalizeComment(row) {
  const id = stringOrNull(pick(row, "id")) || makeId("comment", JSON.stringify(row));
  return {
    id,
    article_id: stringOrNull(pick(row, "article_id", "articleId")) || "",
    article_title: stringOrNull(pick(row, "article_title", "articleTitle")),
    author: stringOrNull(pick(row, "author")) || "anonymous",
    content: stringOrNull(pick(row, "content")) || "",
    created_at: stringOrNull(pick(row, "created_at", "createdAt")) || new Date().toISOString(),
    status: stringOrNull(pick(row, "status")) || "pending",
    ip: stringOrNull(pick(row, "ip")),
    parent_id: stringOrNull(pick(row, "parent_id", "parentId")),
  };
}

function normalizeNotification(row) {
  const id = stringOrNull(pick(row, "id")) || makeId("notification", JSON.stringify(row));
  return {
    id,
    type: stringOrNull(pick(row, "type")) || "info",
    title: stringOrNull(pick(row, "title")) || "(untitled)",
    message: stringOrNull(pick(row, "message")) || "",
    metadata_json: jsonString(pick(row, "metadata", "metadata_json"), {}),
    read: booleanInt(pick(row, "read")),
    created_at: stringOrNull(pick(row, "created_at", "createdAt")) || new Date().toISOString(),
  };
}

function settingValue(setting) {
  try {
    return JSON.parse(setting.value_json);
  } catch {
    return null;
  }
}

function viewLogsFromSettings(settings) {
  const setting = settings.find((item) => item.key === "cp-view-logs");
  const logs = settingValue(setting || {});
  if (!Array.isArray(logs)) return [];

  return logs.map((log) => ({
    article_id: stringOrNull(pick(log, "articleId", "article_id")) || "",
    timestamp: stringOrNull(pick(log, "timestamp")) || new Date().toISOString(),
    path: stringOrNull(pick(log, "path")) || "/",
    visitor_key: stringOrNull(pick(log, "visitorKey", "visitor_key")),
    is_admin: booleanInt(pick(log, "isAdmin", "is_admin")),
    is_bot: booleanInt(pick(log, "isBot", "is_bot")),
    bot_name: stringOrNull(pick(log, "botName", "bot_name")),
  }));
}

function distributeLogsFromSettings(settings) {
  const setting = settings.find((item) => item.key === "cp-distribute-logs");
  const logs = settingValue(setting || {});
  if (!Array.isArray(logs)) return [];

  return logs.map((log) => ({
    id: stringOrNull(pick(log, "id")) || makeId("dist", JSON.stringify(log)),
    article_id: stringOrNull(pick(log, "articleId", "article_id")) || "",
    article_title: stringOrNull(pick(log, "articleTitle", "article_title")) || "",
    portal: stringOrNull(pick(log, "portal")) || "",
    status: stringOrNull(pick(log, "status")) || "pending",
    timestamp: stringOrNull(pick(log, "timestamp")) || new Date().toISOString(),
    message: stringOrNull(pick(log, "message")) || "",
  }));
}

function addMediaReference(mediaMap, article, url, usageType, options) {
  if (!url || !/^https?:\/\//i.test(url)) return;

  const planned = planR2Object(url, options);
  const key = url;
  const existing = mediaMap.get(key);

  if (existing) {
    existing.references.push({ article_id: article.id, usage_type: usageType });
    return;
  }

  mediaMap.set(key, {
    id: makeId("media", url),
    article_id: article.id,
    source_url: url,
    usage_type: usageType,
    references: [{ article_id: article.id, usage_type: usageType }],
    should_copy_to_r2: Boolean(planned),
    bucket: planned?.bucket || null,
    object_key: planned?.object_key || null,
    public_url: planned?.public_url || null,
  });
}

function buildMediaManifest(articles, options) {
  const media = new Map();

  for (const article of articles) {
    addMediaReference(media, article, article.thumbnail, "thumbnail", options);
    addMediaReference(media, article, article.og_image, "og_image", options);

    for (const url of extractUrlsFromHtml(article.body)) {
      addMediaReference(media, article, url, "body", options);
    }
  }

  return [...media.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function buildMediaObjectRows(mediaManifest) {
  return mediaManifest
    .filter((entry) => entry.should_copy_to_r2 && entry.bucket && entry.object_key && entry.public_url)
    .map((entry) => ({
      id: entry.id,
      provider: "r2",
      bucket: entry.bucket,
      object_key: entry.object_key,
      public_url: entry.public_url,
      source_url: entry.source_url,
      content_hash: null,
      content_type: null,
      byte_size: 0,
      width: null,
      height: null,
      article_id: entry.article_id,
      usage_type: entry.usage_type,
      created_at: new Date().toISOString(),
      last_seen_at: null,
    }));
}

function buildImportSql({ articles, searches, settings, comments, notifications, viewLogs, distributeLogs, mediaObjects, stats }) {
  const lines = [
    "-- Generated by scripts/prepare-d1-import.mjs",
    `-- Generated at: ${new Date().toISOString()}`,
    "-- Apply after cloudflare/d1/migrations/0001_initial_schema.sql",
    "-- Duplicate guard: source URL/title/id/no duplicates are filtered before SQL generation.",
    stats.existingDedupeArticles > 0
      ? `-- Existing D1 snapshot checked: ${stats.existingDedupeArticles} articles.`
      : "-- Existing D1 snapshot was not provided; use --existing-articles-json before merging into a non-empty D1 database.",
    "",
    "PRAGMA foreign_keys = OFF;",
    "BEGIN TRANSACTION;",
    "",
  ];

  for (const row of articles) lines.push(insert("articles", row));
  for (const row of searches) lines.push(insert("article_search_index", row));
  for (const row of settings) lines.push(insert("site_settings", row));
  for (const row of comments) lines.push(insert("comments", row));
  for (const row of notifications) lines.push(insert("notifications", row));
  for (const row of viewLogs) lines.push(insert("view_logs", row));
  for (const row of distributeLogs) lines.push(insert("distribute_logs", row));
  for (const row of mediaObjects) lines.push(insert("media_objects", row));

  const runId = makeId("migration", JSON.stringify(stats));
  lines.push("");
  lines.push(insert("migration_runs", {
    id: runId,
    source: "supabase-json-export",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: "prepared",
    articles_total: stats.articlesRaw,
    articles_imported: stats.articles,
    media_total: stats.media,
    media_copied: 0,
    errors_json: "[]",
    notes: `Prepared SQL import. Media copy to R2 must run separately. Skipped duplicate articles: ${stats.articlesSkippedDuplicate}.`,
  }));

  lines.push("");
  lines.push("COMMIT;");
  lines.push("PRAGMA foreign_keys = ON;");
  lines.push("");

  return lines.join("\n");
}

const { flags, values } = parseArgs(process.argv.slice(2));
const inputDir = path.resolve(values.input || DEFAULT_INPUT);
const outputSql = path.resolve(values.out || DEFAULT_OUTPUT);
const outputMediaManifest = path.resolve(values.media || DEFAULT_MEDIA_MANIFEST);
const outputDuplicateReport = path.resolve(values["duplicate-report"] || DEFAULT_DUPLICATE_REPORT);
const existingArticlesPath = values["existing-articles-json"]
  ? path.resolve(values["existing-articles-json"])
  : "";
const mediaBaseUrl = values["media-base-url"] || process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || "";
const mediaBucket = values["media-bucket"] || process.env.CLOUDFLARE_R2_PROD_BUCKET || DEFAULT_R2_BUCKET;
const mediaPrefix = values["media-prefix"] || DEFAULT_R2_PREFIX;
const dryRun = flags.has("dry-run");

if (!fs.existsSync(inputDir)) {
  console.error(`Input directory not found: ${inputDir}`);
  console.error("Expected JSON files such as articles.json, site_settings.json, comments.json, notifications.json.");
  process.exit(2);
}

const rawArticles = readJsonIfExists(path.join(inputDir, "articles.json"));
const rawSettings = readJsonIfExists(path.join(inputDir, "site_settings.json"));
const rawComments = readJsonIfExists(path.join(inputDir, "comments.json"));
const rawNotifications = readJsonIfExists(path.join(inputDir, "notifications.json"));
const existingArticles = existingArticlesPath
  ? readJsonIfExists(existingArticlesPath).map(normalizeArticle).map((pair) => pair.article)
  : [];

const dedupedArticlePairs = dedupeArticlePairs(rawArticles.map(normalizeArticle), existingArticles);
const articlePairs = dedupedArticlePairs.kept;
const originalArticles = articlePairs.map((pair) => pair.article);
const mediaManifest = buildMediaManifest(originalArticles, {
  mediaBaseUrl,
  bucket: mediaBucket,
  prefix: mediaPrefix,
});
const articles = rewriteArticlesForR2(originalArticles, mediaManifest);
const searches = articles.map((article) => ({
  article_id: article.id,
  title: article.title,
  summary: article.summary || "",
  tags: article.tags || "",
  body_excerpt: stripHtml(article.body).slice(0, 2000),
  updated_at: article.updated_at || article.created_at || new Date().toISOString(),
}));
const settings = rawSettings.map(normalizeSetting).filter(Boolean);
const comments = rawComments.map(normalizeComment).filter((row) => row.article_id);
const notifications = rawNotifications.map(normalizeNotification);
const viewLogs = viewLogsFromSettings(settings).filter((row) => row.article_id);
const distributeLogs = distributeLogsFromSettings(settings).filter((row) => row.article_id);
const mediaObjects = buildMediaObjectRows(mediaManifest);

const stats = {
  articles: articles.length,
  articlesRaw: rawArticles.length,
  articlesSkippedDuplicate: dedupedArticlePairs.skipped.length,
  existingDedupeArticles: existingArticles.length,
  settings: settings.length,
  comments: comments.length,
  notifications: notifications.length,
  viewLogs: viewLogs.length,
  distributeLogs: distributeLogs.length,
  media: mediaManifest.length,
  mediaObjects: mediaObjects.length,
  mediaRewrites: mediaManifest.filter((entry) => entry.public_url).length,
};

const sql = buildImportSql({
  articles,
  searches,
  settings,
  comments,
  notifications,
  viewLogs,
  distributeLogs,
  mediaObjects,
  stats,
});

if (!dryRun) {
  ensureDir(outputSql);
  ensureDir(outputMediaManifest);
  ensureDir(outputDuplicateReport);
  fs.writeFileSync(outputSql, sql, "utf8");
  fs.writeFileSync(outputMediaManifest, JSON.stringify(mediaManifest, null, 2) + "\n", "utf8");
  fs.writeFileSync(outputDuplicateReport, JSON.stringify(dedupedArticlePairs.skipped, null, 2) + "\n", "utf8");
}

console.log(JSON.stringify({
  inputDir,
  outputSql: dryRun ? null : outputSql,
  outputMediaManifest: dryRun ? null : outputMediaManifest,
  outputDuplicateReport: dryRun ? null : outputDuplicateReport,
  existingArticlesPath: existingArticlesPath || null,
  stats,
  mediaRewriteBaseUrl: mediaBaseUrl || null,
  mediaBucket,
  mediaPrefix,
}, null, 2));
