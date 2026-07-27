import {
  loadWorkerBlockedSubjectPolicy,
  matchWorkerBlockedSubject,
  readWorkerPolicyPublishedState,
} from "./blocked-subject-policy.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(\?|#|$)/i;
const TRUSTED_PROXY_HOST_RE = /(^|\.)newswire\.co\.kr$|(^|\.)korea\.kr$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIN_SOURCE_BODY_CHARS = 180;
const MIN_AI_BODY_CHARS = 220;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TELEGRAM_SETTINGS_KEY = "cp-telegram-settings";
const ADMIN_ACCOUNTS_SETTINGS_KEY = "cp-admin-accounts";
const AUTO_PRESS_SETTINGS_KEY = "cp-auto-press-settings";
const DEFAULT_AUTO_PRESS_AUTHOR_NAME = "박영래";
const CULTUREPEOPLE_CATEGORIES = ["문화", "엔터", "스포츠", "라이프", "테크·모빌리티", "비즈", "공공"];
const CATEGORY_ALIASES = {
  문화예술: "문화", 공연: "문화", "공연 예술": "문화", 공연예술: "문화", 미술: "문화", 전시: "문화", 출판: "문화", 문학: "문화", 도서: "문화", 문화재: "문화",
  연예: "엔터", 엔터테인먼트: "엔터", 영화: "엔터", 음악: "엔터", 방송: "엔터",
  생활: "라이프", 건강: "라이프", 교육: "라이프", 여행: "라이프",
  IT: "테크·모빌리티", 테크: "테크·모빌리티", 기술: "테크·모빌리티", 자동차: "테크·모빌리티",
  경제: "비즈", 금융: "비즈", 산업: "비즈", 기업: "비즈",
  정책: "공공", 정부: "공공", 사회: "공공", 환경: "공공",
};
const CATEGORY_KEYWORDS = {
  문화: ["문화", "공연", "연극", "뮤지컬", "전시", "미술", "예술", "도서", "출판", "문학", "축제", "문화재", "박물관"],
  엔터: ["연예", "배우", "가수", "방송", "드라마", "영화", "음악", "앨범", "음원", "콘서트", "k-pop", "케이팝", "팬덤", "ott"],
  스포츠: ["스포츠", "선수", "경기", "리그", "축구", "야구", "농구", "배구", "골프", "올림픽", "e스포츠"],
  라이프: ["라이프", "여행", "관광", "건강", "의료", "교육", "육아", "패션", "뷰티", "푸드", "식품", "반려동물"],
  "테크·모빌리티": ["테크", "기술", "it", "ai", "인공지능", "소프트웨어", "반도체", "통신", "자동차", "모빌리티", "로봇", "우주"],
  비즈: ["비즈", "기업", "산업", "경제", "금융", "투자", "스타트업", "부동산", "유통", "마케팅", "수출", "매출"],
  공공: ["공공", "정부", "정책", "법률", "지자체", "시청", "도청", "복지", "환경", "사회", "국제", "부처", "위원회"],
};
const TELEGRAM_DAILY_REPORT_CRON = "0 0 * * *";
const WORKER_DAILY_REPORT_SETTING_PREFIX = "cp-worker-telegram-daily-report:";
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
  "sourcetype",
  "source_type",
  "ref",
  "referer",
]);
const AI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    bodyHtml: { type: "STRING" },
    category: { type: "STRING" },
    tags: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["title", "summary", "bodyHtml", "category", "tags"],
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function nowIso() {
  return new Date().toISOString();
}

function kstDateKey(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function todayKst(date = new Date()) {
  return kstDateKey(date);
}

function yesterdayKstDateKey(now = new Date()) {
  const [year, month, day] = kstDateKey(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function daysAgoKstDateKey(days, now = new Date()) {
  const [year, month, day] = kstDateKey(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - Math.max(0, days))).toISOString().slice(0, 10);
}

function kstMonthKey(now = new Date()) {
  return kstDateKey(now).slice(0, 7);
}

function kstDayBoundsUtc(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) {
    const today = todayKst();
    return kstDayBoundsUtc(today);
  }
  const start = Date.UTC(year, month - 1, day, -9, 0, 0, 0);
  return [new Date(start).toISOString(), new Date(start + MS_PER_DAY).toISOString()];
}

function nextKstDailyRetryIso(offsetMinutes = 10, now = new Date()) {
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const retryUtcMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + 1,
    0,
    offsetMinutes,
    0,
    0,
  ) - 9 * 60 * 60 * 1000;
  return new Date(retryUtcMs).toISOString();
}

function asInt(value, fallback, min = 1, max = 300) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function envFlag(env, name, fallback = false) {
  const raw = env && Object.prototype.hasOwnProperty.call(env, name) ? env[name] : undefined;
  if (raw == null || raw === "") return fallback;
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "n", "off", "disabled"].includes(value)) return false;
  return fallback;
}

function workerEnabled(env) {
  return envFlag(env, "AUTO_PRESS_WORKER_ENABLED", false);
}

function workerDryRunEnabled(env) {
  return envFlag(env, "AUTO_PRESS_WORKER_DRY_RUN", true);
}

function autoPublishEnabled(env) {
  return envFlag(env, "AUTO_PRESS_AUTO_PUBLISH_ENABLED", false);
}

function telegramDailyReportEnabled(env) {
  return envFlag(env, "AUTO_PRESS_TELEGRAM_DAILY_REPORT_ENABLED", true);
}

function supabaseRecoveryReportEnabled(env) {
  return envFlag(env, "SUPABASE_RECOVERY_REPORT_ENABLED", true);
}

