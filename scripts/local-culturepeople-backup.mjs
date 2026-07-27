#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
const DEFAULT_D1_DATABASE = "culturepeople-prod";
const DEFAULT_D1_PAGE_SIZE = 100;
const DEFAULT_D1_DELAY_MS = 200;
const DEFAULT_SUPABASE_PAGE_SIZE = 100;
const DEFAULT_SUPABASE_DELAY_MS = 300;
const DEFAULT_MEDIA_CONCURRENCY = 1;
const DEFAULT_MEDIA_DELAY_MS = 700;
const DEFAULT_MEDIA_TIMEOUT_MS = 30000;
const DEFAULT_MEDIA_RETRIES = 1;
const DEFAULT_MEDIA_RETRY_DELAY_MS = 5000;
const DEFAULT_MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const DEFAULT_MIN_FREE_GB = 10;
const DEFAULT_MAX_DISK_USED_PERCENT = 95;
const DEFAULT_LOCK_STALE_MINUTES = 12 * 60;
const DEFAULT_MEDIA_FAILURE_COOLDOWN_HOURS = 7 * 24;
const DEFAULT_MEDIA_FAILURE_SEED_BACKUPS = 14;
const MEDIA_STORE_DIR = "_media-store";

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referer",
  "source",
  "sourceType",
  "source_type",
]);

const DEFAULT_D1_TABLES = [
  "articles",
  "article_search_index",
  "site_settings",
  "comments",
  "notifications",
  "distribute_logs",
  "media_objects",
  "auto_press_runs",
  "auto_press_items",
  "auto_press_events",
  "auto_press_retry_queue",
  "auto_press_source_stats",
  "auto_press_daily_usage",
];

const DEFAULT_SUPABASE_TABLES = [
  "articles",
  "site_settings",
  "comments",
  "notifications",
];

const D1_TABLE_ORDER = {
  articles: "COALESCE(no, 999999999), created_at, id",
  article_search_index: "article_id",
  site_settings: "key",
  comments: "created_at, id",
  view_logs: "id",
  distribute_logs: "timestamp, id",
  notifications: "created_at, id",
  media_objects: "created_at, id",
  cloudflare_usage_snapshots: "id",
  migration_runs: "started_at, id",
  migration_row_checksums: "source_table, source_id",
  auto_press_runs: "started_at, id",
  auto_press_items: "created_at, id",
  auto_press_events: "id",
  auto_press_retry_queue: "created_at, id",
  auto_press_source_stats: "date, source_id",
  auto_press_daily_usage: "date",
};

const SUPABASE_TABLE_ORDER = {
  articles: "created_at.asc,id.asc",
  site_settings: "key.asc",
  comments: "created_at.asc,id.asc",
  notifications: "created_at.asc,id.asc",
};

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

function printHelp() {
  console.log(`Usage: node scripts/local-culturepeople-backup.mjs [options]

Creates a read-only local backup from Cloudflare D1/R2-style media URLs and
Supabase REST data. Raw database exports stay separate, while articles are
merged into one local JSON backup.

Common options:
  --sample                     Export only a tiny sample and at most 3 media files.
  --no-media                   Export DB JSON only.
  --out <dir>                  Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --max-rows <n>               Max rows per table.
  --max-media <n>              Max media downloads.
  --max-new-media <n>          Max uncached media downloads; cached files still appear in the manifest.
  --include-external-media     Also download non-managed article image URLs.
  --all-tables                 Export every detected D1 table. May be heavier.
  --supabase-fallback-dir <d>  Local Supabase export fallback. Default: exports/supabase.
  --no-supabase-fallback       Do not use a local fallback if live Supabase fails.
  --strict                     Exit non-zero if either DB cannot be read.
  --retention-days <n>         Deprecated safety no-op. Use backup:retention:plan.
  --min-free-gb <n>            Fail before backup if disk has less free space. Default ${DEFAULT_MIN_FREE_GB}.
  --max-disk-used-percent <n>  Fail before backup at or above this usage. Default ${DEFAULT_MAX_DISK_USED_PERCENT}.
  --lock-stale-minutes <n>     Replace a lock older than this. Default ${DEFAULT_LOCK_STALE_MINUTES}.
  --no-lock                    Disable local overlap protection.

Load controls:
  --d1-page-size <n>           Default ${DEFAULT_D1_PAGE_SIZE}, max 1000.
  --d1-delay-ms <n>            Default ${DEFAULT_D1_DELAY_MS}.
  --supabase-page-size <n>     Default ${DEFAULT_SUPABASE_PAGE_SIZE}, max 1000.
  --supabase-delay-ms <n>      Default ${DEFAULT_SUPABASE_DELAY_MS}.
  --media-concurrency <n>      Default ${DEFAULT_MEDIA_CONCURRENCY}, max 4.
  --media-delay-ms <n>         Default ${DEFAULT_MEDIA_DELAY_MS}.
  --media-timeout-ms <n>       Default ${DEFAULT_MEDIA_TIMEOUT_MS}, max 120000.
  --media-retries <n>          Retry failed media downloads. Default ${DEFAULT_MEDIA_RETRIES}, max 3.
  --media-retry-delay-ms <n>   Delay between media retries. Default ${DEFAULT_MEDIA_RETRY_DELAY_MS}.
  --media-failure-cooldown-hours <n>
                              Skip recently failed media URLs/hosts for this long. Default ${DEFAULT_MEDIA_FAILURE_COOLDOWN_HOURS}.
  --media-failure-seed-backups <n>
                              Read recent media manifests to seed failure cooldowns. Default ${DEFAULT_MEDIA_FAILURE_SEED_BACKUPS}.
`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const result = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) result[key] = value;
  }
  return result;
}

