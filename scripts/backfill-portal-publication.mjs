#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE_URL = "https://culturepeople.co.kr";
const RUN_DIR = path.join(ROOT, ".portal-backfill-runs");
const PAGE_SIZE = 200;
const DEFAULT_DELAY_MS = 1200;
const DEFAULT_BATCH_SIZE = 50;
const D1_LOG_INSERT_BATCH_SIZE = 10;

function loadEnv() {
  for (const file of [".env.production.local", ".env.local", ".env"]) {
    const p = path.join(ROOT, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    baseUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || DEFAULT_BASE_URL,
    delayMs: DEFAULT_DELAY_MS,
    limit: Number.POSITIVE_INFINITY,
    batchSize: DEFAULT_BATCH_SIZE,
    includeLogged: false,
    logPreview: 20,
    source: "auto",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--base") opts.baseUrl = argv[++i] || opts.baseUrl;
    else if (arg === "--delay-ms") opts.delayMs = Math.max(0, Number(argv[++i] || opts.delayMs));
    else if (arg === "--limit") opts.limit = Math.max(1, Number(argv[++i] || 1));
    else if (arg === "--batch-size") opts.batchSize = Math.max(1, Number(argv[++i] || opts.batchSize));
    else if (arg === "--include-logged") opts.includeLogged = true;
    else if (arg === "--log-preview") opts.logPreview = Math.max(0, Number(argv[++i] || opts.logPreview));
    else if (arg === "--source") opts.source = argv[++i] || opts.source;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  opts.baseUrl = String(opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!Number.isFinite(opts.delayMs)) opts.delayMs = DEFAULT_DELAY_MS;
  if (!Number.isFinite(opts.limit)) opts.limit = Number.POSITIVE_INFINITY;
  if (!Number.isFinite(opts.batchSize)) opts.batchSize = DEFAULT_BATCH_SIZE;
  if (!["auto", "d1", "supabase", "api"].includes(opts.source)) opts.source = "auto";
  return opts;
}

function printHelp() {
  console.log(`CulturePeople portal publication backfill

Usage:
  node scripts/backfill-portal-publication.mjs [--apply] [--base URL] [--delay-ms 1200] [--limit N] [--batch-size 50] [--source auto|d1|supabase|api]

Default mode is dry-run. It reads published articles and current IndexNow success logs,
then submits only articles without a successful IndexNow log when --apply is present.
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function makeLogId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `portal_backfill_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cleanEnv(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function supabaseConfig() {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceKey = cleanEnv(process.env.SUPABASE_SERVICE_KEY);
  return {
    url,
    anonKey,
    serviceKey,
    configured: Boolean(url && (serviceKey || anonKey)),
  };
}

function d1Config() {
  const accountId = cleanEnv(process.env.CLOUDFLARE_ACCOUNT_ID);
  const databaseId = cleanEnv(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID);
  const apiToken = cleanEnv(process.env.CLOUDFLARE_API_TOKEN);
  const endpoint = accountId && databaseId
    ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`
    : "";
  return {
    accountId,
    databaseId,
    apiToken,
    endpoint,
    configured: Boolean(accountId && databaseId && apiToken),
  };
}

async function d1Query(sql, params = []) {
  const config = d1Config();
  if (!config.configured) throw new Error("Cloudflare D1 environment variables are not configured.");
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    const errors = Array.isArray(json.errors) ? json.errors.map((error) => error.message).filter(Boolean).join("; ") : "";
    throw new Error(`D1 HTTP ${response.status}: ${errors || "query failed"}`);
  }
  const result = Array.isArray(json.result) ? json.result[0] : json.result;
  if (result?.success === false) throw new Error(`D1 query failed: ${result.error || "unknown error"}`);
  return Array.isArray(result?.results) ? result.results : [];
}

async function getD1Setting(key, fallback) {
  const rows = await d1Query("SELECT value_json FROM site_settings WHERE key = ? LIMIT 1", [key]);
  const raw = rows[0]?.value_json;
  if (raw === undefined || raw === null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function insertD1DistributeLog(log) {
  await insertD1DistributeLogs([log]);
}

async function insertD1DistributeLogs(logs) {
  if (!logs.length) return;
  for (const chunk of chunkArray(logs, D1_LOG_INSERT_BATCH_SIZE)) {
    const params = [];
    const values = chunk.map((log) => {
      params.push(log.id, log.articleId, log.articleTitle, log.portal, log.status, log.timestamp, log.message);
      return "(?, ?, ?, ?, ?, ?, ?)";
    });
    await d1Query(
      `INSERT INTO distribute_logs (id, article_id, article_title, portal, status, timestamp, message)
       VALUES ${values.join(", ")}
       ON CONFLICT(id) DO UPDATE SET
         article_id = excluded.article_id,
         article_title = excluded.article_title,
         portal = excluded.portal,
         status = excluded.status,
         timestamp = excluded.timestamp,
         message = excluded.message`,
      params,
    );
  }
}

function supabaseHeaders(write = false) {
  const config = supabaseConfig();
  const key = write && config.serviceKey ? config.serviceKey : (config.serviceKey || config.anonKey);
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: write ? "resolution=merge-duplicates,return=minimal" : "return=representation",
  };
}

async function fetchSupabaseJson(pathname, init = {}) {
  const config = supabaseConfig();
  if (!config.configured) throw new Error("Supabase environment variables are not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs || 20000);
  try {
    const response = await fetch(`${config.url}${pathname}`, {
      ...init,
      headers: { ...supabaseHeaders(init.write), ...(init.headers || {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Supabase HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSupabaseSetting(key, fallback) {
  const rows = await fetchSupabaseJson(
    `/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { cache: "no-store" },
  );
  const value = Array.isArray(rows) ? rows[0]?.value : undefined;
  return value === undefined || value === null ? fallback : value;
}

async function saveSupabaseSetting(key, value) {
  await fetchSupabaseJson("/rest/v1/site_settings", {
    method: "POST",
    write: true,
    cache: "no-store",
    body: JSON.stringify({ key, value }),
  });
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs || 15000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
    }
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status} from ${url}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublishedArticles(baseUrl) {
  const articles = [];
  let page = 1;
  let total = null;

  while (true) {
    const url = `${baseUrl}/api/db/articles?status=${encodeURIComponent("게시")}&page=${page}&limit=${PAGE_SIZE}`;
    const data = await fetchJson(url, { cache: "no-store", timeoutMs: 20000 });
    if (!data.success || !Array.isArray(data.articles)) {
      throw new Error(data.error || "Failed to read published articles");
    }
    articles.push(...data.articles);
    total = typeof data.total === "number" ? data.total : total;
    if (data.articles.length === 0) break;
    if (total !== null && articles.length >= total) break;
    if (data.articles.length < PAGE_SIZE) break;
    page += 1;
  }

  return articles;
}

async function fetchPublishedArticlesFromSupabase() {
  const baseSelect = "id,no,title,category,date,status,views,thumbnail,tags,author,summary,created_at";
  const pageSize = 1000;
  let offset = 0;
  let withDeletedAt = true;
  const articles = [];

  while (true) {
    const select = withDeletedAt ? `${baseSelect},deleted_at` : baseSelect;
    const deletedFilter = withDeletedAt ? "&deleted_at=is.null" : "";
    const pathname = `/rest/v1/articles?select=${select}&status=eq.${encodeURIComponent("게시")}${deletedFilter}&order=date.desc,created_at.desc&limit=${pageSize}&offset=${offset}`;
    let rows;
    try {
      rows = await fetchSupabaseJson(pathname, { cache: "no-store", timeoutMs: 30000 });
    } catch (error) {
      if (withDeletedAt && offset === 0 && /deleted_at/i.test(error instanceof Error ? error.message : String(error))) {
        withDeletedAt = false;
        continue;
      }
      throw error;
    }
    if (!Array.isArray(rows)) throw new Error("Supabase articles response is not an array.");
    articles.push(...rows.map((row) => ({
      id: row.id,
      no: row.no,
      title: row.title,
      status: row.status,
      date: row.date,
      createdAt: row.created_at,
    })));
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return articles;
}

async function fetchPublishedArticlesFromD1() {
  const pageSize = 1000;
  let offset = 0;
  const articles = [];

  while (true) {
    const rows = await d1Query(
      `SELECT id, no, title, status, date, created_at
       FROM articles
       WHERE status = ? AND deleted_at IS NULL
       ORDER BY date DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      ["게시", pageSize, offset],
    );
    articles.push(...rows.map((row) => ({
      id: row.id,
      no: row.no,
      title: row.title,
      status: row.status,
      date: row.date,
      createdAt: row.created_at,
    })));
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return articles;
}

async function fetchSuccessfulIndexNowLogKeys(baseUrl) {
  const data = await fetchJson(`${baseUrl}/api/db/distribute-logs`, { cache: "no-store", timeoutMs: 15000 });
  const logs = Array.isArray(data.logs) ? data.logs : [];
  const keys = new Set();
  for (const log of logs) {
    if (log?.portal !== "IndexNow" || log?.status !== "success") continue;
    if (log.articleId !== undefined && log.articleId !== null) keys.add(String(log.articleId));
  }
  return { logs, keys };
}

async function fetchSuccessfulIndexNowLogKeysFromSupabase() {
  const logs = await getSupabaseSetting("cp-distribute-logs", []);
  const safeLogs = Array.isArray(logs) ? logs : [];
  const keys = new Set();
  for (const log of safeLogs) {
    if (log?.portal !== "IndexNow" || log?.status !== "success") continue;
    if (log.articleId !== undefined && log.articleId !== null) keys.add(String(log.articleId));
  }
  return { logs: safeLogs, keys };
}

async function fetchSuccessfulIndexNowLogKeysFromD1() {
  const d1Logs = await d1Query(
    "SELECT article_id, portal, status FROM distribute_logs WHERE status = ? AND portal LIKE ?",
    ["success", "%IndexNow%"],
  );
  const settingLogs = await getD1Setting("cp-distribute-logs", []);
  const logs = [
    ...d1Logs.map((log) => ({ articleId: log.article_id, portal: log.portal, status: log.status })),
    ...(Array.isArray(settingLogs) ? settingLogs : []),
  ];
  const keys = new Set();
  for (const log of logs) {
    if (!String(log?.portal || "").includes("IndexNow") || log?.status !== "success") continue;
    if (log.articleId !== undefined && log.articleId !== null) keys.add(String(log.articleId));
  }
  return { logs, keys };
}

function articlePortalIdentifier(article) {
  if (article.no !== undefined && article.no !== null && article.no !== "") return String(article.no);
  if (article.id !== undefined && article.id !== null && article.id !== "") return String(article.id);
  return "";
}

function articleAlreadyLogged(article, successKeys) {
  const no = article.no !== undefined && article.no !== null ? String(article.no) : "";
  const id = article.id !== undefined && article.id !== null ? String(article.id) : "";
  return Boolean((no && successKeys.has(no)) || (id && successKeys.has(id)));
}

function selectCandidates(articles, successKeys, includeLogged) {
  return articles.filter((article) => {
    if (article.status !== "게시") return false;
    if (!articlePortalIdentifier(article)) return false;
    if (!includeLogged && articleAlreadyLogged(article, successKeys)) return false;
    return true;
  });
}

async function addDistributeLog(baseUrl, article, status, message) {
  const log = {
    id: makeLogId(),
    articleId: String(article.id ?? article.no ?? ""),
    articleTitle: article.title || "(제목 없음)",
    portal: "IndexNow",
    status,
    timestamp: new Date().toISOString(),
    message,
  };
  await fetchJson(`${baseUrl}/api/db/distribute-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logs: [log] }),
    timeoutMs: 15000,
  });
  return log;
}

async function addSupabaseDistributeLog(article, status, message) {
  const existing = await getSupabaseSetting("cp-distribute-logs", []);
  const logs = Array.isArray(existing) ? existing : [];
  const log = {
    id: makeLogId(),
    articleId: String(article.id ?? article.no ?? ""),
    articleTitle: article.title || "(제목 없음)",
    portal: "IndexNow",
    status,
    timestamp: new Date().toISOString(),
    message,
  };
  await saveSupabaseSetting("cp-distribute-logs", [log, ...logs].slice(0, 100));
  return log;
}

async function addD1DistributeLog(article, status, message) {
  const log = {
    id: makeLogId(),
    articleId: String(article.id ?? article.no ?? ""),
    articleTitle: article.title || "(제목 없음)",
    portal: "IndexNow",
    status,
    timestamp: new Date().toISOString(),
    message,
  };
  await insertD1DistributeLog(log);
  return log;
}

async function addD1DistributeLogs(articles, status, message) {
  const timestamp = new Date().toISOString();
  const logs = articles.map((article) => ({
    id: makeLogId(),
    articleId: String(article.id ?? article.no ?? ""),
    articleTitle: article.title || "(제목 없음)",
    portal: "IndexNow",
    status,
    timestamp,
    message,
  }));
  await insertD1DistributeLogs(logs);
  return logs;
}

function normalizedBaseUrl(value, fallback) {
  const raw = String(value || fallback || DEFAULT_BASE_URL).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

function getIndexNowConfig(baseUrl, seoSettings) {
  const canonicalBase = normalizedBaseUrl(seoSettings?.canonicalUrl, baseUrl);
  const indexNowKey = String(seoSettings?.indexNowApiKey || "").trim();
  return {
    canonicalBase,
    host: new URL(canonicalBase).hostname,
    indexNowKey,
    keyLocation: indexNowKey ? `${canonicalBase}/${indexNowKey}.txt` : "",
  };
}

async function verifyIndexNowKeyLocation(baseUrl, seoSettings) {
  const config = getIndexNowConfig(baseUrl, seoSettings);
  if (!config.indexNowKey) {
    return { ok: false, reason: "missing_indexnow_key", status: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(config.keyLocation, {
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.text().catch(() => "");
    if (!response.ok) {
      return { ok: false, reason: "key_location_not_ok", status: response.status };
    }
    if (body.trim() !== config.indexNowKey) {
      return { ok: false, reason: "key_location_body_mismatch", status: response.status };
    }
    return { ok: true, reason: "ok", status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function submitArticleViaIndexNow(baseUrl, article, seoSettings, addLog) {
  const [result] = await submitArticlesViaIndexNowBatch(baseUrl, [article], seoSettings, async (articles, status, message) => {
    await addLog(articles[0], status, message);
  });
  return result ?? { outcome: "error", error: "empty_result" };
}

async function submitArticlesViaIndexNowBatch(baseUrl, articles, seoSettings, addLogs) {
  const config = getIndexNowConfig(baseUrl, seoSettings);

  if (!config.indexNowKey) {
    await addLogs(articles, "pending", "[manual-backfill] IndexNow API 키가 설정되지 않았습니다.");
    return articles.map(() => ({ outcome: "pending", reason: "missing_indexnow_key" }));
  }

  const urlList = articles.map((article) => `${config.canonicalBase}/article/${articlePortalIdentifier(article)}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: config.host,
        key: config.indexNowKey,
        keyLocation: config.keyLocation,
        urlList,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const status = response.status;
  if (status === 200 || status === 202) {
    await addLogs(articles, "success", `[manual-backfill] IndexNow 제출 완료 (HTTP ${status})`);
    return articles.map(() => ({ outcome: "success", status }));
  }

  const text = await response.text().catch(() => "");
  await addLogs(articles, "failed", `[manual-backfill] IndexNow 제출 실패 (HTTP ${status})`);
  return articles.map(() => ({ outcome: "failed", status, error: text.slice(0, 200) }));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function submitArticleViaApi(baseUrl, article) {
  const identifier = articlePortalIdentifier(article);
  const url = `${baseUrl}/article/${identifier}`;
  const data = await fetchJson(`${baseUrl}/api/seo/index-now`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, action: "URL_UPDATED" }),
    timeoutMs: 15000,
  });

  if (data.indexNow?.submitted) {
    const status = data.indexNow.status ?? "unknown";
    await addDistributeLog(baseUrl, article, "success", `[manual-backfill] IndexNow 제출 완료 (HTTP ${status})`);
    return { outcome: "success", status };
  }

  if (data.skipped) {
    await addDistributeLog(baseUrl, article, "pending", `[manual-backfill] ${data.reason || "IndexNow 제출이 건너뛰어졌습니다."}`);
    return { outcome: "pending", reason: data.reason || "skipped" };
  }

  const status = data.indexNow?.status ?? "unknown";
  await addDistributeLog(baseUrl, article, "failed", `[manual-backfill] IndexNow 제출 실패 (HTTP ${status})`);
  return { outcome: "failed", status };
}

async function main() {
  loadEnv();
  const opts = parseArgs(process.argv.slice(2));
  const source = opts.source === "auto"
    ? (d1Config().configured ? "d1" : supabaseConfig().configured ? "supabase" : "api")
    : opts.source;
  mkdirSync(RUN_DIR, { recursive: true });

  console.log("CulturePeople portal publication backfill");
  console.log(`- base: ${opts.baseUrl}`);
  console.log(`- mode: ${opts.apply ? "apply" : "dry-run"}`);
  console.log(`- delay: ${opts.delayMs}ms`);
  console.log(`- source: ${source}`);

  const [articles, logState, seoSettings] = source === "d1"
    ? await Promise.all([
      fetchPublishedArticlesFromD1(),
      fetchSuccessfulIndexNowLogKeysFromD1(),
      getD1Setting("cp-seo-settings", {}),
    ])
    : source === "supabase"
      ? await Promise.all([
      fetchPublishedArticlesFromSupabase(),
      fetchSuccessfulIndexNowLogKeysFromSupabase(),
      getSupabaseSetting("cp-seo-settings", {}),
    ])
      : await Promise.all([
      fetchPublishedArticles(opts.baseUrl),
      fetchSuccessfulIndexNowLogKeys(opts.baseUrl),
      Promise.resolve({}),
    ]);

  const allCandidates = selectCandidates(articles, logState.keys, opts.includeLogged);
  const candidates = allCandidates.slice(0, opts.limit);
  const skippedByLimit = allCandidates.length - candidates.length;
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    mode: opts.apply ? "apply" : "dry-run",
    publishedArticles: articles.length,
    successfulIndexNowLogsVisible: logState.keys.size,
    candidates: allCandidates.length,
    selected: candidates.length,
    skippedByLimit,
    includeLogged: opts.includeLogged,
    delayMs: opts.delayMs,
    batchSize: source === "api" ? 1 : opts.batchSize,
    source,
    results: [],
  };

  console.log(`- published articles: ${articles.length}`);
  console.log(`- visible successful IndexNow logs: ${logState.keys.size}`);
  console.log(`- candidates without visible success log: ${allCandidates.length}`);
  if (skippedByLimit > 0) console.log(`- selected by limit: ${candidates.length} (${skippedByLimit} left)`);

  if (!opts.apply) {
    for (const article of candidates.slice(0, opts.logPreview)) {
      console.log(`  dry-run: ${articlePortalIdentifier(article)} ${article.title || "(제목 없음)"}`);
    }
    const reportPath = path.join(RUN_DIR, `portal-backfill-dry-run-${timestampForFile()}.json`);
    writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    console.log(`- report: ${path.relative(ROOT, reportPath)}`);
    console.log("- no submissions made; rerun with --apply to submit");
    return;
  }

  if (source === "d1" || source === "supabase") {
    const keyCheck = await verifyIndexNowKeyLocation(opts.baseUrl, seoSettings);
    if (!keyCheck.ok) {
      const reportPath = path.join(RUN_DIR, `portal-backfill-blocked-${timestampForFile()}.json`);
      summary.blocked = {
        reason: keyCheck.reason,
        status: keyCheck.status,
        message: "IndexNow keyLocation must return the configured key before backfill submissions can run.",
      };
      writeFileSync(reportPath, JSON.stringify(summary, null, 2));
      console.error(`- blocked: IndexNow keyLocation check failed (${keyCheck.reason}${keyCheck.status ? `, HTTP ${keyCheck.status}` : ""})`);
      console.error(`- report: ${path.relative(ROOT, reportPath)}`);
      process.exit(2);
    }
    console.log(`- IndexNow keyLocation: ok (HTTP ${keyCheck.status})`);
  }

  let processed = 0;
  const batches = source === "api" ? candidates.map((article) => [article]) : chunkArray(candidates, opts.batchSize);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    try {
      const results = source === "d1"
        ? await submitArticlesViaIndexNowBatch(opts.baseUrl, batch, seoSettings, addD1DistributeLogs)
        : source === "supabase"
          ? await Promise.all(batch.map((article) => submitArticleViaIndexNow(opts.baseUrl, article, seoSettings, addSupabaseDistributeLog)))
          : await Promise.all(batch.map((article) => submitArticleViaApi(opts.baseUrl, article)));
      for (let itemIndex = 0; itemIndex < batch.length; itemIndex += 1) {
        const article = batch[itemIndex];
        const result = results[itemIndex] ?? { outcome: "error", error: "missing_result" };
        const identifier = articlePortalIdentifier(article);
        processed += 1;
        summary.results.push({ articleId: article.id, articleNo: article.no, identifier, title: article.title, ...result });
        if (itemIndex === 0 || batch.length === 1) {
          console.log(`  [${processed}/${candidates.length}] ${result.outcome}: ${identifier} ${article.title || "(제목 없음)"}`);
        }
      }
      if (batch.length > 1) {
        const sample = batch[0];
        const outcome = results[0]?.outcome || "unknown";
        console.log(`  batch ${batchIndex + 1}/${batches.length}: ${outcome} ${batch.length} urls (first ${articlePortalIdentifier(sample)})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const article of batch) {
        const identifier = articlePortalIdentifier(article);
        processed += 1;
        summary.results.push({ articleId: article.id, articleNo: article.no, identifier, title: article.title, outcome: "error", error: message });
      }
      console.log(`  batch ${batchIndex + 1}/${batches.length}: error ${batch.length} urls - ${message}`);
    }

    if (batchIndex < batches.length - 1 && opts.delayMs > 0) await sleep(opts.delayMs);
  }

  const counts = summary.results.reduce((acc, item) => {
    acc[item.outcome] = (acc[item.outcome] || 0) + 1;
    return acc;
  }, {});
  summary.counts = counts;
  const reportPath = path.join(RUN_DIR, `portal-backfill-apply-${timestampForFile()}.json`);
  writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(`- result counts: ${JSON.stringify(counts)}`);
  console.log(`- report: ${path.relative(ROOT, reportPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