function workerRuntimeControls(env) {
  return {
    enabled: workerEnabled(env),
    dryRun: workerDryRunEnabled(env),
    autoPublishEnabled: autoPublishEnabled(env),
    telegramDailyReportEnabled: telegramDailyReportEnabled(env),
    supabaseRecoveryReportEnabled: supabaseRecoveryReportEnabled(env),
  };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function normalizeTitle(title) {
  return stripHtml(title)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .normalize("NFC")
    .slice(0, 220);
}

function decodeBasicEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractNewswireProviderName(text) {
  const compact = decodeBasicEntities(text)
    .replace(/&#x?[0-9a-f]+;?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = compact.match(/뉴스\s*제공\s+(.{2,80}?)(?:\s+\d{4}[-.년]|\s+보도자료|\s+전체기사|\s+구독|$)/i);
  return String(match?.[1] || "")
    .replace(/[^\p{L}\p{N}&()·.\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function extractElementHtmlByClass(html, className) {
  const classPattern = escapeRegExp(className);
  const startRe = new RegExp(`<div\\b[^>]*class=["'][^"']*\\b${classPattern}\\b[^"']*["'][^>]*>`, "i");
  const start = startRe.exec(String(html || ""));
  if (!start) return "";

  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start.index + start[0].length;
  let depth = 1;
  let match;
  while ((match = tagRe.exec(html))) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(start.index, tagRe.lastIndex);
  }
  return html.slice(start.index);
}

function extractSourceBodyText(html, url) {
  const host = getHostname(url);
  if (/(^|\.)korea\.kr$/i.test(host)) {
    const articleHtml = extractElementHtmlByClass(html, "view_cont")
      || extractElementHtmlByClass(html, "article_body");
    if (articleHtml) return stripHtml(articleHtml);
  }
  return stripHtml(html);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetaContent(html, attrName, attrValue) {
  const attr = escapeRegExp(attrName);
  const value = escapeRegExp(attrValue);
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeBasicEntities(match[1]).trim();
  }
  return "";
}

function extractMetaList(html, attrName, attrValue) {
  const raw = extractMetaContent(html, attrName, attrValue);
  return raw ? raw.split(",").map((part) => part.trim()).filter(Boolean) : [];
}

function isTrackingParam(key) {
  const normalized = String(key || "").trim().toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_PARAMS.has(normalized);
}

function normalizeSourceUrl(value) {
  const raw = decodeBasicEntities(value).trim();
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

function makeId(prefix) {
  const rand = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now()}_${String(rand).replace(/-/g, "").slice(0, 12)}`;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(toNumber(value));
}

function escapeTelegramHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseTelegramChatIds(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter((value) => /^-?\d+$/.test(value));
}

function isEncryptedSecret(value) {
  const parts = String(value || "").split(":");
  return parts.length === 3
    && parts[0].length === 24
    && parts[1].length === 32
    && parts.every((part) => /^[0-9a-f]+$/i.test(part));
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function decryptStoredSecret(env, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!isEncryptedSecret(text)) return text;
  const cookieSecret = String(env.COOKIE_SECRET || "").trim();
  if (!cookieSecret) return "";
  try {
    const [ivHex, authTagHex, cipherHex] = text.split(":");
    const keyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cookieSecret));
    const key = await crypto.subtle.importKey("raw", keyHash, { name: "AES-GCM" }, false, ["decrypt"]);
    const encrypted = hexToBytes(`${cipherHex}${authTagHex}`);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(ivHex), tagLength: 128 }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.warn("[auto-press-worker] stored secret decrypt failed:", error instanceof Error ? error.message : error);
    return "";
  }
}

async function readSiteSetting(env, key, fallback = null) {
  if (!env.DB) return fallback;
  try {
    const row = await env.DB.prepare("SELECT value_json FROM site_settings WHERE key = ? LIMIT 1").bind(key).first();
    return parseJson(row?.value_json, fallback);
  } catch (error) {
    console.warn("[auto-press-worker] site setting read failed:", key, error instanceof Error ? error.message : error);
    return fallback;
  }
}

async function writeSiteSetting(env, key, value) {
  if (!env.DB) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO site_settings (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
    ).bind(key, JSON.stringify(value), nowIso()).run();
    return true;
  } catch (error) {
    console.warn("[auto-press-worker] site setting write failed:", key, error instanceof Error ? error.message : error);
    return false;
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function comparable(value) {
  return cleanText(value).toLowerCase();
}

function findAdminAccount(accounts, target) {
  const normalizedTarget = comparable(target);
  if (!normalizedTarget || !Array.isArray(accounts)) return null;
  const activeAccounts = accounts.filter((account) => account && account.active !== false);
  return activeAccounts.find((account) => comparable(account.name) === normalizedTarget)
    || activeAccounts.find((account) => comparable(account.username) === normalizedTarget)
    || activeAccounts.find((account) => comparable(account.id) === normalizedTarget)
    || null;
}

async function resolveAutoPressAuthor(env, options = {}) {
  const settings = await readSiteSetting(env, AUTO_PRESS_SETTINGS_KEY, {});
  const preferred = cleanText(options.author || settings?.author);
  const legacy = new Set(["", "CulturePeople AI", "컬처피플 AI", "편집팀"]);
  const target = legacy.has(preferred) ? DEFAULT_AUTO_PRESS_AUTHOR_NAME : (preferred || DEFAULT_AUTO_PRESS_AUTHOR_NAME);
  const accounts = await readSiteSetting(env, ADMIN_ACCOUNTS_SETTINGS_KEY, []);
  const account = findAdminAccount(accounts, target) || findAdminAccount(accounts, DEFAULT_AUTO_PRESS_AUTHOR_NAME);
  if (account?.name) {
    return {
      name: cleanText(account.name),
      email: cleanText(account.email),
    };
  }
  return { name: target || DEFAULT_AUTO_PRESS_AUTHOR_NAME, email: "" };
}

async function d1First(env, sql, params = []) {
  const result = await env.DB.prepare(sql).bind(...params).first();
  return result || {};
}

async function d1All(env, sql, params = []) {
  const result = await env.DB.prepare(sql).bind(...params).all();
  return result.results || [];
}

function parseAiJson(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidates = [text, fenced].filter(Boolean);
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate; Gemini can occasionally wrap JSON despite responseMimeType.
    }
  }
  return null;
}

function authOk(request, env) {
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  const direct = request.headers.get("x-auto-press-worker-secret") || "";
  return auth === `Bearer ${secret}` || direct === secret;
}

async function event(env, runId, itemId, level, code, message, metadata = {}) {
  try {
    await env.DB.prepare(
      `INSERT INTO auto_press_events (run_id, item_id, level, code, message, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(runId, itemId || null, level, code, message, JSON.stringify(metadata)).run();
    await env.DB.prepare(
      `UPDATE auto_press_runs
       SET last_event_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso(), nowIso(), runId).run();
    return true;
  } catch (error) {
    console.warn("[auto-press-worker] event logging failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

async function loadItem(env, itemId) {
  return env.DB.prepare("SELECT * FROM auto_press_items WHERE id = ? LIMIT 1").bind(itemId).first();
}

async function loadRun(env, runId) {
  return env.DB.prepare("SELECT * FROM auto_press_runs WHERE id = ? LIMIT 1").bind(runId).first();
}

async function listDueItems(env, limit) {
  const now = nowIso();
  const result = await env.DB.prepare(
    `SELECT *
     FROM auto_press_items
     WHERE status = 'queued'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       AND (lease_until IS NULL OR lease_until <= ?)
       AND (attempt_count < max_attempts OR reason_code = 'DAILY_LIMIT_REACHED')
     ORDER BY priority ASC, created_at ASC
     LIMIT ?`,
  ).bind(now, now, limit).all();
  return result.results || [];
}

function classifyExpiredLease(item, publishedArticle = null) {
  const hasArticle = item?.article_id || item?.article_no || item?.published_at || publishedArticle?.id || publishedArticle?.no;
  if (hasArticle) return { action: "reconcile_published", articleId: item.article_id || publishedArticle?.id || null, articleNo: Number(item.article_no || publishedArticle?.no || 0) || null };
  const attempts = Number(item?.attempt_count || 0);
  const maxAttempts = Math.max(1, Number(item?.max_attempts || 3));
  return attempts >= maxAttempts ? { action: "mark_failed", attempts, maxAttempts } : { action: "requeue", attempts, maxAttempts };
}

async function findPublishedArticleForExpiredItem(env, item) {
  if (item.article_id) {
    const article = await env.DB.prepare("SELECT id, no, status FROM articles WHERE id = ? AND status = '게시' LIMIT 1").bind(item.article_id).first();
    if (article) return article;
  }
  if (item.article_no) {
    const article = await env.DB.prepare("SELECT id, no, status FROM articles WHERE no = ? AND status = '게시' LIMIT 1").bind(Number(item.article_no)).first();
    if (article) return article;
  }
  const canonicalUrl = normalizeSourceUrl(item.canonical_url || item.source_url);
  const sourceUrl = String(item.source_url || "").trim();
  if (!canonicalUrl && !sourceUrl) return null;
  return env.DB.prepare("SELECT id, no, status FROM articles WHERE (source_url = ? OR source_url = ?) AND status = '게시' ORDER BY created_at DESC LIMIT 1").bind(canonicalUrl || sourceUrl, sourceUrl || canonicalUrl).first();
}

async function recoverExpiredLeases(env, requestedLimit = 5) {
  const limit = asInt(requestedLimit, 5, 1, 5);
  const now = nowIso();
  const staleWithoutLease = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const rows = await env.DB.prepare(
    `SELECT * FROM auto_press_items
     WHERE status = 'running'
       AND ((lease_until IS NOT NULL AND lease_until <= ?) OR (lease_until IS NULL AND updated_at <= ?))
     ORDER BY COALESCE(lease_until, updated_at) ASC
     LIMIT ?`,
  ).bind(now, staleWithoutLease, limit).all();
  const results = [];
  const runIds = new Set();
  for (const item of rows.results || []) {
    const publishedArticle = await findPublishedArticleForExpiredItem(env, item);
    const classification = classifyExpiredLease(item, publishedArticle);
    let result;
    if (classification.action === "reconcile_published") {
      result = await env.DB.prepare(
        `UPDATE auto_press_items
         SET status='ok', reason_code='STALE_LEASE_RECONCILED', reason_message='만료 lease를 게시 기사 근거로 정합화했습니다.',
             article_id=COALESCE(article_id, ?), article_no=COALESCE(article_no, ?), retryable=0,
             next_retry_at=NULL, lease_until=NULL, completed_at=COALESCE(completed_at, ?), updated_at=?
         WHERE id=? AND status='running'
           AND ((lease_until IS NOT NULL AND lease_until <= ?) OR (lease_until IS NULL AND updated_at <= ?))`,
      ).bind(classification.articleId, classification.articleNo, now, now, item.id, now, staleWithoutLease).run();
    } else if (classification.action === "mark_failed") {
      result = await env.DB.prepare(
        `UPDATE auto_press_items
         SET status='fail', reason_code='STALE_LEASE_MAX_ATTEMPTS', reason_message='만료 lease가 최대 재시도 횟수에 도달했습니다.',
             retryable=0, next_retry_at=NULL, lease_until=NULL, completed_at=COALESCE(completed_at, ?), updated_at=?
         WHERE id=? AND status='running'
           AND ((lease_until IS NOT NULL AND lease_until <= ?) OR (lease_until IS NULL AND updated_at <= ?))`,
      ).bind(now, now, item.id, now, staleWithoutLease).run();
    } else {
      result = await env.DB.prepare(
        `UPDATE auto_press_items
         SET status='queued', reason_code='STALE_LEASE_RECOVERED', reason_message='Worker가 만료 lease를 제한적으로 재큐잉했습니다.',
             retryable=1, next_retry_at=?, lease_until=NULL, updated_at=?
         WHERE id=? AND status='running'
           AND ((lease_until IS NOT NULL AND lease_until <= ?) OR (lease_until IS NULL AND updated_at <= ?))`,
      ).bind(now, now, item.id, now, staleWithoutLease).run();
    }
    if (Number(result.meta?.changes || 0) !== 1) continue;
    runIds.add(item.run_id);
    await event(env, item.run_id, item.id, "warn", "STALE_LEASE_RECOVERY", "Worker가 만료된 처리 lease를 복구했습니다.", { action: classification.action });
    results.push({ itemId: item.id, action: classification.action });
  }
  for (const runId of runIds) await refreshRunCounts(env, runId);
  return { recovered: results.length, results };
}

function staleLeaseRecoveryEnabled(env) {
  return String(env.AUTO_PRESS_STALE_LEASE_RECOVERY_ENABLED || "false").toLowerCase() === "true";
}

async function recoverExpiredLeasesWithObservationWindow(env, requestedLimit = 5) {
  if (!staleLeaseRecoveryEnabled(env)) return { recovered: 0, disabled: true, reason: "STALE_LEASE_RECOVERY_DISABLED", results: [] };
  const observationHours = asInt(env.AUTO_PRESS_STALE_LEASE_OBSERVATION_HOURS, 24, 1, 168);
  const cutoff = new Date(Date.now() - observationHours * 60 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM auto_press_events WHERE code='STALE_LEASE_RECOVERY' AND created_at >= ?",
  ).bind(cutoff).first();
  if (Number(recent?.count || 0) > 0) {
    return { recovered: 0, observationHold: true, observationHours, reason: "OBSERVATION_WINDOW_ACTIVE", results: [] };
  }
  return { ...(await recoverExpiredLeases(env, requestedLimit)), observationHours };
}

async function acquireLease(env, item) {
  const now = nowIso();
  const leaseUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    `UPDATE auto_press_items
     SET status = 'running',
         started_at = COALESCE(started_at, ?),
         attempt_count = attempt_count + 1,
         retry_count = retry_count + 1,
         lease_until = ?,
         reason_code = NULL,
         reason_message = 'Worker 처리 중',
         updated_at = ?
     WHERE id = ?
       AND status = 'queued'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       AND (lease_until IS NULL OR lease_until <= ?)
       AND (attempt_count < max_attempts OR reason_code = 'DAILY_LIMIT_REACHED')`,
  ).bind(now, leaseUntil, now, item.id, now, now).run();
  return (result.meta && result.meta.changes > 0) ? leaseUntil : null;
}

async function refreshRunCounts(env, runId) {
  const rows = await env.DB.prepare(
    `SELECT status, COUNT(*) AS count
     FROM auto_press_items
     WHERE run_id = ?
     GROUP BY status`,
  ).bind(runId).all();
  const counts = Object.fromEntries((rows.results || []).map((row) => [row.status, Number(row.count || 0)]));
  const published = Number(counts.ok || 0);
  const failed = Number(counts.fail || 0);
  const queued = Number(counts.queued || 0);
  const running = Number(counts.running || 0);
  const skipped = Number(counts.skip || 0) + Number(counts.dup || 0) + Number(counts.no_image || 0) + Number(counts.old || 0);
  const status = running > 0 ? "running" : queued > 0 ? "queued" : failed > 0 && published === 0 && skipped === 0 ? "failed" : "completed";
  await env.DB.prepare(
    `UPDATE auto_press_runs
     SET status = ?,
         processed_count = ?,
         published_count = ?,
         skipped_count = ?,
         failed_count = ?,
         queued_count = ?,
         completed_at = CASE WHEN ? = 0 AND ? = 0 THEN COALESCE(completed_at, ?) ELSE completed_at END,
         last_event_at = ?,
         updated_at = ?
     WHERE id = ?`,
  ).bind(
    status,
    published + failed + skipped,
    published,
    skipped,
    failed,
    queued,
    queued,
    running,
    nowIso(),
    nowIso(),
    nowIso(),
    runId,
  ).run();
}

async function finishItem(env, item, status, reasonCode, reasonMessage, patch = {}) {
  const now = nowIso();
  const terminal = ["ok", "dup", "no_image", "old", "skip", "fail"].includes(status) ? 1 : 0;
  await env.DB.prepare(
    `UPDATE auto_press_items
     SET status = ?,
         reason_code = ?,
         reason_message = ?,
         article_id = COALESCE(?, article_id),
         article_no = COALESCE(?, article_no),
         image_url = COALESCE(?, image_url),
         image_count = COALESCE(?, image_count),
         retryable = CASE WHEN ? = 1 THEN 0 ELSE retryable END,
         next_retry_at = CASE WHEN ? = 1 THEN NULL ELSE next_retry_at END,
         lease_until = NULL,
         completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END,
         updated_at = ?
     WHERE id = ?`,
  ).bind(
    status,
    reasonCode || null,
    reasonMessage || "",
    patch.articleId || null,
    patch.articleNo || null,
    patch.imageUrl || null,
    Number.isFinite(patch.imageCount) ? patch.imageCount : null,
    terminal,
    terminal,
    terminal,
    now,
    now,
    item.id,
  ).run();
  await refreshRunCounts(env, item.run_id).catch((error) => {
    console.warn("[auto-press-worker] run count refresh failed:", error instanceof Error ? error.message : error);
  });
}

async function dailyUsage(env) {
  const date = todayKst();
  const row = await env.DB.prepare("SELECT * FROM auto_press_daily_usage WHERE date = ? LIMIT 1").bind(date).first();
  if (row) return row;
  await env.DB.prepare(
    "INSERT INTO auto_press_daily_usage (date, created_at, updated_at) VALUES (?, ?, ?)",
  ).bind(date, nowIso(), nowIso()).run();
  return env.DB.prepare("SELECT * FROM auto_press_daily_usage WHERE date = ? LIMIT 1").bind(date).first();
}

async function incrementUsage(env, field) {
  const allowed = new Set(["jobs_processed", "ai_calls", "publishes", "image_uploads", "source_fetch_failures"]);
  if (!allowed.has(field)) return;
  const date = todayKst();
  await env.DB.prepare(
    `INSERT INTO auto_press_daily_usage (date, ${field}, created_at, updated_at)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       ${field} = ${field} + 1,
       updated_at = excluded.updated_at`,
  ).bind(date, nowIso(), nowIso()).run();
}

async function loadTelegramRecipients(env, options = {}) {
  const settings = await readSiteSetting(env, TELEGRAM_SETTINGS_KEY, {});
  const settingsEnabled = settings?.enabled !== false;
  const ids = new Set();
  for (const raw of [
    env.TELEGRAM_ALLOWED_CHAT_IDS,
    env.TELEGRAM_CHAT_IDS,
    env.TELEGRAM_ADMIN_CHAT_IDS,
    env.TELEGRAM_CHAT_ID,
    options.includeDisabled || settingsEnabled ? settings?.chatIds : "",
  ]) {
    for (const id of parseTelegramChatIds(raw)) ids.add(id);
  }
  return {
    chatIds: [...ids],
    settingsEnabled,
    storedChatIdsConfigured: Boolean(settings?.chatIds),
    storedBotTokenConfigured: Boolean(settings?.botToken),
    settings,
  };
}

async function loadTelegramBotToken(env, settings) {
  const envToken = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (envToken) return { token: envToken, source: "worker_secret" };
  const stored = String(settings?.botToken || "").trim();
  if (!stored) return { token: "", source: "missing" };
  const token = await decryptStoredSecret(env, stored);
  return {
    token,
    source: token ? "admin_setting" : "admin_setting_unreadable",
  };
}

async function telegramWorkerStatus(env) {
  const recipients = await loadTelegramRecipients(env, { includeDisabled: true });
  const botToken = await loadTelegramBotToken(env, recipients.settings);
  return {
    dailyReportEnabled: telegramDailyReportEnabled(env),
    dailyReportCron: TELEGRAM_DAILY_REPORT_CRON,
    botTokenConfigured: Boolean(botToken.token),
    botTokenSource: botToken.source,
    cookieSecretConfigured: Boolean(String(env.COOKIE_SECRET || "").trim()),
    chatIdCount: recipients.chatIds.length,
    settingsEnabled: recipients.settingsEnabled,
    storedChatIdsConfigured: recipients.storedChatIdsConfigured,
    storedBotTokenConfigured: recipients.storedBotTokenConfigured,
  };
}

async function sendTelegramText(env, text) {
  const recipients = await loadTelegramRecipients(env);
  const { token } = await loadTelegramBotToken(env, recipients.settings);
  if (!telegramDailyReportEnabled(env)) {
    return { success: false, skipped: true, reason: "DAILY_REPORT_DISABLED" };
  }
  if (!recipients.settingsEnabled) {
    return { success: false, skipped: true, reason: "TELEGRAM_DISABLED_IN_SETTINGS" };
  }
  if (!token) {
    return { success: false, skipped: true, reason: "TELEGRAM_BOT_TOKEN_MISSING" };
  }
  if (recipients.chatIds.length === 0) {
    return { success: false, skipped: true, reason: "TELEGRAM_CHAT_IDS_MISSING" };
  }

  let sent = 0;
  const failures = [];
  for (const chatId of recipients.chatIds) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok !== false) {
      sent += 1;
    } else {
      failures.push({ chatId, status: response.status, error: payload.description || "send failed" });
    }
  }
  return { success: sent > 0, sent, failed: failures.length, failures };
}

function supabaseRecoveryPhaseLabel(phase) {
  const labels = {
    missing_env: "환경변수 누락",
    project_unreachable_or_paused: "프로젝트 중지 또는 접근 불가",
    service_key_invalid: "service_role 키 오류",
    quota_restricted: "Supabase quota 제한 중",
    rest_not_ready: "REST export 대기",
    db_export_ready_storage_not_ready: "DB export 가능, Storage 대기",
    ready_for_safe_migration: "마이그레이션 착수 가능",
    unknown: "확인 필요",
  };
  return labels[phase] || phase || "확인 필요";
}

function formatSupabaseRecoveryFromSite(data) {
  const report = data?.report || {};
  const classification = report.classification || {};
  const actions = Array.isArray(classification.nextActions) ? classification.nextActions.slice(0, 2) : [];
  return [
    "<b>Supabase 복구 감시</b>",
    `상태: ${escapeTelegramHtml(supabaseRecoveryPhaseLabel(classification.phase))}`,
    `DB export: ${classification.readyForDbExport ? "가능" : "대기"} / 이미지 복사: ${classification.readyForStorageCopy ? "가능" : "대기"}`,
    `Quota 제한: ${classification.restricted ? "감지됨" : "없음"}`,
    actions.length > 0 ? "" : "",
    ...actions.map((action) => `- ${escapeTelegramHtml(action)}`),
  ].filter(Boolean).join("\n");
}

async function fetchSupabaseRecoveryReportSection(env) {
  if (!supabaseRecoveryReportEnabled(env)) return "";
  const siteBaseUrl = String(env.SITE_BASE_URL || "").replace(/\/+$/, "");
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (!siteBaseUrl || !secret) {
    return [
      "<b>Supabase 복구 감시</b>",
      "상태: 확인 대기 - SITE_BASE_URL 또는 AUTO_PRESS_WORKER_SECRET이 없습니다.",
    ].join("\n");
  }

  try {
    const response = await fetch(`${siteBaseUrl}/api/cron/supabase-recovery-check?requireStorage=1`, {
      headers: {
        authorization: `Bearer ${secret}`,
        "user-agent": "CulturePeopleAutoPressWorker/1.0",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      return [
        "<b>Supabase 복구 감시</b>",
        `상태: 확인 실패 - 사이트 응답 HTTP ${response.status}`,
      ].join("\n");
    }
    return formatSupabaseRecoveryFromSite(data);
  } catch (error) {
    return [
      "<b>Supabase 복구 감시</b>",
      `상태: 확인 실패 - ${escapeTelegramHtml(error instanceof Error ? error.message : String(error))}`,
    ].join("\n");
  }
}

async function buildWorkerDailyTelegramReport(env, now = new Date()) {
  const dateKey = yesterdayKstDateKey(now);
  const monthKey = kstMonthKey(now);
  const [startUtc, endUtc] = kstDayBoundsUtc(dateKey);
  const sourceStatsStart = daysAgoKstDateKey(30, now);
  const [sourceStatsStartUtc] = kstDayBoundsUtc(sourceStatsStart);

  const [
    traffic,
    runs,
    items,
    usage,
    pending,
    monthlyTop,
    sourceStats,
  ] = await Promise.all([
    d1First(env, `
      SELECT
        COUNT(*) AS total_logs,
        COUNT(DISTINCT CASE WHEN is_admin = 0 AND is_bot = 0 THEN visitor_key END) AS human_visitors,
        SUM(CASE WHEN is_admin = 0 AND is_bot = 0 THEN 1 ELSE 0 END) AS human_views,
        SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) AS admin_views,
        SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_views,
        SUM(CASE
          WHEN is_bot = 1 AND (
            lower(COALESCE(bot_name, '')) LIKE '%gpt%'
            OR lower(COALESCE(bot_name, '')) LIKE '%chatgpt%'
            OR lower(COALESCE(bot_name, '')) LIKE '%claude%'
            OR lower(COALESCE(bot_name, '')) LIKE '%perplexity%'
            OR lower(COALESCE(bot_name, '')) LIKE '%google-extended%'
            OR lower(COALESCE(bot_name, '')) LIKE '%cohere%'
            OR lower(COALESCE(bot_name, '')) LIKE '%bytespider%'
            OR lower(COALESCE(bot_name, '')) LIKE '%ccbot%'
          ) THEN 1 ELSE 0 END) AS ai_bot_views
      FROM view_logs
      WHERE timestamp >= ? AND timestamp < ?`,
    [startUtc, endUtc]),
    d1First(env, `
      SELECT
        COUNT(*) AS run_count,
        SUM(published_count) AS published_count,
        SUM(skipped_count) AS skipped_count,
        SUM(failed_count) AS failed_count,
        SUM(queued_count) AS queued_count
      FROM auto_press_runs
      WHERE COALESCE(completed_at, started_at, created_at) >= ?
        AND COALESCE(completed_at, started_at, created_at) < ?`,
    [startUtc, endUtc]),
    d1First(env, `
      SELECT
        COUNT(*) AS item_count,
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_count,
        SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) AS fail_count,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_count,
        SUM(CASE WHEN status = 'dup' OR reason_code = 'DUPLICATE_SOURCE' THEN 1 ELSE 0 END) AS duplicate_count,
        SUM(CASE WHEN status = 'no_image' OR reason_code = 'NO_IMAGE' THEN 1 ELSE 0 END) AS no_image_count,
        SUM(CASE WHEN reason_code LIKE '%AI%' THEN 1 ELSE 0 END) AS ai_issue_count
      FROM auto_press_items
      WHERE COALESCE(completed_at, started_at, created_at) >= ?
        AND COALESCE(completed_at, started_at, created_at) < ?`,
    [startUtc, endUtc]),
    d1First(env, "SELECT * FROM auto_press_daily_usage WHERE date = ? LIMIT 1", [dateKey]),
    d1First(env, `
      SELECT
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_count,
        SUM(CASE WHEN status IN ('fail') THEN 1 ELSE 0 END) AS failed_count
      FROM auto_press_items
      WHERE status IN ('queued', 'running', 'fail')`,
    []),
    d1All(env, `
      SELECT no, title, views
      FROM articles
      WHERE deleted_at IS NULL
        AND status = '게시'
        AND date LIKE ?
      ORDER BY views DESC, created_at DESC
      LIMIT 5`,
    [`${monthKey}%`]),
    d1All(env, `
      SELECT
        COALESCE(NULLIF(source_name, ''), NULLIF(source_id, ''), '출처 미확인') AS source_name,
        COUNT(*) AS processed_count,
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS published_count,
        SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) AS failed_count
      FROM auto_press_items
      WHERE created_at >= ?
        AND status NOT IN ('queued', 'running')
      GROUP BY COALESCE(NULLIF(source_id, ''), NULLIF(source_name, ''), NULLIF(bo_table, ''), NULLIF(source_url, ''), 'unknown')
      ORDER BY SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) DESC, COUNT(*) DESC
      LIMIT 3`,
    [sourceStatsStartUtc]),
  ]);

  const topLines = monthlyTop.length > 0
    ? monthlyTop.map((article, index) => `${index + 1}. ${escapeTelegramHtml(article.title)} - 조회 ${formatNumber(article.views)}회`)
    : ["아직 이번 달 기사 조회 데이터가 없습니다."];
  const sourceLines = sourceStats.length > 0
    ? sourceStats.map((source) => `${escapeTelegramHtml(source.source_name || "소스")}: 등록 ${formatNumber(source.published_count)}/${formatNumber(source.processed_count)}, 실패 ${formatNumber(source.failed_count)}`)
    : [];

  const lines = [
    "<b>[일일 리포트] 컬처피플 운영 요약</b>",
    `기준일: ${escapeTelegramHtml(dateKey)} KST`,
    "",
    "<b>방문</b>",
    `순수 방문자: ${formatNumber(traffic.human_visitors || traffic.human_views)}`,
    `사람 기사 조회 로그: ${formatNumber(traffic.human_views)}`,
    `AI 봇 방문: ${formatNumber(traffic.ai_bot_views)}`,
    `전체 봇 방문: ${formatNumber(traffic.bot_views)}`,
    `관리자 조회: ${formatNumber(traffic.admin_views)}`,
    "",
    "<b>보도자료 자동등록</b>",
    `실행 수: ${formatNumber(runs.run_count)}`,
    `등록 완료: ${formatNumber(runs.published_count || items.ok_count)}`,
    `건너뜀: ${formatNumber(runs.skipped_count)}`,
    `실패: ${formatNumber(runs.failed_count || items.fail_count)}`,
    `중복 제외: ${formatNumber(items.duplicate_count)}`,
    `이미지 없음 제외: ${formatNumber(items.no_image_count)}`,
    `AI 이슈/대기: ${formatNumber(items.ai_issue_count)}`,
    `현재 Worker 대기/실행: ${formatNumber(pending.queued_count)} / ${formatNumber(pending.running_count)}`,
    "",
    "<b>일일 사용량</b>",
    `Worker 처리: ${formatNumber(usage.jobs_processed)}`,
    `AI 호출: ${formatNumber(usage.ai_calls)}`,
    `이미지 업로드: ${formatNumber(usage.image_uploads)}`,
    `기사 저장: ${formatNumber(usage.publishes)}`,
  ];

  if (sourceLines.length > 0) {
    lines.push("", "<b>최근 30일 소스 품질</b>", ...sourceLines);
  }
  lines.push("", `<b>이번 달 인기 기사 (${monthlyTop.length || 0}건)</b>`, ...topLines);
  const supabaseRecovery = await fetchSupabaseRecoveryReportSection(env);
  if (supabaseRecovery) {
    lines.push("", supabaseRecovery);
  }
  return lines.join("\n");
}

async function sendDailyTelegramReport(env, options = {}) {
  const dateKey = options.dateKey || yesterdayKstDateKey();
  const settingKey = `${WORKER_DAILY_REPORT_SETTING_PREFIX}${dateKey}`;
  if (!options.force) {
    const sent = await readSiteSetting(env, settingKey, null);
    if (sent?.sentAt) return { success: true, skipped: true, reason: "ALREADY_SENT", dateKey };
  }

  const text = await buildWorkerDailyTelegramReport(env);
  const result = await sendTelegramText(env, text);
  if (result.success) {
    await writeSiteSetting(env, settingKey, {
      sentAt: nowIso(),
      dateKey,
      sent: result.sent,
      failed: result.failed,
    });
  }
  return { ...result, dateKey };
}

async function assertDailyLimits(env) {
  const usage = await dailyUsage(env);
  const aiLimit = asInt(env.AUTO_PRESS_DAILY_AI_LIMIT, 50, 1, 10000);
  const publishLimit = asInt(env.AUTO_PRESS_DAILY_PUBLISH_LIMIT, 30, 1, 10000);
  const imageLimit = asInt(env.AUTO_PRESS_DAILY_IMAGE_LIMIT, 50, 1, 10000);
  if (Number(usage.ai_calls || 0) >= aiLimit) return "일일 AI 호출 상한에 도달했습니다.";
  if (Number(usage.publishes || 0) >= publishLimit) return "일일 기사 등록 상한에 도달했습니다.";
  if (Number(usage.image_uploads || 0) >= imageLimit) return "일일 이미지 업로드 상한에 도달했습니다.";
  return "";
}

async function fetchSource(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("원문 URL이 올바르지 않습니다.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "CulturePeopleAutoPressWorker/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`원문 응답 HTTP ${response.status}`);
    const html = await response.text();
    const title = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1])
      || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
      || "";
    const bodyText = extractSourceBodyText(html, response.url || url);
    const images = extractImages(html, url);
    const author = extractMetaContent(html, "name", "author");
    const keywords = [
      ...extractMetaList(html, "name", "news_keywords"),
      ...extractMetaList(html, "name", "keywords"),
    ];
    return { html, title: stripHtml(title), bodyText, images, sourceUrl: response.url || url, author, keywords };
  } finally {
    clearTimeout(timeout);
  }
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function shouldPreferSiteProxy(env, url) {
  if (String(env.AUTO_PRESS_PREFER_SITE_PROXY || "false").toLowerCase() !== "true") return false;
  return TRUSTED_PROXY_HOST_RE.test(getHostname(url));
}

function isUsableSource(source) {
  const bodyText = String(source?.bodyText || "").trim();
  const title = String(source?.title || "").trim();
  return bodyText.length >= MIN_SOURCE_BODY_CHARS && title.length >= 4;
}

function normalizeSource(source) {
  return {
    html: String(source?.html || ""),
    title: stripHtml(source?.title || ""),
    bodyText: String(source?.bodyText || "").trim(),
    images: Array.isArray(source?.images) ? source.images.filter(Boolean) : [],
    sourceUrl: String(source?.sourceUrl || source?.url || ""),
    author: String(source?.author || ""),
    keywords: Array.isArray(source?.keywords) ? source.keywords.map(String).filter(Boolean) : [],
  };
}

function isNewswireSourceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /(^|\.)newswire\.co\.kr$/i.test(url.hostname) && /\/newsRead\.php$/i.test(url.pathname);
  } catch {
    return /newswire\.co\.kr\/newsRead\.php/i.test(String(value || ""));
  }
}

function isKoreaKrSourceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /(^|\.)korea\.kr$/i.test(url.hostname);
  } catch {
    return /korea\.kr\//i.test(String(value || ""));
  }
}

const DOMESTIC_CONTEXT_RE = /한국|대한민국|국내|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|코엑스|킨텍스|벡스코|KIMEX|문화재단|문화원|시립|구립|군립|도립|한국문화|K-콘텐츠|K콘텐츠/i;
const GLOBAL_WIRE_RE = /\bCGTN\b|\bPR Newswire\b|\bBusiness Wire\b|\bGlobeNewswire\b|신화통신|글로벌타임스/i;
const OVERSEAS_KEYWORD_RE = /\boverseas\b|해외\s*보도자료|외신|국제\s*보도자료/i;
const GLOBAL_POLITICS_RE = /미중\s*정상회담|정상회담|백악관|워싱턴|베이징|시진핑|트럼프|바이든|외교|관세|중국.*미국|미국.*중국/i;
const KOREAN_TEXT_RE = /[가-힣]/;
const BROAD_NEWSWIRE_SOURCE_RE = /\bnwrss_(all|cult|music|film|exhibit|art_perf|art_vis|publish|heritage)\b/i;
const CURATED_COMPANY_SOURCE_RE = /\bnwrss_company_|companyNews\?/i;
const KOREAN_PROVIDER_RE = /[가-힣]{2,}(재단|문화재단|문화원|출판사|대학교|협회|연구소|미술관|박물관|도서관|극장|엔터테인먼트|스튜디오|컴퍼니|코리아|코퍼레이션|산업|헬스케어|테크|미디어|출판)/i;
const STRONG_KOREAN_PROVIDER_RE = /[가-힣A-Za-z0-9&()·\s]{2,40}(재단|문화재단|문화원|출판사|대학교|협회|연구소|미술관|박물관|도서관|극장|엔터테인먼트|스튜디오|컴퍼니|코리아|코퍼레이션|헬스케어|출판)(?=[\s,·은는이가와과의]|$)/i;
const GLOBAL_COMMERCIAL_RE = /\bOmdia\b|\bNetflix\b|\bVispring\b|\bTom Dixon\b|\bHoshino\b|\bTomamu\b|글로벌\s*(온라인|광고|시장|월드|투어)|월드투어|월드\s*투어|전\s*세계|온라인\s*광고\s*시장|6400억\s*달러|소셜미디어\s*광고|홋카이도|일본\s*프리미엄|밀라노\s*디자인\s*위크|영국\s*대표\s*디자이너/i;
const KOREA_POLICY_TOPIC_RE = /문화예술|공연|전시|미술|음악|국악|영화|영상|콘텐츠|저작권|한글|세종대왕|박물관|미술관|도서관|출판|문학|서점|책방|관광|여행|촌캉스|축제|체육|스포츠|축구|야구|올림픽|패럴림픽|장애학생체육|K-?팝|케이팝|뮤비|게임|웹툰|문화재|문화유산|한식|K-?푸드|케이푸드|떡지순례|빵지순례|인문|크루즈|컨벤션|K-?컨벤션|케이-?컨벤션|MICE|마이스|암표|예매|예술교육|문화산업|지역문화|생활문화|문화가\s*있는\s*날|코리아넷|명예기자단|동학농민혁명|한류/i;
const KOREA_POLICY_GENERIC_CULTURE_RE = /문화.{0,12}(행사|정책|프로그램|시설|공간|향유|도시|재단|기관|콘텐츠|관광)|예술.{0,12}(행사|정책|프로그램|교육|산업)|지역.{0,8}(문화|관광)/i;

function isKoreaPolicyRelevant(item, source) {
  const topicalText = [
    item?.title,
    source?.title,
    Array.isArray(source?.keywords) ? source.keywords.join(" ") : "",
    String(source?.bodyText || "").slice(0, 1400),
  ].filter(Boolean).join(" ").replace(/문화체육관광부|문체부/g, " ");
  return KOREA_POLICY_TOPIC_RE.test(topicalText) || KOREA_POLICY_GENERIC_CULTURE_RE.test(topicalText);
}

function isMostlyEnglish(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  if (compact.length < 12) return false;
  const asciiLetters = (compact.match(/[A-Za-z]/g) || []).length;
  const koreanLetters = (compact.match(/[가-힣]/g) || []).length;
  return asciiLetters >= 12 && koreanLetters === 0 && asciiLetters / compact.length >= 0.45;
}

function classifySourceEligibility(item, source) {
  const raw = parseJson(item.raw_json, {});
  const rawSource = raw.source || {};
  const sourceUrl = item.canonical_url || item.source_url || source.sourceUrl || "";
  if (isKoreaKrSourceUrl(sourceUrl)) {
    if (isKoreaPolicyRelevant(item, source)) {
      return { allowed: true, tier: "allowed_korea_policy", reason: "문화·관광·체육·콘텐츠 관련 정부 보도자료입니다." };
    }
    return { allowed: false, tier: "blocked_korea_policy_unrelated", reason: "문화·관광·체육·콘텐츠 관련성이 약한 정부 정책뉴스라 제외했습니다." };
  }
  if (!isNewswireSourceUrl(sourceUrl)) {
    return { allowed: true, tier: "not_newswire", reason: "뉴스와이어가 아닌 보도자료입니다." };
  }

  const titleText = [item.title, source.title].filter(Boolean).join(" ");
  const authorText = String(source.author || "");
  const keywordText = (source.keywords || []).join(" ");
  const sourceText = [item.source_id, item.source_name, rawSource.id, rawSource.name].filter(Boolean).join(" ");
  const feedText = String(rawSource.rssUrl || "");
  const leadText = String(source.bodyText || "").slice(0, 1400);
  const scopeText = [titleText, authorText, keywordText, sourceText, feedText, leadText].join(" ");
  const hasDomesticContext = DOMESTIC_CONTEXT_RE.test(scopeText);
  const newswireProviderText = extractNewswireProviderName(source.bodyText);
  const providerText = [authorText, newswireProviderText].filter(Boolean).join(" ");
  const hasKoreanProvider = KOREAN_PROVIDER_RE.test(providerText)
    || STRONG_KOREAN_PROVIDER_RE.test([titleText, leadText.slice(0, 800)].join(" "));
  const isCuratedCompanySource = CURATED_COMPANY_SOURCE_RE.test(`${sourceText} ${feedText}`);
  const isBroadNewswireSource = BROAD_NEWSWIRE_SOURCE_RE.test(sourceText);
  const hasGlobalCommercialSignal = GLOBAL_COMMERCIAL_RE.test(scopeText);

  if (OVERSEAS_KEYWORD_RE.test(scopeText) && !hasDomesticContext && !hasKoreanProvider && !isCuratedCompanySource) {
    return { allowed: false, tier: "blocked_overseas", reason: "뉴스와이어 해외 보도자료라 AI 편집 전에 제외했습니다." };
  }

  const globalPublisherText = [titleText, authorText].join(" ");
  if (GLOBAL_WIRE_RE.test(globalPublisherText) && GLOBAL_POLITICS_RE.test(scopeText) && !hasDomesticContext) {
    return { allowed: false, tier: "blocked_global_politics", reason: "해외 통신사/정치성 보도자료라 AI 편집 전에 제외했습니다." };
  }

  if (GLOBAL_POLITICS_RE.test([titleText, keywordText, leadText].join(" ")) && !hasDomesticContext) {
    return { allowed: false, tier: "blocked_global_politics", reason: "국내 문화/기업 맥락이 약한 해외 정치성 보도자료라 제외했습니다." };
  }

  if (hasGlobalCommercialSignal && !hasKoreanProvider && !isCuratedCompanySource) {
    return { allowed: false, tier: "blocked_global_commercial", reason: "국내 발행 주체가 확인되지 않은 글로벌 상업성 보도자료라 제외했습니다." };
  }

  if (isMostlyEnglish(titleText) && !hasDomesticContext && !hasKoreanProvider && !isCuratedCompanySource) {
    return { allowed: false, tier: "blocked_global_commercial", reason: "영문 중심 해외 보도자료라 AI 편집 전에 제외했습니다." };
  }

  if (isBroadNewswireSource && !hasDomesticContext && !hasKoreanProvider && !isCuratedCompanySource && !KOREAN_TEXT_RE.test(authorText)) {
    return { allowed: false, tier: "blocked_weak_domestic_signal", reason: "국내 발행 주체 신호가 약한 뉴스와이어 후보라 제외했습니다." };
  }

  return { allowed: true, tier: "allowed", reason: "발행 대상 보도자료입니다." };
}

async function fetchSourceViaSiteProxy(env, url, cause) {
  const siteBaseUrl = String(env.SITE_BASE_URL || "").replace(/\/+$/, "");
  if (!siteBaseUrl) throw cause;
  const proxyUrl = `${siteBaseUrl}/api/netpro/origin?url=${encodeURIComponent(url)}`;
  const headers = { "user-agent": "CulturePeopleAutoPressWorker/1.0" };
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (secret) headers.authorization = `Bearer ${secret}`;
  const response = await fetch(proxyUrl, {
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const reason = data.error || `프록시 응답 HTTP ${response.status}`;
    throw new Error(`${cause instanceof Error ? cause.message : String(cause)} / Vercel 원문 프록시 실패: 프록시 응답 HTTP ${response.status}: ${reason}`);
  }
  const bodyHtml = String(data.bodyHtml || "");
  const bodyText = String(data.bodyText || stripHtml(bodyHtml));
  const images = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
  if (data.thumbnail && !images.includes(data.thumbnail)) images.unshift(data.thumbnail);
  return {
    html: bodyHtml,
    title: stripHtml(data.title || ""),
    bodyText,
    images,
    sourceUrl: data.url || url,
    author: String(data.author || ""),
    keywords: Array.isArray(data.keywords) ? data.keywords.filter(Boolean) : [],
  };
}

async function fetchSourceWithFallback(env, url) {
  if (shouldPreferSiteProxy(env, url)) {
    try {
      const proxied = normalizeSource(await fetchSourceViaSiteProxy(env, url, new Error("사이트 프록시 우선 수집")));
      if (isUsableSource(proxied)) return proxied;
    } catch (proxyError) {
      const proxyMessage = "";
      if (/프록시 응답 HTTP (401|403|429)/.test(proxyMessage)) throw proxyError;
      try {
        const direct = normalizeSource(await fetchSource(url));
        if (isUsableSource(direct)) return direct;
      } catch {
        throw proxyError;
      }
      throw proxyError;
    }
  }

  try {
    const direct = normalizeSource(await fetchSource(url));
    if (isUsableSource(direct)) return direct;
    try {
      const proxied = normalizeSource(await fetchSourceViaSiteProxy(env, url, new Error("직접 수집 본문 품질 부족")));
      if (isUsableSource(proxied)) return proxied;
    } catch {
      return direct;
    }
    return direct;
  } catch (error) {
    return normalizeSource(await fetchSourceViaSiteProxy(env, url, error));
  }
}

function absolutizeUrl(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return "";
  }
}

function extractImages(html, baseUrl) {
  const images = new Set();
  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const sourceRe = /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi;
  for (const re of [metaRe, imgRe, sourceRe]) {
    let match;
    while ((match = re.exec(html))) {
      const first = String(match[1] || "").split(",")[0].trim().split(/\s+/)[0];
      const absolute = absolutizeUrl(first, baseUrl);
      if (absolute && /^https?:\/\//i.test(absolute) && !/pixel|spacer|blank|logo|icon/i.test(absolute)) {
        images.add(absolute);
      }
    }
  }
  return [...images].filter((url) => IMAGE_EXT_RE.test(url) || /image|photo|thumb|attach|file/i.test(url)).slice(0, 8);
}

function isEarlierQueueSibling(row, item) {
  const rowCreatedAt = String(row.created_at || "");
  const itemCreatedAt = String(item.created_at || "");
  if (rowCreatedAt && itemCreatedAt && rowCreatedAt !== itemCreatedAt) {
    return rowCreatedAt < itemCreatedAt;
  }
  return String(row.id || "") < String(item.id || "");
}

async function duplicateArticleExists(env, canonicalUrl, normalizedTitle) {
  if (!canonicalUrl && !normalizedTitle) return false;
  const rows = await env.DB.prepare(
    `SELECT id, no, title, source_url
     FROM articles
     WHERE deleted_at IS NULL
       AND (source_url IS NOT NULL OR title IS NOT NULL)
     ORDER BY created_at DESC
     LIMIT 50000`,
  ).all();
  for (const row of rows.results || []) {
    if (canonicalUrl && normalizeSourceUrl(row.source_url) === canonicalUrl) return true;
    if (normalizedTitle && normalizedTitle.length >= 8 && normalizeTitle(row.title) === normalizedTitle) return true;
  }
  return false;
}

async function duplicateQueueSiblingExists(env, item, canonicalUrl, normalizedTitle) {
  if (!item || (!canonicalUrl && !normalizedTitle)) return false;
  const rows = await env.DB.prepare(
    `SELECT id, status, title, source_url, canonical_url, normalized_title, created_at
     FROM auto_press_items
     WHERE id <> ?
       AND status IN ('queued', 'running', 'ok')
       AND (
         source_url IS NOT NULL
         OR canonical_url IS NOT NULL
         OR title IS NOT NULL
         OR normalized_title IS NOT NULL
       )
     ORDER BY created_at ASC
     LIMIT 50000`,
  ).bind(item.id).all();
  for (const row of rows.results || []) {
    const sameUrl = canonicalUrl && normalizeSourceUrl(row.canonical_url || row.source_url) === canonicalUrl;
    const sameTitle = normalizedTitle
      && normalizedTitle.length >= 8
      && String(row.normalized_title || normalizeTitle(row.title)) === normalizedTitle;
    if (!sameUrl && !sameTitle) continue;
    if (String(row.status || "") === "ok") return true;
    if (isEarlierQueueSibling(row, item)) return true;
  }
  return false;
}

async function duplicateExists(env, sourceUrl, normalizedTitle, item = null) {
  const canonicalUrl = normalizeSourceUrl(sourceUrl);
  if (await duplicateArticleExists(env, canonicalUrl, normalizedTitle)) return true;
  if (await duplicateQueueSiblingExists(env, item, canonicalUrl, normalizedTitle)) return true;
  return false;
}

function isDuplicateConstraintError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /unique constraint|constraint failed|SQLITE_CONSTRAINT/i.test(message)
    && /source_url|idx_articles_active_source_url_unique|articles/i.test(message);
}

function isArticleNoConstraintError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /unique constraint|constraint failed|SQLITE_CONSTRAINT/i.test(message)
    && /articles\.no|\bno\b/i.test(message);
}

function buildGeminiPrompt(source) {
  return [
    "너는 CulturePeople 보도자료 편집자다.",
    "원문을 그대로 베끼지 말고 문화/정책/지역 관점의 기사형 문장으로 재작성해라.",
    "출력은 JSON만 허용한다: title, summary, bodyHtml, category, tags.",
    `category는 다음 중 하나만 허용한다: ${CULTUREPEOPLE_CATEGORIES.join(", ")}.`,
    "bodyHtml은 <p> 문단 중심으로 작성하고 원문 문단을 그대로 복사하지 마라.",
    "",
    `제목: ${source.title}`,
    `본문: ${source.bodyText.slice(0, 3000)}`,
  ].join("\n");
}

function buildCulturePeoplePrompt(source) {
  return [
    "너는 CulturePeople 보도자료 편집자다.",
    "원문을 그대로 베끼지 말고 문화, 정책, 지역 관점의 기사 문장으로 재작성해라.",
    "출력은 JSON만 허용한다: title, summary, bodyHtml, category, tags.",
    `category는 다음 중 하나만 허용한다: ${CULTUREPEOPLE_CATEGORIES.join(", ")}.`,
    "bodyHtml은 <p> 문단 4~6개로 작성하고, 본문 순수 텍스트가 최소 700자 이상이 되게 해라.",
    "원문 문단을 그대로 복사하지 말고 문장 구조와 표현을 바꾸되, 사실관계와 고유명사는 유지해라.",
    "이미지 태그는 넣지 마라. 시스템이 별도로 대표 이미지를 삽입한다.",
    "",
    `제목: ${source.title}`,
    `본문: ${source.bodyText.slice(0, 4500)}`,
  ].join("\n");
}

function buildCompactCulturePeoplePrompt(source) {
  return [
    "CulturePeople 보도자료 편집자 역할로 작성한다.",
    "JSON만 출력한다: title, summary, bodyHtml, category, tags.",
    `category는 다음 중 하나만 허용한다: ${CULTUREPEOPLE_CATEGORIES.join(", ")}.`,
    "bodyHtml은 <p> 3~4개, 순수 텍스트 450~700자로 압축한다.",
    "원문 문장을 그대로 길게 복사하지 말고 핵심 사실을 기사 문장으로 재구성한다.",
    "이미지 태그는 넣지 않는다.",
    "",
    `제목: ${source.title}`,
    `본문: ${source.bodyText.slice(0, 2200)}`,
  ].join("\n");
}

function geminiGenerationConfig(model, overrides = {}) {
  const config = {
    temperature: overrides.temperature ?? 0.45,
    maxOutputTokens: overrides.maxOutputTokens ?? 4096,
    responseMimeType: "application/json",
    responseSchema: AI_RESPONSE_SCHEMA,
  };
  if (/^gemini-2\.5-/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

async function requestGeminiEdit(env, endpoint, source, model, prompt, overrides = {}) {
  await incrementUsage(env, "ai_calls");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: geminiGenerationConfig(model, overrides),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AI 편집 HTTP ${response.status}`);
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const edited = parseAiJson(text);
  const bodyChars = edited?.bodyHtml ? stripHtml(edited.bodyHtml).length : 0;
  const finishReason = data.candidates?.[0]?.finishReason || "unknown";
  return { edited, finishReason, textChars: text.length, bodyChars };
}

function isUsableGeminiEdit(result) {
  return Boolean(result.edited && result.edited.bodyHtml && result.bodyChars >= MIN_AI_BODY_CHARS);
}

function geminiEditError(result) {
  return `AI 편집 결과가 비어 있거나 너무 짧습니다. finish=${result.finishReason}, textChars=${result.textChars}, bodyChars=${result.bodyChars}`;
}

function resolvePublishStatus(options, env) {
  if (!autoPublishEnabled(env)) return "임시저장";
  return String(options.publishStatus || "게시").trim() === "임시저장" ? "임시저장" : "게시";
}

function normalizeWorkerCategory(value, context = "", fallback = "문화") {
  const raw = String(value || "").normalize("NFC").trim();
  if (CULTUREPEOPLE_CATEGORIES.includes(raw)) return raw;
  const alias = CATEGORY_ALIASES[raw] || CATEGORY_ALIASES[raw.toUpperCase()];
  if (alias) return alias;
  const haystack = `${raw} ${context}`.normalize("NFC").toLowerCase();
  let best = fallback;
  let bestScore = 0;
  for (const category of CULTUREPEOPLE_CATEGORIES) {
    const score = CATEGORY_KEYWORDS[category].reduce(
      (total, keyword) => total + (haystack.includes(keyword.toLowerCase()) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

function resolveCategory(edited, options, env, source = {}) {
  const configured = edited.category || options.category || env.AUTO_PRESS_DEFAULT_CATEGORY || "문화";
  return normalizeWorkerCategory(configured, `${source.title || ""} ${source.bodyText || ""}`, "문화");
}

function preserveWorkerSourceCategoryTag(tags, sourceCategory) {
  const values = (Array.isArray(tags) ? tags : String(tags || "").split(","))
    .map((tag) => String(tag || "").trim())
    .filter(Boolean);
  const raw = String(sourceCategory || "").normalize("NFC").trim();
  if (raw && !CULTUREPEOPLE_CATEGORIES.includes(raw)) {
    const sourceTag = `원분류:${raw}`;
    if (!values.includes(sourceTag)) values.push(sourceTag);
  }
  return values.join(",");
}

function isTerminalSourceFetchError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("프록시 응답 HTTP 422")
    || message.includes("정부 보도자료 본문을 추출할 수 없습니다")
    || message.includes("원문 본문을 추출할 수 없습니다");
}

async function geminiEdit(env, source, runOptions) {
  const apiKey = String(env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("Gemini API 키가 Worker secret에 없습니다.");
  const model = String(runOptions.aiModel || env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const first = await requestGeminiEdit(env, endpoint, source, model, buildCulturePeoplePrompt(source));
  if (isUsableGeminiEdit(first)) return first.edited;

  if (first.finishReason === "MAX_TOKENS") {
    const retry = await requestGeminiEdit(env, endpoint, source, model, buildCompactCulturePeoplePrompt(source), {
      temperature: 0.25,
      maxOutputTokens: 2048,
    });
    if (isUsableGeminiEdit(retry)) return retry.edited;
    throw new Error(`${geminiEditError(first)} / compactRetry=${geminiEditError(retry)}`);
  }

  throw new Error(geminiEditError(first));
}

function normalizeArticleTextForSimilarity(value) {
  return stripHtml(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .normalize("NFC");
}

function bigramSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const makeBigrams = (value) => {
    if (value.length < 2) return value ? [value] : [];
    const grams = [];
    for (let i = 0; i < value.length - 1; i += 1) grams.push(value.slice(i, i + 2));
    return grams;
  };
  const leftGrams = makeBigrams(left);
  const rightGrams = makeBigrams(right);
  const rightCounts = new Map();
  for (const gram of rightGrams) rightCounts.set(gram, (rightCounts.get(gram) || 0) + 1);
  let intersection = 0;
  for (const gram of leftGrams) {
    const count = rightCounts.get(gram) || 0;
    if (count > 0) {
      intersection += 1;
      rightCounts.set(gram, count - 1);
    }
  }
  return (2 * intersection) / Math.max(1, leftGrams.length + rightGrams.length);
}

function similarityTooHigh(sourceText, editedHtml) {
  const sourcePlain = stripHtml(sourceText);
  const editedPlain = stripHtml(editedHtml);
  const sourceWords = new Set(sourcePlain.split(/\s+/).filter((word) => word.length >= 3).slice(0, 800));
  const editedWords = editedPlain.split(/\s+/).filter((word) => word.length >= 3).slice(0, 800);
  const overlap = sourceWords.size >= 30 && editedWords.length >= 30
    ? editedWords.filter((word) => sourceWords.has(word)).length / Math.max(1, editedWords.length)
    : 0;
  if (overlap >= 0.72) return true;

  const source = normalizeArticleTextForSimilarity(sourcePlain);
  const edited = normalizeArticleTextForSimilarity(editedPlain);
  if (!source || !edited) return true;
  if (source === edited) return true;
  const shorter = Math.min(source.length, edited.length);
  const longer = Math.max(source.length, edited.length);
  if (shorter >= 80 && longer > 0) {
    const coverage = shorter / longer;
    if (coverage >= 0.9 && (source.includes(edited) || edited.includes(source))) return true;
  }
  return source.length >= 160 && edited.length >= 160 && bigramSimilarity(source, edited) >= 0.94;
}

function getDeclaredContentLength(response) {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function detectImageMime(buffer) {
  const arr = new Uint8Array(buffer);
  if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) return "image/jpeg";
  if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) return "image/png";
  if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) return "image/gif";
  if (
    arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46
    && arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}

function imageExtForMime(contentType) {
  return contentType.includes("png") ? "png"
    : contentType.includes("webp") ? "webp"
      : contentType.includes("gif") ? "gif"
        : "jpg";
}

function validateDownloadedImage(buffer, contentType, imageUrl) {
  if (!buffer || buffer.byteLength === 0) throw new Error("이미지 다운로드 결과가 비어 있습니다.");
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("이미지 크기가 10MB를 초과했습니다.");
  const detected = detectImageMime(buffer);
  const normalizedContentType = String(contentType || "").split(";")[0].trim().toLowerCase();
  const finalContentType = detected || normalizedContentType;
  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(finalContentType)) {
    throw new Error(`이미지 파일이 아닙니다: ${normalizedContentType || "unknown"}`);
  }
  return {
    buffer,
    contentType: finalContentType,
    ext: imageExtForMime(finalContentType),
    sourceUrl: imageUrl,
  };
}

function imageRequestHeaders(imageUrl) {
  const headers = {
    "user-agent": "CulturePeopleAutoPressWorker/1.0",
    accept: "image/webp,image/apng,image/*,*/*;q=0.8",
  };
  try {
    headers.referer = `${new URL(imageUrl).origin}/`;
  } catch {
    // Keep the request usable even if the source URL is malformed; fetch will fail below.
  }
  return headers;
}

async function downloadImageDirect(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(imageUrl, {
      headers: imageRequestHeaders(imageUrl),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`이미지 다운로드 HTTP ${response.status}`);
    const declaredSize = getDeclaredContentLength(response);
    if (declaredSize !== null && declaredSize > MAX_IMAGE_BYTES) {
      throw new Error("이미지 크기가 10MB를 초과했습니다.");
    }
    const buffer = await response.arrayBuffer();
    return validateDownloadedImage(buffer, response.headers.get("content-type") || "", imageUrl);
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadImageViaSiteProxy(env, imageUrl, cause) {
  if (String(env.AUTO_PRESS_IMAGE_PROXY_FALLBACK || "true").toLowerCase() === "false") throw cause;
  const siteBaseUrl = String(env.SITE_BASE_URL || "").replace(/\/+$/, "");
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (!siteBaseUrl || !secret) throw cause;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${siteBaseUrl}/api/netpro/image?url=${encodeURIComponent(imageUrl)}`, {
      headers: {
        authorization: `Bearer ${secret}`,
        "user-agent": "CulturePeopleAutoPressWorker/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const reason = await response.text().catch(() => "");
      throw new Error(`사이트 이미지 프록시 HTTP ${response.status}${reason ? `: ${truncate(reason, 180)}` : ""}`);
    }
    const declaredSize = getDeclaredContentLength(response);
    if (declaredSize !== null && declaredSize > MAX_IMAGE_BYTES) {
      throw new Error("사이트 이미지 프록시 결과가 10MB를 초과했습니다.");
    }
    const buffer = await response.arrayBuffer();
    return validateDownloadedImage(buffer, response.headers.get("content-type") || "", imageUrl);
  } catch (error) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const fallbackMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`${causeMessage} / ${fallbackMessage}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadImage(env, imageUrl) {
  try {
    return await downloadImageDirect(imageUrl);
  } catch (error) {
    return downloadImageViaSiteProxy(env, imageUrl, error);
  }
}

async function uploadDownloadedImage(env, imageUrl, itemId, downloaded) {
  if (!env.MEDIA_BUCKET) throw new Error("R2 MEDIA_BUCKET 바인딩이 없습니다.");
  const base = String(env.PUBLIC_MEDIA_BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("PUBLIC_MEDIA_BASE_URL이 설정되지 않았습니다.");
  const contentType = downloaded.contentType || "image/jpeg";
  const ext = downloaded.ext || imageExtForMime(contentType);
  const date = todayKst().replace(/-/g, "/");
  const key = `press/${date}/${itemId}.${ext}`;
  await env.MEDIA_BUCKET.put(key, downloaded.buffer, {
    httpMetadata: { contentType },
    customMetadata: { source_url: imageUrl, item_id: itemId, uploaded_at: nowIso() },
  });
  await incrementUsage(env, "image_uploads");
  return `${base}/${key}`;
}

async function serveMedia(request, env) {
  if (!env.MEDIA_BUCKET) return json({ success: false, error: "R2 바인딩이 없습니다." }, 500);
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/media\/?/, ""));
  if (!key || key.includes("..")) return json({ success: false, error: "잘못된 미디어 경로입니다." }, 400);
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return json({ success: false, error: "미디어를 찾을 수 없습니다." }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(object.body, { headers });
}

async function nextArticleNo(env) {
  const row = await env.DB.prepare("SELECT MAX(no) AS max_no FROM articles").first();
  return Number(row?.max_no || 0) + 1;
}

async function saveArticle(env, item, run, source, edited, imageUrl) {
  const options = parseJson(run.options_json, {});
  const title = truncate(stripHtml(edited.title || item.title || source.title), 120);
  const sourceCategory = edited.category || options.category || env.AUTO_PRESS_DEFAULT_CATEGORY || "문화";
  const tags = preserveWorkerSourceCategoryTag(edited.tags, sourceCategory);
  const body = String(edited.bodyHtml || "");
  const bodyWithImage = /<img\b/i.test(body)
    ? body
    : `<p><img src="${imageUrl}" alt="${title.replace(/"/g, "&quot;")}" /></p>\n${body}`;
  const now = nowIso();
  const authorProfile = await resolveAutoPressAuthor(env, options);
  let id = "";
  let no = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    no = await nextArticleNo(env);
    id = makeId("article");
    try {
      await env.DB.prepare(
        `INSERT INTO articles (
           id, no, title, category, date, status, views, body, thumbnail, tags,
           author, author_email, summary, meta_description, og_image, updated_at, source_url,
           review_note, audit_trail_json, created_at, ai_generated
          )
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(
        id,
        no,
        title,
        resolveCategory(edited, options, env, source),
        todayKst(),
        resolvePublishStatus(options, env),
        bodyWithImage,
        imageUrl,
        tags,
        authorProfile.name,
        authorProfile.email || null,
        truncate(stripHtml(edited.summary || ""), 300),
        truncate(stripHtml(edited.summary || ""), 160),
        imageUrl,
        now,
        normalizeSourceUrl(item.source_url) || item.source_url,
        "Cloudflare Worker 자동 보도자료 등록",
        JSON.stringify([{ action: "자동등록", at: now, worker: "auto-press-worker", itemId: item.id }]),
        now,
      ).run();
      break;
    } catch (error) {
      if (attempt < 4 && isArticleNoConstraintError(error)) continue;
      throw error;
    }
  }
  await env.DB.prepare(
    `INSERT INTO article_search_index (article_id, title, summary, tags, body_excerpt, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(article_id) DO UPDATE SET
       title = excluded.title,
       summary = excluded.summary,
       tags = excluded.tags,
       body_excerpt = excluded.body_excerpt,
       updated_at = excluded.updated_at`,
  ).bind(id, title, truncate(stripHtml(edited.summary || ""), 300), tags, truncate(stripHtml(bodyWithImage), 2000), now).run();
  await incrementUsage(env, "publishes");
  return { id, no, title };
}

async function processItem(env, itemId, policySnapshot) {
  if (!workerEnabled(env)) {
    return { status: "skipped", reason: "WORKER_DISABLED", disabled: true };
  }

  const item = await loadItem(env, itemId);
  if (!item) return { status: "skipped", reason: "ITEM_NOT_FOUND" };
  const run = await loadRun(env, item.run_id);
  if (!run) return { status: "skipped", reason: "RUN_NOT_FOUND" };
  const lease = await acquireLease(env, item);
  if (!lease) return { status: "skipped", reason: "LEASE_NOT_ACQUIRED" };

  await event(env, item.run_id, item.id, "info", "ITEM_LEASE_ACQUIRED", "Worker가 기사 후보 처리 권한을 획득했습니다.", { leaseUntil: lease });

  try {
    const limitMessage = await assertDailyLimits(env);
    if (limitMessage) {
      await finishItem(env, item, "queued", "DAILY_LIMIT_REACHED", limitMessage, {});
      await env.DB.prepare(
        `UPDATE auto_press_items
         SET next_retry_at = ?,
             lease_until = NULL,
             attempt_count = CASE WHEN attempt_count > 0 THEN attempt_count - 1 ELSE 0 END,
             retry_count = CASE WHEN retry_count > 0 THEN retry_count - 1 ELSE 0 END,
             updated_at = ?
         WHERE id = ?`,
      ).bind(nextKstDailyRetryIso(10), nowIso(), item.id).run();
      await event(env, item.run_id, item.id, "warn", "DAILY_LIMIT_REACHED", limitMessage);
      return { status: "skipped", reason: "DAILY_LIMIT_REACHED" };
    }

    const canonicalUrl = normalizeSourceUrl(item.canonical_url || item.source_url);
    const normalized = String(item.normalized_title || "").trim() || normalizeTitle(item.title);
    await env.DB.prepare(
      "UPDATE auto_press_items SET canonical_url = ?, normalized_title = ?, updated_at = ? WHERE id = ?",
    ).bind(canonicalUrl || null, normalized || null, nowIso(), item.id).run();
    item.canonical_url = canonicalUrl;
    item.normalized_title = normalized;
    const queuedSubject = matchWorkerBlockedSubject({
      title: item.title,
      sourceUrl: canonicalUrl || item.source_url,
      sourceName: item.source_name,
    }, policySnapshot);
    if (queuedSubject.blocked) {
      await finishItem(env, item, "skip", "BLOCKED_SUBJECT", `차단 주제(${queuedSubject.label}) 관련 보도자료라 등록하지 않았습니다.`);
      await event(env, item.run_id, item.id, "info", "SKIPPED_BLOCKED_SUBJECT", "운영 차단 주제 관련 보도자료를 등록하지 않았습니다.", { subjectId: queuedSubject.id });
      return { status: "skipped", reason: "BLOCKED_SUBJECT" };
    }
    if (await duplicateExists(env, canonicalUrl || item.source_url, normalized, item)) {
      await finishItem(env, item, "dup", "DUPLICATE_SOURCE", "이미 등록된 원문 또는 유사 제목 기사입니다.");
      await event(env, item.run_id, item.id, "info", "SKIPPED_DUPLICATE", "중복 기사로 등록하지 않았습니다.");
      return { status: "skipped", reason: "DUPLICATE_SOURCE" };
    }

    let source;
    try {
      source = await fetchSourceWithFallback(env, item.source_url);
    } catch (error) {
      await incrementUsage(env, "source_fetch_failures");
      if (isTerminalSourceFetchError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        await finishItem(
          env,
          item,
          "skip",
          "SOURCE_BODY_UNAVAILABLE",
          "원문 본문을 추출할 수 없어 등록 대상에서 제외했습니다.",
          { error: truncate(message, 500) },
        );
        await event(
          env,
          item.run_id,
          item.id,
          "warn",
          "SKIPPED_SOURCE_BODY_UNAVAILABLE",
          "원문 본문을 추출할 수 없어 등록 대상에서 제외했습니다.",
          { error: truncate(message, 500) },
        );
        return { status: "skipped", reason: "SOURCE_BODY_UNAVAILABLE" };
      }
      throw error;
    }
    source.title = source.title || item.title;
    if (!source.bodyText || source.bodyText.length < 80) {
      await finishItem(env, item, "fail", "BODY_TOO_SHORT", "원문 본문이 너무 짧아 기사화하지 않았습니다.");
      await event(env, item.run_id, item.id, "warn", "BODY_TOO_SHORT", "원문 본문이 너무 짧습니다.");
      return { status: "failed", reason: "BODY_TOO_SHORT" };
    }
    const sourceSubject = matchWorkerBlockedSubject({
      title: source.title || item.title,
      bodyText: source.bodyText,
      sourceUrl: source.sourceUrl || item.source_url,
      sourceName: item.source_name,
      keywords: source.keywords,
    }, policySnapshot);
    if (sourceSubject.blocked) {
      await finishItem(env, item, "skip", "BLOCKED_SUBJECT", `차단 주제(${sourceSubject.label}) 관련 보도자료라 등록하지 않았습니다.`);
      await event(env, item.run_id, item.id, "info", "SKIPPED_BLOCKED_SUBJECT", "운영 차단 주제 관련 보도자료를 AI 호출 전에 제외했습니다.", { subjectId: sourceSubject.id });
      return { status: "skipped", reason: "BLOCKED_SUBJECT" };
    }
    const eligibility = classifySourceEligibility(item, source);
    if (!eligibility.allowed) {
      await finishItem(env, item, "skip", "OUT_OF_SCOPE_SOURCE", eligibility.reason, {
        eligibilityTier: eligibility.tier,
      });
      await event(env, item.run_id, item.id, "info", "SKIPPED_OUT_OF_SCOPE_SOURCE", eligibility.reason, {
        eligibilityTier: eligibility.tier,
      });
      return { status: "skipped", reason: "OUT_OF_SCOPE_SOURCE" };
    }
    if (source.images.length === 0) {
      await finishItem(env, item, "no_image", "NO_IMAGE", "AI 호출 전 코드 검사에서 이미지가 없어 제외했습니다.", { imageCount: 0 });
      await event(env, item.run_id, item.id, "info", "SKIPPED_NO_IMAGE", "이미지가 없어 AI 호출 없이 제외했습니다.");
      return { status: "skipped", reason: "NO_IMAGE" };
    }

    const sourceImageUrl = source.images[0];
    const downloadedImage = await downloadImage(env, sourceImageUrl);
    const runOptions = parseJson(run.options_json, {});
    const edited = await geminiEdit(env, source, runOptions);
    const editedSubject = matchWorkerBlockedSubject({
      title: edited.title,
      summary: edited.summary,
      bodyHtml: edited.bodyHtml,
      tags: edited.tags,
      sourceUrl: source.sourceUrl || item.source_url,
    }, policySnapshot);
    if (editedSubject.blocked) {
      await finishItem(env, item, "skip", "BLOCKED_SUBJECT", `차단 주제(${editedSubject.label}) 관련 보도자료라 등록하지 않았습니다.`);
      await event(env, item.run_id, item.id, "info", "SKIPPED_BLOCKED_SUBJECT", "AI 편집 결과에서 운영 차단 주제를 확인해 저장하지 않았습니다.", { subjectId: editedSubject.id });
      return { status: "skipped", reason: "BLOCKED_SUBJECT" };
    }
    if (similarityTooHigh(source.bodyText, edited.bodyHtml)) {
      await finishItem(env, item, "skip", "COPYRIGHT_SIMILARITY_HIGH", "AI 편집 결과가 원문과 너무 유사해 등록하지 않았습니다.");
      await event(env, item.run_id, item.id, "warn", "COPYRIGHT_SIMILARITY_HIGH", "원문 유사도가 높아 자동 등록을 차단했습니다.");
      return { status: "skipped", reason: "COPYRIGHT_SIMILARITY_HIGH" };
    }

    if (workerDryRunEnabled(env)) {
      const dryRunTitle = truncate(stripHtml(edited.title || item.title || source.title), 120);
      await finishItem(env, item, "skip", "WORKER_DRY_RUN", "Worker 드라이런 모드라 기사와 이미지를 저장하지 않고 검증만 완료했습니다.", {
        dryRun: true,
        imageUrl: sourceImageUrl,
        imageCount: source.images.length,
        editedTitle: dryRunTitle,
      });
      await event(env, item.run_id, item.id, "info", "DRY_RUN_COMPLETED", "Worker 드라이런 검증이 완료되어 기사 등록을 건너뛰었습니다.", {
        imageUrl: sourceImageUrl,
        imageCount: source.images.length,
        editedTitle: dryRunTitle,
      });
      await incrementUsage(env, "jobs_processed");
      return { status: "skipped", reason: "WORKER_DRY_RUN", dryRun: true };
    }

    const imageUrl = await uploadDownloadedImage(env, sourceImageUrl, item.id, downloadedImage);
    let saved;
    try {
      saved = await saveArticle(env, item, run, source, edited, imageUrl);
    } catch (error) {
      if (isDuplicateConstraintError(error) && await duplicateExists(env, item.canonical_url || item.source_url, item.normalized_title || normalized, item)) {
        await finishItem(env, item, "dup", "DUPLICATE_SOURCE", "이미 등록된 원문 또는 유사 제목 기사입니다.", { imageUrl, imageCount: source.images.length });
        await event(env, item.run_id, item.id, "info", "SKIPPED_DUPLICATE", "중복 기사로 등록하지 않았습니다.");
        return { status: "skipped", reason: "DUPLICATE_SOURCE" };
      }
      throw error;
    }
    await finishItem(env, item, "ok", null, "등록 완료", {
      articleId: saved.id,
      articleNo: saved.no,
      imageUrl,
      imageCount: source.images.length,
    });
    await event(env, item.run_id, item.id, "info", "ARTICLE_PUBLISHED", "보도자료 자동등록이 완료되었습니다.", {
      articleId: saved.id,
      articleNo: saved.no,
      title: saved.title,
    });
    await incrementUsage(env, "jobs_processed");
    return { status: "success", articleId: saved.id, articleNo: saved.no };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = Number(item.attempt_count || 0) + 1;
    const maxAttempts = Number(item.max_attempts || 3);
    const willRetry = attempts < maxAttempts;
    const reasonCode = /이미지|image/i.test(message) ? "IMAGE_UPLOAD_FAILED" : "WORKER_PROCESS_FAILED";
    await env.DB.prepare(
      `UPDATE auto_press_items
       SET status = ?,
           reason_code = ?,
           reason_message = ?,
           retryable = ?,
           next_retry_at = ?,
           lease_until = NULL,
           completed_at = CASE WHEN ? = 0 THEN ? ELSE completed_at END,
           updated_at = ?
       WHERE id = ?`,
    ).bind(
      willRetry ? "queued" : "fail",
      reasonCode,
      truncate(message, 500),
      willRetry ? 1 : 0,
      willRetry ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
      willRetry ? 1 : 0,
      nowIso(),
      nowIso(),
      item.id,
    ).run();
    await refreshRunCounts(env, item.run_id);
    await event(env, item.run_id, item.id, "error", reasonCode === "IMAGE_UPLOAD_FAILED" ? "IMAGE_UPLOAD_FAILED" : "ITEM_FAILED", "Worker 처리 중 오류가 발생했습니다.", { error: message, willRetry });
    return { status: "failed", reason: reasonCode, error: message, retry: willRetry };
  }
}

async function notifySiteRunResult(env, runId, itemId) {
  const siteBaseUrl = String(env.SITE_BASE_URL || "").replace(/\/+$/, "");
  const secret = String(env.AUTO_PRESS_WORKER_SECRET || "").trim();
  if (!siteBaseUrl || !secret || String(env.AUTO_PRESS_RESULT_NOTIFY || "true").toLowerCase() === "false") {
    return { ok: false, skipped: true, reason: "NOT_CONFIGURED" };
  }

  const response = await fetch(`${siteBaseUrl}/api/auto-press/worker-notify`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "user-agent": "CulturePeopleAutoPressWorker/1.0",
    },
    body: JSON.stringify({
      runId,
      itemId,
      processedAt: nowIso(),
    }),
  });
  const data = await response.json().catch(() => ({}));
  return {
    ok: response.ok && data.success !== false,
    status: response.status,
    data,
  };
}

async function processItemAndNotify(env, itemId, policySnapshot) {
  const result = await processItem(env, itemId, policySnapshot);
  const item = await loadItem(env, itemId).catch(() => null);
  if (!item) return result;
  const status = String(item.status || "");
  const shouldNotifyDailyLimit = status === "queued" && item.reason_code === "DAILY_LIMIT_REACHED";
  if (!shouldNotifyDailyLimit && ["queued", "running"].includes(status)) return result;

  await notifySiteRunResult(env, item.run_id, item.id).catch((error) => {
    console.warn("[auto-press-worker] site result notify failed:", error instanceof Error ? error.message : error);
  });
  return result;
}

async function enqueueRunItems(request, env) {
  if (!authOk(request, env)) return json({ success: false, error: "인증이 필요합니다." }, 401);
  const body = await request.json().catch(() => ({}));
  const runId = String(body.runId || "").trim();
  const limit = asInt(body.limit, 100, 1, 300);
  if (!runId) return json({ success: false, error: "runId가 필요합니다." }, 400);
  if (!workerEnabled(env)) {
    await event(env, runId, null, "warn", "WORKER_DISABLED", "Worker가 비활성화되어 큐 메시지를 발행하지 않았습니다.").catch(() => undefined);
    return json({
      success: false,
      disabled: true,
      enqueued: 0,
      error: "Worker가 비활성화되어 큐 메시지를 발행하지 않았습니다.",
    }, 503);
  }

  const rows = await env.DB.prepare(
    `SELECT id, run_id, source_id
     FROM auto_press_items
     WHERE run_id = ?
       AND status = 'queued'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       AND (lease_until IS NULL OR lease_until <= ?)
     ORDER BY priority ASC, created_at ASC
     LIMIT ?`,
  ).bind(runId, nowIso(), nowIso(), limit).all();
  const items = rows.results || [];
  if (env.AUTO_PRESS_QUEUE) {
    for (const item of items) {
      await env.AUTO_PRESS_QUEUE.send({
        type: "auto_press_item",
        version: 1,
        runId: item.run_id,
        itemId: item.id,
        sourceId: item.source_id || "",
        priority: 100,
        createdAt: nowIso(),
        traceId: makeId("trace"),
      });
    }
  }
  await event(env, runId, null, "info", "QUEUE_MESSAGES_SENT", `Worker Queue 메시지 ${items.length}건을 발행했습니다.`, { count: items.length }).catch(() => undefined);
  return json({ success: true, enqueued: items.length, queueConfigured: Boolean(env.AUTO_PRESS_QUEUE) });
}

async function processDue(env, limit, policySnapshot) {
  if (!workerEnabled(env)) {
    return { success: true, processed: 0, disabled: true, reason: "WORKER_DISABLED" };
  }

  const loadedPolicy = policySnapshot ? null : await loadWorkerBlockedSubjectPolicy(env, {
    consumer: "worker-scheduled",
    invocationId: crypto.randomUUID(),
    useQueueCache: false,
  });
  const activePolicy = policySnapshot || loadedPolicy.snapshot;
  const leaseRecovery = await recoverExpiredLeasesWithObservationWindow(env, Math.min(limit, 5));
  const items = await listDueItems(env, limit);
  const results = [];
  for (const item of items) {
    results.push({ itemId: item.id, ...(await processItemAndNotify(env, item.id, activePolicy)) });
  }
  return { success: true, processed: results.length, leaseRecovery, results };
}

async function handleProcess(request, env) {
  if (!authOk(request, env)) return json({ success: false, error: "인증이 필요합니다." }, 401);
  const body = await request.json().catch(() => ({}));
  return json(await processDue(env, asInt(body.limit, 3, 1, 10)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/media/")) return serveMedia(request, env);
    if (request.method === "GET" && url.pathname === "/health") {
      const [telegramStatus, policyState] = await Promise.all([
        telegramWorkerStatus(env),
        readWorkerPolicyPublishedState(env),
      ]);
      return json({
        success: true,
        worker: "culturepeople-auto-press-worker",
        version: "2026-05-18-worker-telegram-daily-report",
        controls: workerRuntimeControls(env),
        policy: policyState,
        staleLeaseRecovery: {
          enabled: staleLeaseRecoveryEnabled(env),
          limit: asInt(env.AUTO_PRESS_STALE_LEASE_RECOVERY_LIMIT, 5, 1, 5),
          observationHours: asInt(env.AUTO_PRESS_STALE_LEASE_OBSERVATION_HOURS, 24, 1, 168),
        },
        bindings: {
          d1: Boolean(env.DB),
          queue: Boolean(env.AUTO_PRESS_QUEUE),
          r2: Boolean(env.MEDIA_BUCKET),
          mediaBaseUrl: Boolean(env.PUBLIC_MEDIA_BASE_URL),
          geminiKey: Boolean(env.GEMINI_API_KEY),
          telegramBotToken: telegramStatus.botTokenConfigured,
        },
        telegram: telegramStatus,
        ai: {
          model: String(env.GEMINI_MODEL || "gemini-2.5-flash"),
          responseSchema: true,
        },
        sourceFetch: {
          preferSiteProxy: String(env.AUTO_PRESS_PREFER_SITE_PROXY || "false").toLowerCase() === "true",
          trustedHosts: ["newswire.co.kr", "korea.kr"],
          minBodyChars: MIN_SOURCE_BODY_CHARS,
          newswireScopeGuard: true,
          newswireGlobalCommercialGuard: true,
          koreaPolicyScopeGuard: true,
        },
        imageFetch: {
          siteProxyFallback: String(env.AUTO_PRESS_IMAGE_PROXY_FALLBACK || "true").toLowerCase() !== "false",
          maxBytes: MAX_IMAGE_BYTES,
          beforeAiEdit: true,
        },
      });
    }
    if (request.method === "POST" && url.pathname === "/enqueue") return enqueueRunItems(request, env);
    if (request.method === "POST" && url.pathname === "/process") return handleProcess(request, env);
    if (request.method === "POST" && url.pathname === "/telegram/daily-report") {
      if (!authOk(request, env)) return json({ success: false, error: "인증이 필요합니다." }, 401);
      const body = await request.json().catch(() => ({}));
      return json(await sendDailyTelegramReport(env, { force: body.force === true }));
    }
    return json({ success: false, error: "지원하지 않는 경로입니다." }, 404);
  },

  async queue(batch, env) {
    if (!workerEnabled(env)) {
      for (const message of batch.messages) {
        const body = message.body || {};
        await event(env, body.runId || null, body.itemId || body.id || null, "warn", "WORKER_DISABLED", "Worker가 비활성화되어 큐 메시지를 처리하지 않았습니다.").catch(() => undefined);
        message.ack();
      }
      return;
    }

    const loadedPolicy = await loadWorkerBlockedSubjectPolicy(env, {
      consumer: "worker-queue",
      invocationId: crypto.randomUUID(),
      useQueueCache: true,
    });
    for (const message of batch.messages) {
      const body = message.body || {};
      const itemId = body.itemId || body.id;
      try {
        if (!itemId) throw new Error("Queue 메시지에 itemId가 없습니다.");
        const result = await processItemAndNotify(env, itemId, loadedPolicy.snapshot);
        if (result.retry) message.retry();
        else message.ack();
      } catch (error) {
        message.retry();
      }
    }
  },

  async scheduled(eventInfo, env, ctx) {
    if (eventInfo?.cron === TELEGRAM_DAILY_REPORT_CRON) {
      if (telegramDailyReportEnabled(env)) ctx.waitUntil(sendDailyTelegramReport(env));
      return;
    }
    if (!workerEnabled(env)) return;
    const limit = asInt(env.AUTO_PRESS_WORKER_BATCH_SIZE, 3, 1, 10);
    ctx.waitUntil((async () => {
      const loadedPolicy = await loadWorkerBlockedSubjectPolicy(env, {
        consumer: "worker-scheduled",
        invocationId: crypto.randomUUID(),
        useQueueCache: false,
      });
      return processDue(env, limit, loadedPolicy.snapshot);
    })());
  },
};

export { classifyExpiredLease, classifySourceEligibility, extractSourceBodyText, isKoreaPolicyRelevant, isMostlyEnglish, nextKstDailyRetryIso, normalizeWorkerCategory, preserveWorkerSourceCategoryTag, recoverExpiredLeases, recoverExpiredLeasesWithObservationWindow };