function loadEnv(flags) {
  if (flags.has("no-env-files")) return { ...process.env };
  return {
    ...loadEnvFile(path.resolve(".env.local")),
    ...loadEnvFile(path.resolve(".env.production.local")),
    ...loadEnvFile(path.resolve(".env.vercel.local")),
    ...process.env,
  };
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function cleanBaseUrl(value) {
  return clean(value).replace(/\/+$/, "");
}

function toPositiveInt(value, fallback, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

function toNonNegativeInt(value, fallback, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(Math.floor(number), max);
}

function timestampForDir(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nearestExistingPath(targetPath) {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const precision = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unit]}`;
}

function readAvailableDiskBytes(targetPath) {
  if (typeof fs.statfsSync !== "function") return null;
  const stats = fs.statfsSync(nearestExistingPath(targetPath));
  return Number(stats.bavail || 0) * Number(stats.bsize || 0);
}

function assertMinimumDiskFree(targetPath, minFreeBytes) {
  if (!minFreeBytes) return;
  const availableBytes = readAvailableDiskBytes(targetPath);
  if (availableBytes == null) return;
  if (availableBytes < minFreeBytes) {
    throw new Error(
      `Backup disk free space is too low: ${formatBytes(availableBytes)} available, ${formatBytes(minFreeBytes)} required.`,
    );
  }
}

function assertMaximumDiskUsed(targetPath, maxUsedPercent) {
  if (typeof fs.statfsSync !== "function" || !Number.isFinite(maxUsedPercent)) return;
  const stats = fs.statfsSync(nearestExistingPath(targetPath));
  const total = Number(stats.blocks || 0) * Number(stats.bsize || 0);
  const free = Number(stats.bfree || 0) * Number(stats.bsize || 0);
  const usedPercent = total > 0 ? ((total - free) / total) * 100 : 0;
  if (usedPercent >= maxUsedPercent) {
    throw new Error(`Backup disk is ${usedPercent.toFixed(1)}% used; apply is blocked at ${maxUsedPercent}%. Run backup:retention:plan and review it before any deletion.`);
  }
}

function isProcessAlive(pid) {
  const number = Number(pid);
  if (!Number.isInteger(number) || number <= 0) return false;
  try {
    process.kill(number, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readLockInfo(lockDir) {
  const lockFile = path.join(lockDir, "lock.json");
  try {
    return JSON.parse(fs.readFileSync(lockFile, "utf8"));
  } catch {
    return null;
  }
}

function describeLock(lockDir, info) {
  const pid = info?.pid ? `pid ${info.pid}` : "unknown pid";
  const startedAt = info?.started_at ? `started ${info.started_at}` : "unknown start time";
  const host = info?.hostname ? ` on ${info.hostname}` : "";
  return `${lockDir} (${pid}${host}, ${startedAt})`;
}

function acquireBackupLock(config) {
  if (config.noLock) return null;

  const lockDir = path.join(config.backupRoot, ".backup.lock");
  const lockFile = path.join(lockDir, "lock.json");
  const token = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : sha256Hex(`${process.pid}:${config.runId}:${Date.now()}:${Math.random()}`);
  const staleMs = Math.max(0, config.lockStaleMinutes) * 60 * 1000;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(lockDir);
      const info = {
        token,
        pid: process.pid,
        hostname: os.hostname(),
        platform: process.platform,
        run_id: config.runId,
        backup_root: config.backupRoot,
        started_at: new Date().toISOString(),
      };
      writeJson(lockFile, info);
      return { dir: lockDir, file: lockFile, token };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    const info = readLockInfo(lockDir);
    const stat = fs.statSync(lockDir);
    const ageMs = Math.max(0, Date.now() - stat.mtimeMs);
    const sameHost = !info?.hostname || info.hostname === os.hostname();
    if (sameHost && isProcessAlive(info?.pid)) {
      throw new Error(`Backup already appears to be running: ${describeLock(lockDir, info)}.`);
    }
    if (staleMs && ageMs < staleMs) {
      throw new Error(`Backup lock exists and is not stale yet: ${describeLock(lockDir, info)}.`);
    }

    fs.rmSync(lockDir, { recursive: true, force: true });
  }

  throw new Error(`Could not acquire backup lock after replacing stale lock: ${lockDir}`);
}

function releaseBackupLock(lock) {
  if (!lock) return;
  const info = readLockInfo(lock.dir);
  if (info?.token && info.token !== lock.token) return;
  fs.rmSync(lock.dir, { recursive: true, force: true });
}

function attachLockSignalHandlers(lock) {
  if (!lock) return;
  const exitCodes = { SIGINT: 130, SIGTERM: 143 };
  for (const signal of Object.keys(exitCodes)) {
    process.once(signal, () => {
      releaseBackupLock(lock);
      process.exit(exitCodes[signal]);
    });
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeNdjson(filePath, rows) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
    "utf8",
  );
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function hostOf(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

async function cloudflareRequest({ endpoint, apiToken, method = "GET", body }) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { success: false, errors: [{ message: text || response.statusText }] };
  }

  return {
    ok: response.ok && json.success !== false,
    status: response.status,
    json,
  };
}

function summarizeCloudflareErrors(json) {
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  return errors.map((error) => error.message).filter(Boolean).join("; ") || "unknown error";
}

async function resolveD1DatabaseId({ accountId, apiToken, databaseName, explicitDatabaseId }) {
  if (explicitDatabaseId) return explicitDatabaseId;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseName)) {
    return databaseName;
  }

  const result = await cloudflareRequest({
    apiToken,
    endpoint: `/accounts/${encodeURIComponent(accountId)}/d1/database?per_page=100`,
  });

  if (!result.ok) {
    throw new Error(`D1 database list failed (${result.status}): ${summarizeCloudflareErrors(result.json)}`);
  }

  const databases = Array.isArray(result.json.result) ? result.json.result : [];
  const found = databases.find((item) => item.name === databaseName);
  if (!found?.uuid) {
    throw new Error(`D1 database not found: ${databaseName}`);
  }
  return found.uuid;
}

async function d1Query({ accountId, apiToken, databaseId, sql, params = [] }) {
  const result = await cloudflareRequest({
    apiToken,
    endpoint: `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
    method: "POST",
    body: { sql, params },
  });

  if (!result.ok) {
    throw new Error(`D1 query failed (${result.status}): ${summarizeCloudflareErrors(result.json)}`);
  }

  const payload = Array.isArray(result.json.result) ? result.json.result[0] : result.json.result;
  if (payload?.success === false) {
    throw new Error(`D1 query failed: ${payload.error || summarizeCloudflareErrors(result.json)}`);
  }
  return Array.isArray(payload?.results) ? payload.results : [];
}

async function exportD1Table({ accountId, apiToken, databaseId, table, pageSize, maxRows, delayMs }) {
  const rows = [];
  const order = D1_TABLE_ORDER[table] ? ` ORDER BY ${D1_TABLE_ORDER[table]}` : "";

  for (let offset = 0; ; offset += pageSize) {
    const limit = maxRows ? Math.min(pageSize, Math.max(maxRows - rows.length, 0)) : pageSize;
    if (limit <= 0) break;

    const page = await d1Query({
      accountId,
      apiToken,
      databaseId,
      sql: `SELECT * FROM ${quoteIdent(table)}${order} LIMIT ? OFFSET ?`,
      params: [limit, offset],
    });

    rows.push(...page);
    if (page.length < limit) break;
    if (maxRows && rows.length >= maxRows) break;
    await delay(delayMs);
  }

  return rows;
}

async function exportD1({ env, config, dirs }) {
  const result = {
    ok: false,
    configured: false,
    database: config.d1DatabaseName,
    databaseId: null,
    tables: [],
    warnings: [],
    errors: [],
  };

  if (config.skipD1) {
    result.warnings.push("D1 export skipped by --skip-d1.");
    return { result, tables: {}, schema: [] };
  }

  const accountId = clean(config.cloudflareAccountId || env.CLOUDFLARE_ACCOUNT_ID);
  const apiToken = clean(config.cloudflareApiToken || env.CLOUDFLARE_API_TOKEN);
  const explicitDatabaseId = clean(config.d1DatabaseId || env.CLOUDFLARE_D1_DATABASE_ID || env.D1_DATABASE_ID);

  if (!accountId || !apiToken) {
    result.errors.push("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for D1 export.");
    return { result, tables: {}, schema: [] };
  }
  result.configured = true;

  try {
    const databaseId = await resolveD1DatabaseId({
      accountId,
      apiToken,
      databaseName: config.d1DatabaseName,
      explicitDatabaseId,
    });
    result.databaseId = databaseId;

    const schema = await d1Query({
      accountId,
      apiToken,
      databaseId,
      sql: "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
    });
    writeJson(path.join(dirs.rawD1, "schema.json"), schema);

    const detectedTables = schema
      .filter((row) => row.type === "table" && row.name)
      .map((row) => String(row.name));
    const selectedTables = config.allD1Tables
      ? detectedTables
      : config.d1Tables.filter((table) => detectedTables.includes(table));
    const missingTables = config.d1Tables.filter((table) => !detectedTables.includes(table));
    if (!config.allD1Tables && missingTables.length) {
      result.warnings.push(`D1 tables not detected and skipped: ${missingTables.join(", ")}`);
    }

    const tables = {};
    for (const table of selectedTables) {
      const rows = await exportD1Table({
        accountId,
        apiToken,
        databaseId,
        table,
        pageSize: config.d1PageSize,
        maxRows: config.maxRows,
        delayMs: config.d1DelayMs,
      });
      tables[table] = rows;
      writeJson(path.join(dirs.rawD1Tables, `${table}.json`), rows);
      result.tables.push({ table, rows: rows.length, file: path.join(dirs.rawD1Tables, `${table}.json`) });
      await delay(config.d1DelayMs);
    }

    result.ok = true;
    return { result, tables, schema };
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return { result, tables: {}, schema: [] };
  }
}

