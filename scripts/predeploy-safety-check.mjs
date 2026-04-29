#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const allowDirty = args.has("--allow-dirty");
const allowRemoteAhead = args.has("--allow-remote-ahead");
const noFetch = args.has("--no-fetch");
const json = args.has("--json");
const liveUrl = getArgValue("--live-url") || process.env.LIVE_URL || "https://culturepeople.co.kr";

const fileEnv = loadEnvFiles([".env.local", ".env.production.local", ".env.vercel.local"]);
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    values[key] = value;
  }
  return values;
}

function loadEnvFiles(files) {
  return files.reduce((acc, file) => ({ ...acc, ...parseEnvFile(file) }), {});
}

function git(args, options = {}) {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

function countLines(text) {
  return text ? text.split(/\r?\n/).filter(Boolean).length : 0;
}

function splitLines(text) {
  return text ? text.split(/\r?\n/).filter(Boolean) : [];
}

function shouldScanFile(file) {
  if (!file) return false;
  if (file.startsWith(".next/") || file.startsWith("node_modules/") || file.startsWith(".git/")) return false;
  if (/^\.env($|\.)/.test(file) && !file.endsWith(".example")) return false;
  return /\.(ts|tsx|js|mjs|json|md|yml|yaml|example)$/i.test(file);
}

function scanForTelegramTokenLeaks(files) {
  const tokenPattern = /\b\d{8,12}:AA[A-Za-z0-9_-]{20,}\b/g;
  const leaks = [];
  for (const file of files.filter(shouldScanFile)) {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;
    const text = fs.readFileSync(fullPath, "utf8");
    const matches = text.match(tokenPattern) || [];
    for (const candidate of matches) {
      const lowered = candidate.toLowerCase();
      if (lowered.includes("fake") || lowered.includes("example") || lowered.includes("replace")) continue;
      leaks.push(file);
      break;
    }
  }
  return [...new Set(leaks)];
}

function classifySupabaseError(status, body) {
  const normalized = String(body || "").toLowerCase();
  if (status === 402 && normalized.includes("exceed_storage_size_quota")) {
    return {
      errorCode: "quota_exceeded",
      message: "Supabase project is restricted because storage size quota was exceeded.",
    };
  }
  return {
    errorCode: "request_failed",
    message: `Supabase request failed with HTTP ${status}.`,
  };
}

async function getSupabaseStatus() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const status = {
    configured: Boolean(url && key),
    ok: false,
    status: null,
    articleCount: null,
    siteSettingsReachable: false,
    errorCode: "",
    message: "",
  };
  if (!url || !key) {
    status.errorCode = "not_configured";
    status.message = "Supabase URL or API key is not configured.";
    return status;
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "count=exact",
  };

  try {
    const articles = await fetch(`${url}/rest/v1/articles?select=id&limit=1`, { headers });
    status.status = articles.status;
    if (!articles.ok) {
      const body = await articles.text().catch(() => "");
      Object.assign(status, classifySupabaseError(articles.status, body));
      return status;
    }

    const range = articles.headers.get("content-range") || "";
    if (range.includes("/")) {
      const total = Number(range.split("/").pop());
      status.articleCount = Number.isFinite(total) ? total : null;
    }

    const settings = await fetch(`${url}/rest/v1/site_settings?select=key&limit=1`, { headers });
    status.siteSettingsReachable = settings.ok;
    status.status = settings.ok ? 200 : settings.status;
    status.ok = settings.ok;
    if (!settings.ok) {
      const body = await settings.text().catch(() => "");
      Object.assign(status, classifySupabaseError(settings.status, body));
    }
    return status;
  } catch (error) {
    status.errorCode = "request_failed";
    status.message = error instanceof Error ? error.message : String(error);
    return status;
  }
}

function getMediaStorageStatus() {
  const provider = (process.env.MEDIA_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER || "supabase").toLowerCase() === "r2"
    ? "r2"
    : "supabase";
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const r2 = {
    accountId: Boolean(process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID),
    accessKeyId: Boolean(process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID),
    secretAccessKey: Boolean(process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY),
    bucket: Boolean(process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_PROD_BUCKET),
    publicBaseUrl: Boolean(publicBaseUrl),
  };
  const supabase = {
    url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceKey: Boolean(process.env.SUPABASE_SERVICE_KEY),
  };
  const configured = provider === "r2"
    ? Object.values(r2).every(Boolean)
    : Object.values(supabase).every(Boolean);

  return {
    provider,
    configured,
    publicBaseUrl,
    r2,
    supabase,
  };
}