class SupabaseHttpError extends Error {
  constructor(message, { status, bodyText, url }) {
    super(message);
    this.name = "SupabaseHttpError";
    this.status = status;
    this.bodyText = bodyText;
    this.url = url;
  }
}

function supabaseHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
  };
}

function supabaseErrorSummary(status, bodyText) {
  let body = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = null;
  }

  const message = body?.message || body?.error || bodyText || "No response body";
  const code = body?.code ? ` ${body.code}` : "";
  if (status === 402) {
    return "Supabase REST is restricted with HTTP 402. The project may be quota-restricted.";
  }
  if (status === 401 || status === 403) {
    return `Supabase auth failed with HTTP ${status}${code}: ${String(message).slice(0, 220)}`;
  }
  return `Supabase REST failed with HTTP ${status}${code}: ${String(message).slice(0, 220)}`;
}

function isMissingSupabaseTable(error) {
  if (!(error instanceof SupabaseHttpError)) return false;
  let body = null;
  try {
    body = JSON.parse(error.bodyText);
  } catch {
    body = null;
  }
  const text = `${error.bodyText || ""} ${body?.message || ""} ${body?.details || ""}`.toLowerCase();
  return error.status === 404 ||
    body?.code === "PGRST205" ||
    text.includes("could not find the table") ||
    (text.includes("relation") && text.includes("does not exist"));
}

function canRetrySupabaseWithoutOrder(error) {
  if (!(error instanceof SupabaseHttpError)) return false;
  if (error.status !== 400) return false;
  const text = String(error.bodyText || "").toLowerCase();
  return text.includes("order") || text.includes("column") || text.includes("does not exist");
}

async function requestSupabasePage({ supabaseUrl, serviceKey, table, pageSize, offset, order }) {
  const url = new URL(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("offset", String(offset));
  if (order) url.searchParams.set("order", order);

  const response = await fetch(url, {
    headers: supabaseHeaders(serviceKey),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new SupabaseHttpError(supabaseErrorSummary(response.status, text), {
      status: response.status,
      bodyText: text,
      url: String(url),
    });
  }

  let rows;
  try {
    rows = text ? JSON.parse(text) : [];
  } catch (error) {
    throw new Error(`Invalid Supabase JSON for ${table}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected Supabase response for ${table}: expected an array.`);
  }
  return rows;
}

async function exportSupabaseTable({ supabaseUrl, serviceKey, table, pageSize, maxRows, delayMs, allowMissing }) {
  const rows = [];
  const warnings = [];
  let order = SUPABASE_TABLE_ORDER[table] || "";

  for (let offset = 0; ; offset += pageSize) {
    const limit = maxRows ? Math.min(pageSize, Math.max(maxRows - rows.length, 0)) : pageSize;
    if (limit <= 0) break;

    let page;
    try {
      page = await requestSupabasePage({ supabaseUrl, serviceKey, table, pageSize: limit, offset, order });
    } catch (error) {
      if (offset === 0 && order && canRetrySupabaseWithoutOrder(error)) {
        warnings.push(`Order '${order}' failed for ${table}; retried without ordering.`);
        order = "";
        continue;
      }
      if (allowMissing && isMissingSupabaseTable(error)) {
        warnings.push(`Optional Supabase table '${table}' was not found; exported an empty array.`);
        return { rows: [], warnings, missing: true };
      }
      throw error;
    }

    rows.push(...page);
    if (page.length < limit) break;
    if (maxRows && rows.length >= maxRows) break;
    await delay(delayMs);
  }

  return { rows, warnings, missing: false };
}

async function exportSupabase({ env, config, dirs }) {
  const result = {
    ok: false,
    configured: false,
    source: "live_rest",
    fallback_used: false,
    fallback_dir: config.supabaseFallbackDir,
    fallback_generated_at: null,
    projectHost: null,
    tables: [],
    warnings: [],
    errors: [],
    remote_errors: [],
  };

  if (config.skipSupabase) {
    result.warnings.push("Supabase export skipped by --skip-supabase.");
    return { result, tables: {} };
  }

  const supabaseUrl = cleanBaseUrl(config.supabaseUrl || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);
  const serviceKey = clean(config.supabaseServiceKey || env.SUPABASE_SERVICE_KEY || (config.allowAnon ? env.NEXT_PUBLIC_SUPABASE_ANON_KEY : ""));
  result.projectHost = hostOf(supabaseUrl) || null;

  if (!supabaseUrl || !serviceKey) {
    result.errors.push("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required for Supabase export.");
    return loadSupabaseFallback({ result, config, dirs }) || { result, tables: {} };
  }
  result.configured = true;

  try {
    const tables = {};
    for (const table of config.supabaseTables) {
      const exported = await exportSupabaseTable({
        supabaseUrl,
        serviceKey,
        table,
        pageSize: config.supabasePageSize,
        maxRows: config.maxRows,
        delayMs: config.supabaseDelayMs,
        allowMissing: true,
      });
      tables[table] = exported.rows;
      writeJson(path.join(dirs.rawSupabaseTables, `${table}.json`), exported.rows);
      result.tables.push({
        table,
        rows: exported.rows.length,
        missing: exported.missing,
        file: path.join(dirs.rawSupabaseTables, `${table}.json`),
      });
      result.warnings.push(...exported.warnings);
      await delay(config.supabaseDelayMs);
    }
    result.ok = true;
    return { result, tables };
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return loadSupabaseFallback({ result, config, dirs }) || { result, tables: {} };
  }
}

function loadSupabaseFallback({ result, config, dirs }) {
  if (config.noSupabaseFallback || !config.supabaseFallbackDir) return null;
  if (!fs.existsSync(config.supabaseFallbackDir)) return null;

  const tables = {};
  const fallbackWarnings = [];
  const fallbackManifest = readJsonIfExists(path.join(config.supabaseFallbackDir, "export-manifest.json"));
  for (const table of config.supabaseTables) {
    const filePath = path.join(config.supabaseFallbackDir, `${table}.json`);
    const rows = readJsonIfExists(filePath);
    if (Array.isArray(rows)) {
      const selectedRows = config.maxRows ? rows.slice(0, config.maxRows) : rows;
      tables[table] = selectedRows;
      writeJson(path.join(dirs.rawSupabaseTables, `${table}.json`), selectedRows);
      result.tables.push({
        table,
        rows: selectedRows.length,
        missing: false,
        file: path.join(dirs.rawSupabaseTables, `${table}.json`),
        fallback_file: filePath,
      });
    } else {
      tables[table] = [];
      writeJson(path.join(dirs.rawSupabaseTables, `${table}.json`), []);
      fallbackWarnings.push(`Fallback Supabase table file not found or not an array: ${filePath}`);
      result.tables.push({
        table,
        rows: 0,
        missing: true,
        file: path.join(dirs.rawSupabaseTables, `${table}.json`),
        fallback_file: filePath,
      });
    }
  }

  result.remote_errors = [...result.errors];
  result.errors = [];
  result.ok = true;
  result.source = "local_fallback";
  result.fallback_used = true;
  result.fallback_generated_at = fallbackManifest?.generatedAt || fallbackManifest?.generated_at || null;
  result.warnings.push(
    "Live Supabase export failed, so a local fallback snapshot was copied into this backup.",
    ...fallbackWarnings,
  );
  if (result.remote_errors.length) {
    result.warnings.push(`Live Supabase errors: ${result.remote_errors.join("; ")}`);
  }

  return { result, tables };
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function positiveIntOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function booleanInt(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value ? 1 : 0;
  const text = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(text) ? 1 : 0;
}

function jsonStringFrom(value, fallback) {
  if (value === null || value === undefined || value === "") return JSON.stringify(fallback);
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isTrackingParam(key) {
  const normalized = String(key || "").trim().toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_PARAMS.has(key) || TRACKING_PARAMS.has(normalized);
}

function normalizeArticleSourceUrl(value) {
  const raw = String(value || "").trim();
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

function titleDuplicateKey(article) {
  const title = normalizeArticleTitle(article.title);
  return title.length >= 8 ? `title:${title}` : "";
}

function sourceDuplicateKey(article) {
  const source = normalizeArticleSourceUrl(article.source_url);
  return source ? `source:${source}` : "";
}

function identityKeys(article) {
  return [
    article.id ? `id:${article.id}` : "",
    sourceDuplicateKey(article),
    titleDuplicateKey(article),
  ].filter(Boolean);
}

function normalizeArticle(row, sourceDatabase, sourceIndex) {
  const id = stringOrNull(pick(row, "id")) || `${sourceDatabase}-${sha256Hex(JSON.stringify(row)).slice(0, 16)}`;
  const body = stringOrNull(pick(row, "body")) || "";
  const title = stringOrNull(pick(row, "title")) || "(untitled)";
  const createdAt = stringOrNull(pick(row, "created_at", "createdAt")) || "";
  const updatedAt = stringOrNull(pick(row, "updated_at", "updatedAt")) || "";
  const auditTrailJson = stringOrNull(pick(row, "audit_trail_json"));

  return {
    id,
    no: positiveIntOrNull(pick(row, "no")),
    title,
    category: stringOrNull(pick(row, "category")) || "news",
    date: stringOrNull(pick(row, "date")) || createdAt.slice(0, 10) || new Date().toISOString().slice(0, 10),
    status: stringOrNull(pick(row, "status")) || "draft",
    views: numberOrZero(pick(row, "views")),
    body,
    thumbnail: stringOrNull(pick(row, "thumbnail")),
    thumbnail_alt: stringOrNull(pick(row, "thumbnail_alt", "thumbnailAlt")),
    tags: stringOrNull(pick(row, "tags")),
    author: stringOrNull(pick(row, "author")),
    author_email: stringOrNull(pick(row, "author_email", "authorEmail")),
    summary: stringOrNull(pick(row, "summary")),
    slug: stringOrNull(pick(row, "slug")),
    meta_description: stringOrNull(pick(row, "meta_description", "metaDescription")),
    og_image: stringOrNull(pick(row, "og_image", "ogImage")),
    scheduled_publish_at: stringOrNull(pick(row, "scheduled_publish_at", "scheduledPublishAt")),
    updated_at: updatedAt || null,
    source_url: stringOrNull(pick(row, "source_url", "sourceUrl")),
    deleted_at: stringOrNull(pick(row, "deleted_at", "deletedAt")),
    parent_article_id: stringOrNull(pick(row, "parent_article_id", "parentArticleId")),
    review_note: stringOrNull(pick(row, "review_note", "reviewNote")),
    audit_trail_json: auditTrailJson || jsonStringFrom(pick(row, "audit_trail", "auditTrail"), []),
    created_at: createdAt || new Date().toISOString(),
    ai_generated: booleanInt(pick(row, "ai_generated", "aiGenerated")),
    backup_meta: {
      source_database: sourceDatabase,
      source_index: sourceIndex,
      source_record_id: stringOrNull(pick(row, "id")),
      source_no: positiveIntOrNull(pick(row, "no")),
      raw_checksum: sha256Hex(JSON.stringify(row)),
      duplicate_sources: [],
    },
  };
}

function mergeArticles({ d1Articles, supabaseArticles }) {
  const report = {
    raw: {
      d1: d1Articles.length,
      supabase: supabaseArticles.length,
    },
    kept: {
      d1: 0,
      supabase: 0,
      total: 0,
    },
    duplicates: [],
    noConflicts: [],
    slugConflicts: [],
    notes: [
      "D1 rows are preferred when the same article appears in both databases.",
      "Supabase-only rows are kept so the local backup is a unified article set.",
      "Original article numbers are preserved; conflicts are reported, not rewritten.",
    ],
  };

  const merged = [];
  const identity = new Map();

  function remember(article, index, sourceScope) {
    for (const key of identityKeys(article)) {
      if (!identity.has(key)) identity.set(key, { index, article, sourceScope, key });
    }
  }

  function addOrDuplicate(article, sourceScope) {
    const duplicate = identityKeys(article).map((key) => identity.get(key)).find(Boolean);
    if (duplicate) {
      report.duplicates.push({
        source_database: sourceScope,
        id: article.id,
        no: article.no,
        title: article.title,
        source_url: article.source_url,
        duplicate_key: duplicate.key,
        kept_source_database: duplicate.article.backup_meta.source_database,
        kept_id: duplicate.article.id,
        kept_no: duplicate.article.no,
        kept_title: duplicate.article.title,
      });
      duplicate.article.backup_meta.duplicate_sources.push({
        source_database: sourceScope,
        id: article.id,
        no: article.no,
        title: article.title,
        source_url: article.source_url,
        duplicate_key: duplicate.key,
      });
      return;
    }

    const index = merged.length;
    merged.push(article);
    report.kept[sourceScope] += 1;
    remember(article, index, sourceScope);
  }

  d1Articles.forEach((row, index) => addOrDuplicate(normalizeArticle(row, "d1", index), "d1"));
  supabaseArticles.forEach((row, index) => addOrDuplicate(normalizeArticle(row, "supabase", index), "supabase"));

  const byNo = new Map();
  const bySlug = new Map();
  for (const article of merged) {
    if (article.no) {
      const key = String(article.no);
      const existing = byNo.get(key);
      if (existing) {
        report.noConflicts.push({
          no: article.no,
          first: {
            source_database: existing.backup_meta.source_database,
            id: existing.id,
            title: existing.title,
          },
          second: {
            source_database: article.backup_meta.source_database,
            id: article.id,
            title: article.title,
          },
        });
      } else {
        byNo.set(key, article);
      }
    }

    if (article.slug) {
      const key = article.slug.trim().toLowerCase();
      const existing = bySlug.get(key);
      if (existing) {
        report.slugConflicts.push({
          slug: article.slug,
          first: {
            source_database: existing.backup_meta.source_database,
            id: existing.id,
            title: existing.title,
          },
          second: {
            source_database: article.backup_meta.source_database,
            id: article.id,
            title: article.title,
          },
        });
      } else {
        bySlug.set(key, article);
      }
    }
  }

  merged.sort((a, b) => {
    const aNo = a.no ?? Number.MAX_SAFE_INTEGER;
    const bNo = b.no ?? Number.MAX_SAFE_INTEGER;
    if (aNo !== bNo) return aNo - bNo;
    const aDate = a.created_at || a.date || "";
    const bDate = b.created_at || b.date || "";
    return aDate.localeCompare(bDate) || a.id.localeCompare(b.id);
  });

  report.kept.total = merged.length;
  return { articles: merged, report };
}

function extractUrlsFromHtml(html) {
  const urls = [];
  const body = String(html || "");
  for (const match of body.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

function addMediaCandidate(map, url, reference) {
  const value = String(url || "").trim();
  if (!value) return;

  const key = value;
  const existing = map.get(key);
  if (existing) {
    existing.references.push(reference);
    return;
  }

  map.set(key, {
    url: value,
    references: [reference],
  });
}

function buildMediaCandidates({ d1Tables, supabaseTables, mergedArticles, env, config }) {
  const map = new Map();
  const d1Articles = Array.isArray(d1Tables.articles) ? d1Tables.articles : [];
  const supabaseArticles = Array.isArray(supabaseTables.articles) ? supabaseTables.articles : [];
  const mediaObjects = Array.isArray(d1Tables.media_objects) ? d1Tables.media_objects : [];

  for (const row of mediaObjects) {
    addMediaCandidate(map, pick(row, "public_url", "publicUrl"), {
      source: "d1.media_objects",
      usage_type: pick(row, "usage_type", "usageType") || "media_object",
      article_id: pick(row, "article_id", "articleId") || null,
      object_key: pick(row, "object_key", "objectKey") || null,
      provider: pick(row, "provider") || null,
    });
  }

  function addArticleImages(rows, sourceDatabase) {
    rows.forEach((row, index) => {
      const articleId = pick(row, "id") || null;
      addMediaCandidate(map, pick(row, "thumbnail"), {
        source: `${sourceDatabase}.articles`,
        usage_type: "thumbnail",
        article_id: articleId,
        source_index: index,
      });
      addMediaCandidate(map, pick(row, "og_image", "ogImage"), {
        source: `${sourceDatabase}.articles`,
        usage_type: "og_image",
        article_id: articleId,
        source_index: index,
      });
      for (const url of extractUrlsFromHtml(pick(row, "body"))) {
        addMediaCandidate(map, url, {
          source: `${sourceDatabase}.articles`,
          usage_type: "body",
          article_id: articleId,
          source_index: index,
        });
      }
    });
  }

  addArticleImages(d1Articles, "d1");
  addArticleImages(supabaseArticles, "supabase");

  const r2BaseHost = hostOf(env.R2_PUBLIC_BASE_URL || env.CLOUDFLARE_R2_PUBLIC_BASE_URL);
  const supabaseHost = hostOf(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);

  return [...map.values()].map((candidate) => {
    const url = candidate.url;
    const parsedHost = hostOf(url);
    const fromMediaObjects = candidate.references.some((ref) => ref.source === "d1.media_objects");
    const isManagedR2 = Boolean(parsedHost && r2BaseHost && parsedHost === r2BaseHost);
    const isSupabaseStorage = Boolean(
      parsedHost &&
      ((supabaseHost && parsedHost === supabaseHost) || /supabase\.co$/i.test(parsedHost)) &&
      /\/storage\/v1\/object\/public\//i.test(url)
    );
    const isHttp = isHttpUrl(url);
    const downloadAllowed = isHttp && (config.includeExternalMedia || fromMediaObjects || isManagedR2 || isSupabaseStorage);
    let skipReason = "";
    if (!isHttp) skipReason = "not_http_url_or_relative_url";
    else if (!downloadAllowed) skipReason = "external_media_skipped_by_default";

    return {
      ...candidate,
      download_allowed: downloadAllowed,
      skip_reason: skipReason || null,
      managed_hint: {
        from_media_objects: fromMediaObjects,
        r2_public_base_match: isManagedR2,
        supabase_storage_match: isSupabaseStorage,
      },
      referenced_in_merged_articles: candidate.references.some((ref) => {
        const id = ref.article_id;
        return id && mergedArticles.some((article) => article.id === id);
      }),
    };
  });
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/avif") return "avif";
  return "";
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/);
    if (match?.[1]) {
      const ext = match[1] === "jpeg" ? "jpg" : match[1];
      if (["jpg", "png", "gif", "webp", "avif", "svg"].includes(ext)) return ext;
    }
  } catch {
    return "";
  }
  return "";
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

function mediaStoreRelativePath(contentHash, ext) {
  return path.join(MEDIA_STORE_DIR, "files", contentHash.slice(0, 2), `${contentHash}.${ext}`);
}

function backupRelativeFile(backupDir, filePath) {
  return path.relative(backupDir, filePath) || path.basename(filePath);
}

async function downloadOneMediaAttempt(candidate, dirs, config) {
  const startedAt = new Date().toISOString();
  const urlHash = sha256Hex(candidate.url);
  const timeout = withTimeout(config.mediaTimeoutMs);

  try {
    const response = await fetch(candidate.url, {
      signal: timeout.signal,
      headers: {
        "User-Agent": "culturepeople-local-backup/1.0 (+read-only; low-rate)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return {
        status: "failed",
        url: candidate.url,
        url_hash: urlHash,
        http_status: response.status,
        error: `HTTP ${response.status}`,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      };
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > config.maxMediaBytes) {
      return {
        status: "skipped",
        url: candidate.url,
        url_hash: urlHash,
        content_type: contentType,
        content_length: contentLength,
        error: `content-length exceeds max-media-bytes (${config.maxMediaBytes})`,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      };
    }

    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > config.maxMediaBytes) {
      return {
        status: "skipped",
        url: candidate.url,
        url_hash: urlHash,
        content_type: contentType,
        content_length: body.byteLength,
        error: `downloaded body exceeds max-media-bytes (${config.maxMediaBytes})`,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      };
    }

    const bodyHash = sha256Hex(body);
    const ext = extensionFromContentType(contentType) || extensionFromUrl(candidate.url) || "bin";
    const storeRelativePath = mediaStoreRelativePath(bodyHash, ext);
    const filePath = path.join(config.backupRoot, storeRelativePath);
    ensureDir(path.dirname(filePath));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== body.byteLength) {
      fs.writeFileSync(filePath, body);
    }

    return {
      status: "downloaded",
      url: candidate.url,
      url_hash: urlHash,
      content_hash: bodyHash,
      content_type: contentType,
      bytes: body.byteLength,
      file: backupRelativeFile(dirs.backup, filePath),
      media_store_file: storeRelativePath,
      references: candidate.references,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "failed",
      url: candidate.url,
      url_hash: urlHash,
      error: error instanceof Error ? error.message : String(error),
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    };
  } finally {
    timeout.cancel();
  }
}

function isRetryableMediaFailure(result) {
  if (!result || result.status !== "failed") return false;
  if (!result.http_status) return true;
  return result.http_status === 408 || result.http_status === 429 || result.http_status >= 500;
}

async function downloadOneMedia(candidate, dirs, config) {
  const retryErrors = [];
  const maxAttempts = Math.max(1, config.mediaRetries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await downloadOneMediaAttempt(candidate, dirs, config);
    result.attempts = attempt;
    if (retryErrors.length) result.retry_errors = [...retryErrors];
    if (!isRetryableMediaFailure(result) || attempt >= maxAttempts) return result;

    retryErrors.push({
      attempt,
      http_status: result.http_status || null,
      error: result.error || "unknown media download error",
      completed_at: result.completed_at || new Date().toISOString(),
    });
    await delay(config.mediaRetryDelayMs);
  }

  return {
    status: "failed",
    url: candidate.url,
    error: "unreachable media retry state",
    attempts: maxAttempts,
    completed_at: new Date().toISOString(),
  };
}

function loadMediaUrlIndex(backupRoot) {
  const indexPath = path.join(backupRoot, "media-url-index.json");
  const index = readJsonIfExists(indexPath);
  if (index && typeof index === "object" && index.entries && typeof index.entries === "object") {
    index.failed_entries ??= {};
    index.failed_hosts ??= {};
    return {
      path: indexPath,
      data: index,
    };
  }
  return {
    path: indexPath,
    data: {
      version: 1,
      updated_at: null,
      entries: {},
      failed_entries: {},
      failed_hosts: {},
    },
  };
}

function recentBackupDirs(root, limit, currentDir = "") {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => path.join(root, name))
    .filter((dir) => dir !== currentDir && fs.existsSync(path.join(dir, "media", "media-manifest.json")))
    .sort()
    .reverse()
    .slice(0, Math.max(0, limit));
}

function mediaFailureRecord(item) {
  const url = String(item?.url || "");
  const host = hostOf(url);
  return {
    url,
    url_hash: item?.url_hash || sha256Hex(url),
    host,
    status: item?.status || "failed",
    http_status: item?.http_status || null,
    error: item?.error || "unknown media download error",
    attempts: Number(item?.attempts || 1),
    retry_errors: Array.isArray(item?.retry_errors) ? item.retry_errors : [],
    first_failed_at: item?.started_at || item?.completed_at || new Date().toISOString(),
    last_failed_at: item?.completed_at || new Date().toISOString(),
  };
}

function latestIsoTimestamp(...values) {
  let latest = "";
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const text = String(value || "");
    const timestamp = Date.parse(text);
    if (Number.isFinite(timestamp) && timestamp > latestMs) {
      latest = text;
      latestMs = timestamp;
    }
  }
  return latest;
}

function recordMediaFailure(mediaUrlIndex, item) {
  if (!item?.url || item.status !== "failed") return;
  const record = mediaFailureRecord(item);
  const existing = mediaUrlIndex.data.failed_entries[record.url] || {};
  mediaUrlIndex.data.failed_entries[record.url] = {
    ...record,
    first_failed_at: existing.first_failed_at || record.first_failed_at,
    failure_count: Number(existing.failure_count || 0) + 1,
  };

  if (record.host) {
    const hostRecord = mediaUrlIndex.data.failed_hosts[record.host] || {};
    const lastFailedAt = latestIsoTimestamp(hostRecord.last_failed_at, record.last_failed_at) || record.last_failed_at;
    mediaUrlIndex.data.failed_hosts[record.host] = {
      host: record.host,
      first_failed_at: hostRecord.first_failed_at || record.first_failed_at,
      last_failed_at: lastFailedAt,
      error: lastFailedAt === hostRecord.last_failed_at ? hostRecord.error : record.error,
      http_status: lastFailedAt === hostRecord.last_failed_at ? hostRecord.http_status : record.http_status,
      failure_count: Number(hostRecord.failure_count || 0) + 1,
    };
  }
}

function clearMediaFailure(mediaUrlIndex, item) {
  if (!item?.url) return;
  delete mediaUrlIndex.data.failed_entries[item.url];
}

function seedMediaFailuresFromRecentBackups({ mediaUrlIndex, config, dirs }) {
  if (!config.mediaFailureSeedBackups) return 0;
  let seeded = 0;
  for (const backupDir of recentBackupDirs(config.backupRoot, config.mediaFailureSeedBackups, dirs.backup)) {
    const manifest = readJsonIfExists(path.join(backupDir, "media", "media-manifest.json"));
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    for (const item of files) {
      if (item?.status !== "failed" || !item?.url) continue;
      if (!mediaUrlIndex.data.failed_entries[item.url]) seeded += 1;
      recordMediaFailure(mediaUrlIndex, item);
    }
  }
  return seeded;
}

function isActiveMediaFailure(record, cooldownHours) {
  if (!record || cooldownHours <= 0) return false;
  const timestamp = Date.parse(String(record.last_failed_at || record.first_failed_at || ""));
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp < cooldownHours * 60 * 60 * 1000;
}

function activeMediaFailure(candidate, mediaUrlIndex, cooldownHours) {
  const urlRecord = mediaUrlIndex.data.failed_entries[candidate.url];
  if (isActiveMediaFailure(urlRecord, cooldownHours)) {
    return {
      type: "url",
      key: candidate.url,
      record: urlRecord,
    };
  }

  const host = hostOf(candidate.url);
  const hostRecord = host ? mediaUrlIndex.data.failed_hosts[host] : null;
  if (isActiveMediaFailure(hostRecord, cooldownHours)) {
    return {
      type: "host",
      key: host,
      record: hostRecord,
    };
  }

  return null;
}

function cachedMediaFile(entry, backupRoot) {
  if (!entry) return "";
  if (entry.media_store_file) return path.resolve(backupRoot, entry.media_store_file);
  if (entry.storage === "media_store" && entry.file) return path.resolve(backupRoot, entry.file);
  if (!entry.backup_dir || !entry.file) return "";
  return path.resolve(entry.backup_dir, entry.file);
}

function extFromPath(filePath) {
  const ext = path.extname(String(filePath || "")).replace(/^\./, "").toLowerCase();
  return ext || "";
}

function migrateCachedMediaToStore({ sourceFile, entry, candidate, config }) {
  const stat = fs.statSync(sourceFile);
  const contentHash = entry.content_hash || sha256Hex(fs.readFileSync(sourceFile));
  const ext = extFromPath(entry.file) ||
    extensionFromContentType(entry.content_type) ||
    extensionFromUrl(candidate.url) ||
    "bin";
  const storeRelativePath = mediaStoreRelativePath(contentHash, ext);
  const storeFile = path.join(config.backupRoot, storeRelativePath);
  ensureDir(path.dirname(storeFile));
  if (!fs.existsSync(storeFile) || fs.statSync(storeFile).size !== stat.size) {
    fs.copyFileSync(sourceFile, storeFile);
  }
  return { storeFile, storeRelativePath, bytes: stat.size, contentHash };
}

function reusableCachedMedia(candidate, mediaUrlIndex, backupRoot) {
  const entry = mediaUrlIndex.data.entries[candidate.url];
  const sourceFile = cachedMediaFile(entry, backupRoot);
  return Boolean(sourceFile && fs.existsSync(sourceFile));
}

function reuseCachedMedia(candidate, dirs, config, mediaUrlIndex) {
  const entry = mediaUrlIndex.data.entries[candidate.url];
  const sourceFile = cachedMediaFile(entry, config.backupRoot);
  if (!sourceFile || !fs.existsSync(sourceFile)) return null;

  const migrated = migrateCachedMediaToStore({ sourceFile, entry, candidate, config });

  return {
    status: "reused",
    url: candidate.url,
    url_hash: entry.url_hash || sha256Hex(candidate.url),
    content_hash: migrated.contentHash,
    content_type: entry.content_type || "",
    bytes: Number(entry.bytes || migrated.bytes || 0),
    file: backupRelativeFile(dirs.backup, migrated.storeFile),
    media_store_file: migrated.storeRelativePath,
    references: candidate.references,
    cached_from: sourceFile,
    completed_at: new Date().toISOString(),
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function downloadMedia({ candidates, dirs, config }) {
  const allowed = candidates.filter((candidate) => candidate.download_allowed);
  const mediaUrlIndex = loadMediaUrlIndex(config.backupRoot);
  const seededRecentFailures = seedMediaFailuresFromRecentBackups({ mediaUrlIndex, config, dirs });
  let selected = [];
  let limitedNewMedia = 0;
  let deferredRecentFailures = 0;
  const deferredRecentFailureHosts = {};

  if (config.maxNewMedia != null) {
    let newMedia = 0;
    for (const candidate of allowed) {
      if (reusableCachedMedia(candidate, mediaUrlIndex, config.backupRoot)) {
        selected.push(candidate);
        continue;
      }
      const failure = activeMediaFailure(candidate, mediaUrlIndex, config.mediaFailureCooldownHours);
      if (failure) {
        deferredRecentFailures += 1;
        const host = hostOf(candidate.url) || "(unknown)";
        deferredRecentFailureHosts[host] = (deferredRecentFailureHosts[host] || 0) + 1;
        continue;
      }
      if (newMedia >= config.maxNewMedia) {
        limitedNewMedia += 1;
        continue;
      }
      selected.push(candidate);
      newMedia += 1;
    }
  } else {
    selected = allowed;
  }

  if (config.maxMedia != null) selected = selected.slice(0, config.maxMedia);
  const skippedByLimit = Math.max(0, allowed.length - selected.length);

  if (config.noMedia) {
    return {
      ok: true,
      mode: "no-media",
      candidates: candidates.length,
      downloadable: allowed.length,
      downloaded: 0,
      reused: 0,
      failed: 0,
      skipped: candidates.length,
      skipped_by_limit: 0,
      bytes: 0,
      files: [],
    };
  }

  const files = await runPool(selected, config.mediaConcurrency, async (candidate) => {
    const cached = reuseCachedMedia(candidate, dirs, config, mediaUrlIndex);
    if (cached) return cached;

    const result = await downloadOneMedia(candidate, dirs, config);
    await delay(config.mediaDelayMs);
    return result;
  });

  const downloaded = files.filter((item) => item.status === "downloaded");
  const reused = files.filter((item) => item.status === "reused");
  const failed = files.filter((item) => item.status === "failed");
  const retried = files.filter((item) => Number(item.attempts || 1) > 1);
  const retryAttempts = files.reduce((sum, item) => sum + Math.max(0, Number(item.attempts || 1) - 1), 0);
  const skipped = files.filter((item) => item.status === "skipped").length +
    candidates.filter((candidate) => !candidate.download_allowed).length +
    skippedByLimit;

  for (const item of [...downloaded, ...reused]) {
    clearMediaFailure(mediaUrlIndex, item);
    mediaUrlIndex.data.entries[item.url] = {
      url: item.url,
      url_hash: item.url_hash || sha256Hex(item.url),
      content_hash: item.content_hash || null,
      content_type: item.content_type || "",
      bytes: Number(item.bytes || 0),
      backup_dir: config.backupRoot,
      file: item.media_store_file || item.file,
      media_store_file: item.media_store_file || null,
      storage: item.media_store_file ? "media_store" : "backup_snapshot",
      updated_at: new Date().toISOString(),
    };
  }
  for (const item of failed) recordMediaFailure(mediaUrlIndex, item);
  mediaUrlIndex.data.updated_at = new Date().toISOString();
  writeJson(mediaUrlIndex.path, mediaUrlIndex.data);

  return {
    ok: failed.length === 0,
    mode: "download",
    candidates: candidates.length,
    downloadable: allowed.length,
    downloaded: downloaded.length,
    reused: reused.length,
    failed: failed.length,
    retried: retried.length,
    retry_attempts: retryAttempts,
    skipped,
    skipped_by_limit: skippedByLimit,
    deferred_recent_failures: deferredRecentFailures,
    deferred_recent_failure_hosts: deferredRecentFailureHosts,
    seeded_recent_failures: seededRecentFailures,
    media_failure_cooldown_hours: config.mediaFailureCooldownHours,
    limited_new_media: limitedNewMedia,
    max_new_media: config.maxNewMedia,
    bytes: [...downloaded, ...reused].reduce((sum, item) => sum + Number(item.bytes || 0), 0),
    media_url_index: mediaUrlIndex.path,
    media_store_dir: path.join(config.backupRoot, MEDIA_STORE_DIR),
    files,
  };
}

function buildConfig({ flags, values, env }) {
  const sample = flags.has("sample");
  const maxRows = values["max-rows"]
    ? toPositiveInt(values["max-rows"], null)
    : (sample ? 5 : null);
  const maxMedia = values["max-media"]
    ? toNonNegativeInt(values["max-media"], null)
    : (sample ? 3 : null);
  const maxNewMedia = values["max-new-media"]
    ? toNonNegativeInt(values["max-new-media"], null)
    : null;

  return {
    sample,
    strict: flags.has("strict"),
    noMedia: flags.has("no-media"),
    includeExternalMedia: flags.has("include-external-media"),
    skipD1: flags.has("skip-d1"),
    skipSupabase: flags.has("skip-supabase"),
    allowAnon: flags.has("allow-anon"),
    allD1Tables: flags.has("all-tables"),
    noSupabaseFallback: flags.has("no-supabase-fallback"),
    backupRoot: path.resolve(values.out || DEFAULT_BACKUP_ROOT),
    runId: clean(values["run-id"]) || timestampForDir(),
    maxRows,
    maxMedia,
    maxNewMedia,
    d1PageSize: toPositiveInt(values["d1-page-size"], DEFAULT_D1_PAGE_SIZE, 1000),
    d1DelayMs: toNonNegativeInt(values["d1-delay-ms"], DEFAULT_D1_DELAY_MS),
    supabasePageSize: toPositiveInt(values["supabase-page-size"], DEFAULT_SUPABASE_PAGE_SIZE, 1000),
    supabaseDelayMs: toNonNegativeInt(values["supabase-delay-ms"], DEFAULT_SUPABASE_DELAY_MS),
    mediaConcurrency: toPositiveInt(values["media-concurrency"], DEFAULT_MEDIA_CONCURRENCY, 4),
    mediaDelayMs: toNonNegativeInt(values["media-delay-ms"], DEFAULT_MEDIA_DELAY_MS),
    mediaTimeoutMs: toPositiveInt(values["media-timeout-ms"], DEFAULT_MEDIA_TIMEOUT_MS, 120000),
    mediaRetries: toNonNegativeInt(values["media-retries"], DEFAULT_MEDIA_RETRIES, 3),
    mediaRetryDelayMs: toNonNegativeInt(values["media-retry-delay-ms"], DEFAULT_MEDIA_RETRY_DELAY_MS),
    mediaFailureCooldownHours: values["media-failure-cooldown-hours"]
      ? toNonNegativeInt(values["media-failure-cooldown-hours"], DEFAULT_MEDIA_FAILURE_COOLDOWN_HOURS)
      : DEFAULT_MEDIA_FAILURE_COOLDOWN_HOURS,
    mediaFailureSeedBackups: values["media-failure-seed-backups"]
      ? toNonNegativeInt(values["media-failure-seed-backups"], DEFAULT_MEDIA_FAILURE_SEED_BACKUPS)
      : DEFAULT_MEDIA_FAILURE_SEED_BACKUPS,
    maxMediaBytes: toPositiveInt(values["max-media-bytes"], DEFAULT_MAX_MEDIA_BYTES),
    minFreeGb: values["min-free-gb"] ? toNonNegativeInt(values["min-free-gb"], DEFAULT_MIN_FREE_GB) : DEFAULT_MIN_FREE_GB,
    maxDiskUsedPercent: values["max-disk-used-percent"] ? toPositiveInt(values["max-disk-used-percent"], DEFAULT_MAX_DISK_USED_PERCENT, 100) : DEFAULT_MAX_DISK_USED_PERCENT,
    noLock: flags.has("no-lock"),
    lockStaleMinutes: values["lock-stale-minutes"]
      ? toNonNegativeInt(values["lock-stale-minutes"], DEFAULT_LOCK_STALE_MINUTES)
      : DEFAULT_LOCK_STALE_MINUTES,
    retentionDays: values["retention-days"] ? toPositiveInt(values["retention-days"], null) : null,
    d1Tables: splitCsv(values["d1-tables"] || values.tables).length
      ? splitCsv(values["d1-tables"] || values.tables)
      : DEFAULT_D1_TABLES,
    supabaseTables: splitCsv(values["supabase-tables"]).length
      ? splitCsv(values["supabase-tables"])
      : DEFAULT_SUPABASE_TABLES,
    cloudflareAccountId: values["cloudflare-account-id"],
    cloudflareApiToken: values["cloudflare-api-token"],
    d1DatabaseId: values["d1-database-id"],
    d1DatabaseName: clean(values["d1-database"] || env.CLOUDFLARE_D1_PROD_DB || env.D1_DATABASE_NAME || DEFAULT_D1_DATABASE),
    supabaseUrl: values["supabase-url"],
    supabaseServiceKey: values["supabase-service-key"],
    supabaseFallbackDir: path.resolve(values["supabase-fallback-dir"] || "exports/supabase"),
  };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const env = loadEnv(flags);
  const config = buildConfig({ flags, values, env });
  const backupDir = path.join(config.backupRoot, config.runId);
  const dirs = {
    backup: backupDir,
    raw: path.join(backupDir, "raw"),
    rawD1: path.join(backupDir, "raw", "d1"),
    rawD1Tables: path.join(backupDir, "raw", "d1", "tables"),
    rawSupabase: path.join(backupDir, "raw", "supabase"),
    rawSupabaseTables: path.join(backupDir, "raw", "supabase", "tables"),
    merged: path.join(backupDir, "merged"),
    media: path.join(backupDir, "media"),
  };

  ensureDir(config.backupRoot);
  const minFreeBytes = config.minFreeGb * 1024 * 1024 * 1024;
  assertMinimumDiskFree(config.backupRoot, minFreeBytes);
  assertMaximumDiskUsed(config.backupRoot, config.maxDiskUsedPercent);
  const lock = acquireBackupLock(config);
  attachLockSignalHandlers(lock);

  try {
  for (const dir of Object.values(dirs)) ensureDir(dir);

  const startedAt = new Date().toISOString();
  const manifest = {
    ok: false,
    generated_at: startedAt,
    completed_at: null,
    platform: {
      os: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      node: process.version,
    },
    backup_dir: backupDir,
    config: {
      sample: config.sample,
      no_media: config.noMedia,
      include_external_media: config.includeExternalMedia,
      all_d1_tables: config.allD1Tables,
      supabase_fallback_dir: config.supabaseFallbackDir,
      no_supabase_fallback: config.noSupabaseFallback,
      max_rows_per_table: config.maxRows,
      max_media: config.maxMedia,
      max_new_media: config.maxNewMedia,
      d1_page_size: config.d1PageSize,
      d1_delay_ms: config.d1DelayMs,
      supabase_page_size: config.supabasePageSize,
      supabase_delay_ms: config.supabaseDelayMs,
      media_concurrency: config.mediaConcurrency,
      media_delay_ms: config.mediaDelayMs,
      media_timeout_ms: config.mediaTimeoutMs,
      media_retries: config.mediaRetries,
      media_retry_delay_ms: config.mediaRetryDelayMs,
      media_failure_cooldown_hours: config.mediaFailureCooldownHours,
      media_failure_seed_backups: config.mediaFailureSeedBackups,
      min_free_gb: config.minFreeGb,
      lock_enabled: !config.noLock,
      lock_stale_minutes: config.lockStaleMinutes,
      retention_days: config.retentionDays,
    },
    sources: {},
    merge: null,
    media: null,
    pruned_backups: [],
    warnings: [],
    notes: [
      "This backup tool is read-only against remote services.",
      "Raw D1 and Supabase exports are stored separately before merged article output is written.",
      "Media downloads use public/object URLs and intentionally avoid the Next.js application server by default.",
    ],
  };

  const d1 = await exportD1({ env, config, dirs });
  manifest.sources.d1 = d1.result;
  writeJson(path.join(dirs.rawD1, "export-manifest.json"), d1.result);

  const supabase = await exportSupabase({ env, config, dirs });
  manifest.sources.supabase = supabase.result;
  writeJson(path.join(dirs.rawSupabase, "export-manifest.json"), supabase.result);

  const merged = mergeArticles({
    d1Articles: Array.isArray(d1.tables.articles) ? d1.tables.articles : [],
    supabaseArticles: Array.isArray(supabase.tables.articles) ? supabase.tables.articles : [],
  });
  writeJson(path.join(dirs.merged, "articles.json"), merged.articles);
  writeNdjson(path.join(dirs.merged, "articles.ndjson"), merged.articles);
  writeJson(path.join(dirs.merged, "merge-report.json"), merged.report);
  manifest.merge = merged.report;

  const candidates = buildMediaCandidates({
    d1Tables: d1.tables,
    supabaseTables: supabase.tables,
    mergedArticles: merged.articles,
    env,
    config,
  });
  writeJson(path.join(dirs.merged, "media-candidates.json"), candidates);

  const media = await downloadMedia({ candidates, dirs, config });
  writeJson(path.join(dirs.media, "media-manifest.json"), media);
  manifest.media = {
    ok: media.ok,
    mode: media.mode,
    candidates: media.candidates,
    downloadable: media.downloadable,
    downloaded: media.downloaded,
    reused: media.reused,
    failed: media.failed,
    retried: media.retried || 0,
    retry_attempts: media.retry_attempts || 0,
    skipped: media.skipped,
    skipped_by_limit: media.skipped_by_limit,
    deferred_recent_failures: media.deferred_recent_failures || 0,
    deferred_recent_failure_hosts: media.deferred_recent_failure_hosts || {},
    seeded_recent_failures: media.seeded_recent_failures || 0,
    media_failure_cooldown_hours: media.media_failure_cooldown_hours || config.mediaFailureCooldownHours,
    limited_new_media: media.limited_new_media || 0,
    max_new_media: media.max_new_media ?? null,
    bytes: media.bytes,
    media_url_index: media.media_url_index || null,
    media_store_dir: media.media_store_dir || null,
    manifest_file: path.join(dirs.media, "media-manifest.json"),
  };

  if (config.retentionDays) manifest.warnings.push("Inline --retention-days pruning is disabled. Use backup:retention:plan with two verified encrypted restore reports.");

  const sourceOk = (config.skipD1 || d1.result.ok) && (config.skipSupabase || supabase.result.ok);
  const hasArticles = merged.articles.length > 0;
  manifest.ok = sourceOk && hasArticles && (config.noMedia || media.failed === 0 || media.downloaded > 0 || media.downloadable === 0);
  if (!d1.result.ok) manifest.warnings.push("D1 export did not complete. See sources.d1.errors.");
  if (!supabase.result.ok) manifest.warnings.push("Supabase export did not complete. See sources.supabase.errors.");
  if (supabase.result.fallback_used) manifest.warnings.push("Supabase live export failed; local fallback snapshot was used.");
  if (!hasArticles) manifest.warnings.push("No articles were exported from either database.");
  if (media.failed > 0) manifest.warnings.push(`${media.failed} media downloads failed. See media/media-manifest.json.`);
  if (config.strict && !sourceOk) manifest.ok = false;
  manifest.completed_at = new Date().toISOString();

  writeJson(path.join(backupDir, "backup-manifest.json"), manifest);

  console.log(JSON.stringify({
    ok: manifest.ok,
    backupDir,
    d1: {
      ok: d1.result.ok,
      tables: d1.result.tables.length,
      rows: d1.result.tables.reduce((sum, table) => sum + table.rows, 0),
      errors: d1.result.errors,
    },
    supabase: {
      ok: supabase.result.ok,
      tables: supabase.result.tables.length,
      rows: supabase.result.tables.reduce((sum, table) => sum + table.rows, 0),
      errors: supabase.result.errors,
    },
    mergedArticles: merged.articles.length,
    duplicateArticles: merged.report.duplicates.length,
    media: manifest.media,
    warnings: manifest.warnings,
  }, null, 2));

  if (!manifest.ok) process.exitCode = 1;
  } finally {
    releaseBackupLock(lock);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