function getDatabaseProviderStatus() {
  const provider = (process.env.DATABASE_PROVIDER || process.env.DB_PROVIDER || "supabase").toLowerCase() === "d1"
    ? "d1"
    : "supabase";
  const supabase = {
    url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceKey: Boolean(process.env.SUPABASE_SERVICE_KEY),
  };
  const d1 = {
    binding: process.env.D1_DATABASE_BINDING || "DB",
    accountId: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
    databaseId: Boolean(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID),
    databaseName: Boolean(process.env.CLOUDFLARE_D1_PROD_DB || process.env.D1_DATABASE_NAME),
    apiToken: Boolean(process.env.CLOUDFLARE_API_TOKEN),
    httpApiReady: Boolean(
      process.env.CLOUDFLARE_ACCOUNT_ID
      && (process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID)
      && process.env.CLOUDFLARE_API_TOKEN
    ),
    adapterReady: process.env.D1_RUNTIME_ADAPTER_READY === "true",
    readAdapterEnabled: process.env.D1_READ_ADAPTER_ENABLED === "true",
    readAdapterReady: false,
    settingsDualWriteEnabled: process.env.D1_SETTINGS_DUAL_WRITE_ENABLED === "true",
    settingsDualWriteReady: false,
    settingsDualWriteStrict: process.env.D1_SETTINGS_DUAL_WRITE_STRICT === "true",
    articlesDualWriteEnabled: process.env.D1_ARTICLES_DUAL_WRITE_ENABLED === "true",
    articlesDualWriteReady: false,
    articlesDualWriteStrict: process.env.D1_ARTICLES_DUAL_WRITE_STRICT === "true",
    commentsReadAdapterEnabled: process.env.D1_COMMENTS_READ_ADAPTER_ENABLED === "true",
    commentsReadAdapterReady: false,
    commentsDualWriteEnabled: process.env.D1_COMMENTS_DUAL_WRITE_ENABLED === "true",
    commentsDualWriteReady: false,
    commentsDualWriteStrict: process.env.D1_COMMENTS_DUAL_WRITE_STRICT === "true",
    logsReadAdapterEnabled: process.env.D1_LOGS_READ_ADAPTER_ENABLED === "true",
    logsReadAdapterReady: false,
    logsDualWriteEnabled: process.env.D1_LOGS_DUAL_WRITE_ENABLED === "true",
    logsDualWriteReady: false,
    logsDualWriteStrict: process.env.D1_LOGS_DUAL_WRITE_STRICT === "true",
    notificationsReadAdapterEnabled: process.env.D1_NOTIFICATIONS_READ_ADAPTER_ENABLED === "true",
    notificationsReadAdapterReady: false,
    notificationsDualWriteEnabled: process.env.D1_NOTIFICATIONS_DUAL_WRITE_ENABLED === "true",
    notificationsDualWriteReady: false,
    notificationsDualWriteStrict: process.env.D1_NOTIFICATIONS_DUAL_WRITE_STRICT === "true",
  };
  d1.readAdapterReady = d1.readAdapterEnabled && d1.httpApiReady;
  d1.settingsDualWriteReady = d1.settingsDualWriteEnabled && d1.httpApiReady;
  d1.articlesDualWriteReady = d1.articlesDualWriteEnabled && d1.httpApiReady;
  d1.commentsReadAdapterReady = d1.commentsReadAdapterEnabled && d1.httpApiReady;
  d1.commentsDualWriteReady = d1.commentsDualWriteEnabled && d1.httpApiReady;
  d1.logsReadAdapterReady = d1.logsReadAdapterEnabled && d1.httpApiReady;
  d1.logsDualWriteReady = d1.logsDualWriteEnabled && d1.httpApiReady;
  d1.notificationsReadAdapterReady = d1.notificationsReadAdapterEnabled && d1.httpApiReady;
  d1.notificationsDualWriteReady = d1.notificationsDualWriteEnabled && d1.httpApiReady;
  const configured = provider === "d1"
    ? (d1.databaseId || d1.databaseName) && Boolean(d1.binding)
    : supabase.url && (supabase.anonKey || supabase.serviceKey);
  const runtimeReady = provider === "d1" ? configured && d1.adapterReady : configured;

  return {
    provider,
    configured,
    runtimeReady,
    supabase,
    d1,
  };
}

async function getLiveStatus(path) {
  const url = new URL(path, liveUrl);
  try {
    const response = await fetch(url, { redirect: "manual" });
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "";
    }

    return {
      path,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      cacheControl: response.headers.get("cache-control") || "",
      bodyPreview: body.replace(/\s+/g, " ").slice(0, 180),
    };
  } catch (error) {
    return {
      path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const result = {
  ok: true,
  branch: "",
  head: "",
  originMain: "",
  localAhead: 0,
  remoteAhead: 0,
  dirtyTrackedFiles: 0,
  untrackedFiles: 0,
  liveUrl,
  live: [],
  telegram: {
    enabled: process.env.TELEGRAM_ENABLED === "true",
    hasToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    chatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || "")
      .split(/[,\s]+/)
      .filter(Boolean).length,
    hasWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    hasWebhookHeaderSecret: Boolean(process.env.TELEGRAM_WEBHOOK_HEADER_SECRET),
    tempLoginEnabled: process.env.TELEGRAM_ALLOW_TEMP_LOGIN === "true",
    tokenLeakFiles: [],
  },
  supabase: {
    configured: false,
    ok: false,
    status: null,
    articleCount: null,
    siteSettingsReachable: false,
    errorCode: "",
    message: "",
  },
  databaseProvider: {
    provider: "supabase",
    configured: false,
    runtimeReady: false,
    supabase: {},
    d1: {},
  },
  mediaStorage: {
    provider: "supabase",
    configured: false,
    publicBaseUrl: "",
    r2: {},
    supabase: {},
  },
  warnings: [],
  errors: [],
};

try {
  if (!noFetch) {
    git(["fetch", "--all", "--prune"], { stdio: ["ignore", "ignore", "pipe"] });
  }

  result.branch = git(["branch", "--show-current"]);
  result.head = git(["rev-parse", "HEAD"]);
  result.originMain = git(["rev-parse", "origin/main"]);

  const [localAhead, remoteAhead] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"])
    .split(/\s+/)
    .map((value) => Number(value));
  result.localAhead = localAhead || 0;
  result.remoteAhead = remoteAhead || 0;

  const status = git(["status", "--porcelain"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  const tracked = git(["ls-files"]);
  const statusLines = splitLines(status);
  result.untrackedFiles = statusLines.filter((line) => line.startsWith("??")).length;
  result.dirtyTrackedFiles = statusLines.filter((line) => line && !line.startsWith("??")).length;
  result.telegram.tokenLeakFiles = scanForTelegramTokenLeaks([
    ...splitLines(tracked),
    ...splitLines(untracked),
  ]);

  if (result.remoteAhead > 0 && !allowRemoteAhead) {
    result.ok = false;
    result.errors.push(
      `origin/main is ahead by ${result.remoteAhead} commit(s). Pull/rebase before deploying to avoid rollback.`
    );
  }

  if ((result.dirtyTrackedFiles > 0 || result.untrackedFiles > 0) && !allowDirty) {
    result.ok = false;
    result.errors.push(
      `Working tree is dirty (${result.dirtyTrackedFiles} tracked, ${result.untrackedFiles} untracked). Commit or stash before deployment.`
    );
  }

  if (result.localAhead > 0) {
    result.warnings.push(`Local HEAD is ahead of origin/main by ${result.localAhead} commit(s).`);
  }

  if (result.telegram.tokenLeakFiles.length > 0) {
    result.ok = false;
    result.errors.push(
      `Possible Telegram bot token found in source files: ${result.telegram.tokenLeakFiles.join(", ")}`
    );
  }

  if (result.telegram.enabled) {
    if (!result.telegram.hasToken) {
      result.ok = false;
      result.errors.push("TELEGRAM_ENABLED=true but TELEGRAM_BOT_TOKEN is missing.");
    }
    if (result.telegram.chatIds === 0) {
      result.ok = false;
      result.errors.push("TELEGRAM_ENABLED=true but TELEGRAM_ALLOWED_CHAT_IDS is empty.");
    }
    if (!result.telegram.hasWebhookSecret) {
      result.warnings.push("TELEGRAM_ENABLED=true but TELEGRAM_WEBHOOK_SECRET is missing; Telegram commands/webhook cannot be used.");
    }
    if (!result.telegram.hasWebhookHeaderSecret) {
      result.warnings.push("TELEGRAM_WEBHOOK_HEADER_SECRET is missing; webhook still works but has weaker request verification.");
    }
  }

  if (result.telegram.tempLoginEnabled && !result.telegram.enabled) {
    result.ok = false;
    result.errors.push("TELEGRAM_ALLOW_TEMP_LOGIN=true requires TELEGRAM_ENABLED=true.");
  }

  result.mediaStorage = getMediaStorageStatus();
  if (!result.mediaStorage.configured) {
    result.ok = false;
    if (result.mediaStorage.provider === "r2") {
      result.errors.push(
        "MEDIA_STORAGE_PROVIDER=r2 but one or more R2 settings are missing: account ID, access key ID, secret access key, bucket, or public base URL."
      );
    } else {
      result.errors.push("MEDIA_STORAGE_PROVIDER=supabase but NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY is missing.");
    }
  }

  result.databaseProvider = getDatabaseProviderStatus();
  if (!result.databaseProvider.configured) {
    result.ok = false;
    result.errors.push(`DATABASE_PROVIDER=${result.databaseProvider.provider} but required database settings are missing.`);
  }
  if (!result.databaseProvider.runtimeReady) {
    result.ok = false;
    result.errors.push(`DATABASE_PROVIDER=${result.databaseProvider.provider} is not runtime-ready.`);
  }
  if (result.databaseProvider.d1?.readAdapterEnabled && !result.databaseProvider.d1?.readAdapterReady) {
    result.ok = false;
    result.errors.push("D1_READ_ADAPTER_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.settingsDualWriteEnabled && !result.databaseProvider.d1?.settingsDualWriteReady) {
    result.ok = false;
    result.errors.push("D1_SETTINGS_DUAL_WRITE_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.articlesDualWriteEnabled && !result.databaseProvider.d1?.articlesDualWriteReady) {
    result.ok = false;
    result.errors.push("D1_ARTICLES_DUAL_WRITE_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.commentsReadAdapterEnabled && !result.databaseProvider.d1?.commentsReadAdapterReady) {
    result.ok = false;
    result.errors.push("D1_COMMENTS_READ_ADAPTER_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.commentsDualWriteEnabled && !result.databaseProvider.d1?.commentsDualWriteReady) {
    result.ok = false;
    result.errors.push("D1_COMMENTS_DUAL_WRITE_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.logsReadAdapterEnabled && !result.databaseProvider.d1?.logsReadAdapterReady) {
    result.ok = false;
    result.errors.push("D1_LOGS_READ_ADAPTER_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.logsDualWriteEnabled && !result.databaseProvider.d1?.logsDualWriteReady) {
    result.ok = false;
    result.errors.push("D1_LOGS_DUAL_WRITE_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.notificationsReadAdapterEnabled && !result.databaseProvider.d1?.notificationsReadAdapterReady) {
    result.ok = false;
    result.errors.push("D1_NOTIFICATIONS_READ_ADAPTER_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.notificationsDualWriteEnabled && !result.databaseProvider.d1?.notificationsDualWriteReady) {
    result.ok = false;
    result.errors.push("D1_NOTIFICATIONS_DUAL_WRITE_ENABLED=true but Cloudflare account ID, D1 database ID, or API token is missing.");
  }
  if (result.databaseProvider.d1?.readAdapterReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 read canary is enabled while DATABASE_PROVIDER=supabase; verify /api/cron/d1-read-compare is green and D1 is synced before deploy.");
  }
  if (result.databaseProvider.d1?.settingsDualWriteReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 settings dual-write is enabled while DATABASE_PROVIDER=supabase; keep /api/cron/d1-read-compare monitored until cutover.");
  }
  if (result.databaseProvider.d1?.articlesDualWriteReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 article dual-write is enabled while DATABASE_PROVIDER=supabase; verify D1 import is fresh and monitor article create/update/delete and view-count flows.");
  }
  if (result.databaseProvider.d1?.commentsReadAdapterReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 comments read canary is enabled while DATABASE_PROVIDER=supabase; verify comments import and moderation flows before deploy.");
  }
  if (result.databaseProvider.d1?.commentsDualWriteReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 comments dual-write is enabled while DATABASE_PROVIDER=supabase; monitor comment create/moderation/delete flows until cutover.");
  }
  if (result.databaseProvider.d1?.logsReadAdapterReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 logs read canary is enabled while DATABASE_PROVIDER=supabase; verify view/distribute log import before deploy.");
  }
  if (result.databaseProvider.d1?.logsDualWriteReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 logs dual-write is enabled while DATABASE_PROVIDER=supabase; monitor visitor and distribution report drift until cutover.");
  }
  if (result.databaseProvider.d1?.notificationsReadAdapterReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 notifications read canary is enabled while DATABASE_PROVIDER=supabase; verify admin notification list/count before deploy.");
  }
  if (result.databaseProvider.d1?.notificationsDualWriteReady && result.databaseProvider.provider === "supabase") {
    result.warnings.push("D1 notifications dual-write is enabled while DATABASE_PROVIDER=supabase; monitor admin notification create/read/delete flows until cutover.");
  }

  if (result.databaseProvider.provider === "supabase") {
    result.supabase = await getSupabaseStatus();
    if (!result.supabase.configured) {
      result.ok = false;
      result.errors.push(result.supabase.message);
    } else if (!result.supabase.ok) {
      result.ok = false;
      result.errors.push(result.supabase.message || "Supabase health check failed.");
    }
  } else {
    result.supabase.message = "Skipped because DATABASE_PROVIDER=d1.";
  }

  result.live = await Promise.all([
    getLiveStatus("/api/health"),
    getLiveStatus("/api/coupang/products?keyword=%EB%B2%A0%EC%8A%A4%ED%8A%B8%EC%85%80%EB%9F%AC&limit=4"),
  ]);
} catch (error) {
  result.ok = false;
  result.errors.push(error instanceof Error ? error.message : String(error));
}

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Predeploy safety check");
  console.log(`- branch: ${result.branch || "(unknown)"}`);
  console.log(`- HEAD: ${result.head || "(unknown)"}`);
  console.log(`- origin/main: ${result.originMain || "(unknown)"}`);
  console.log(`- divergence: local ahead ${result.localAhead}, remote ahead ${result.remoteAhead}`);
  console.log(`- working tree: ${result.dirtyTrackedFiles} tracked dirty, ${result.untrackedFiles} untracked`);
  console.log(`- live URL: ${result.liveUrl}`);
  console.log(
    `- telegram: enabled=${result.telegram.enabled}, token=${result.telegram.hasToken ? "set" : "missing"}, chats=${result.telegram.chatIds}, webhookSecret=${result.telegram.hasWebhookSecret ? "set" : "missing"}`
  );
  console.log(
    `- media storage: provider=${result.mediaStorage.provider}, configured=${result.mediaStorage.configured}`
  );
  console.log(
    `- database provider: provider=${result.databaseProvider.provider}, configured=${result.databaseProvider.configured}, runtimeReady=${result.databaseProvider.runtimeReady}, d1ReadReady=${Boolean(result.databaseProvider.d1?.readAdapterReady)}, d1SettingsDualWriteReady=${Boolean(result.databaseProvider.d1?.settingsDualWriteReady)}, d1ArticlesDualWriteReady=${Boolean(result.databaseProvider.d1?.articlesDualWriteReady)}, d1CommentsReadReady=${Boolean(result.databaseProvider.d1?.commentsReadAdapterReady)}, d1CommentsDualWriteReady=${Boolean(result.databaseProvider.d1?.commentsDualWriteReady)}, d1LogsReadReady=${Boolean(result.databaseProvider.d1?.logsReadAdapterReady)}, d1LogsDualWriteReady=${Boolean(result.databaseProvider.d1?.logsDualWriteReady)}, d1NotificationsReadReady=${Boolean(result.databaseProvider.d1?.notificationsReadAdapterReady)}, d1NotificationsDualWriteReady=${Boolean(result.databaseProvider.d1?.notificationsDualWriteReady)}`
  );
  console.log(
    `- supabase: configured=${result.supabase.configured}, ok=${result.supabase.ok}, status=${result.supabase.status ?? "n/a"}, articles=${result.supabase.articleCount ?? "n/a"}, settings=${result.supabase.siteSettingsReachable ? "ok" : "failed"}`
  );
  for (const item of result.live) {
    if (item.error) {
      console.log(`- live ${item.path}: ERROR ${item.error}`);
    } else {
      console.log(`- live ${item.path}: ${item.status} ${item.contentType}`);
    }
  }
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
  for (const error of result.errors) console.error(`ERROR: ${error}`);
}

process.exitCode = result.ok ? 0 : 1;
