#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://culturepeople.co.kr";
const DEFAULT_REPORT_DIR = "docs/reports";
const PROD_D1_ID = "9e69e770-f2e2-414f-bccc-f3f673e5988e";

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

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function loadEnv() {
  return {
    ...readEnvFile(".env.local"),
    ...readEnvFile(".env.production.local"),
    ...readEnvFile(".env.vercel.local"),
    ...process.env,
  };
}

function sha12(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function jsonSummary(body, contentType) {
  let json = null;
  if (String(contentType || "").includes("json")) {
    try {
      json = JSON.parse(body);
    } catch {
      json = null;
    }
  }
  if (!json || typeof json !== "object") {
    return { preview: String(body || "").slice(0, 160).replace(/\s+/g, " ") };
  }

  const summary = {};
  for (const key of ["success", "ok", "status", "authed", "count", "total", "provider", "skipped", "error"]) {
    if (key in json) summary[key] = json[key];
  }
  if (json.databaseProvider?.provider) summary.databaseProvider = json.databaseProvider.provider;
  if (json.databaseProvider?.runtimeReady !== undefined) summary.databaseRuntimeReady = json.databaseProvider.runtimeReady;
  if (json.mediaStorage?.provider) summary.mediaProvider = json.mediaStorage.provider;
  if (Array.isArray(json.articles)) summary.articles = json.articles.length;
  if (Array.isArray(json.items)) summary.items = json.items.length;
  if (Array.isArray(json.comments)) summary.comments = json.comments.length;
  if (Array.isArray(json.notifications)) summary.notifications = json.notifications.length;
  if (Array.isArray(json.logs)) summary.logs = json.logs.length;
  if (Array.isArray(json.subscribers)) summary.subscribers = json.subscribers.length;
  if (Array.isArray(json.mails)) summary.mails = json.mails.length;
  if (json.settings && typeof json.settings === "object") {
    summary.settings = {
      enabled: json.settings.enabled,
      publishStatus: json.settings.publishStatus,
      count: json.settings.count,
      enabledSources: Array.isArray(json.settings.sources)
        ? json.settings.sources.filter((source) => source.enabled).length
        : undefined,
    };
  }
  if (json.run && typeof json.run === "object") {
    summary.run = {
      status: json.run.status,
      articlesPublished: json.run.articlesPublished,
      articlesSkipped: json.run.articlesSkipped,
      articlesFailed: json.run.articlesFailed,
      articleCount: Array.isArray(json.run.articles) ? json.run.articles.length : undefined,
    };
  }
  if (json.report?.riskLevel) summary.riskLevel = json.report.riskLevel;
  if (json.report?.provider) summary.mediaProvider = json.report.provider;
  if (json.report?.ok !== undefined) summary.reportOk = json.report.ok;
  if (Array.isArray(json.report?.errors)) summary.reportErrors = json.report.errors.length;
  if (Array.isArray(json.report?.warnings)) summary.reportWarnings = json.report.warnings.length;
  if (json.health?.ok !== undefined) summary.healthOk = json.health.ok;
  return summary;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function login(baseUrl, env) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    return { ok: false, status: null, cookie: "", usernameHash: null, error: "ADMIN_USERNAME/ADMIN_PASSWORD missing" };
  }
  const response = await fetchWithTimeout(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),
  });
  const body = await response.text();
  let json = {};
  try {
    json = JSON.parse(body);
  } catch {
    json = {};
  }
  return {
    ok: response.ok && json.success === true,
    status: response.status,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    usernameHash: sha12(env.ADMIN_USERNAME),
    error: json.error,
  };
}

async function runEndpoint(baseUrl, test, cookie, env) {
  const headers = {
    accept: "application/json,text/html,application/xml,*/*",
    ...(test.auth === "cookie" && cookie ? { cookie } : {}),
    ...(test.auth === "cron" && env.CRON_SECRET ? { authorization: `Bearer ${env.CRON_SECRET}` } : {}),
    ...(test.body ? { "content-type": "application/json" } : {}),
  };
  const result = {
    name: test.name,
    path: test.path,
    method: test.method || "GET",
    required: test.required !== false,
    ok: false,
    status: null,
    bytes: 0,
    contentType: "",
    summary: null,
    errors: [],
  };

  if (test.auth === "cookie" && !cookie) {
    result.errors.push("auth cookie unavailable");
    return result;
  }
  if (test.auth === "cron" && !env.CRON_SECRET) {
    result.required = false;
    result.errors.push("CRON_SECRET unavailable");
    return result;
  }

  try {
    const response = await fetchWithTimeout(`${baseUrl}${test.path}`, {
      method: test.method || "GET",
      headers,
      body: test.body ? JSON.stringify(test.body) : undefined,
    }, test.timeoutMs || 20000);
    const body = await response.text();
    result.status = response.status;
    result.bytes = Buffer.byteLength(body);
    result.contentType = response.headers.get("content-type") || "";
    result.summary = jsonSummary(body, result.contentType);
    const expected = test.expectedStatus || 200;
    result.ok = response.status === expected;
    if (!result.ok) {
      result.errors.push(`expected HTTP ${expected}, got ${response.status}`);
    }
    if (typeof test.validate === "function") {
      const validationErrors = test.validate(result.summary || {});
      if (validationErrors.length > 0) {
        result.ok = false;
        result.errors.push(...validationErrors);
      }
    }
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}

function sourceFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(filePath));
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(filePath);
  }
  return files;
}

function scanSupabaseCoupling() {
  const allowed = new Set([
    "src/lib/supabase-server-db.ts",
    "src/lib/site-settings-store.ts",
    "src/lib/supabase-health.ts",
    "src/lib/media-storage.ts",
    "src/lib/watermark.ts",
    "src/lib/database-provider.ts",
    "src/lib/d1-read-compare.ts",
    "src/lib/db-server.ts",
    "src/app/api/cron/backup/route.ts",
  ]);
  const hits = [];
  for (const file of sourceFiles("src")) {
    const normalized = file.replace(/\\/g, "/");
    if (allowed.has(normalized)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (
      text.includes("@/lib/supabase-server-db") ||
      text.includes("@supabase/supabase-js") ||
      /\bsb(Get|Save|Create|Update|Delete|Purge|Increment)/.test(text)
    ) {
      hits.push(normalized);
    }
  }
  return hits;
}

async function cloudflareRequest(env, endpoint, body) {
  const response = await fetchWithTimeout(`https://api.cloudflare.com/client/v4${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }, 20000);
  const json = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok && json.success !== false, json };
}

async function getD1Counts(env) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    return { ok: false, skipped: true, error: "Cloudflare env missing" };
  }
  const databaseId = env.CLOUDFLARE_D1_DATABASE_ID || env.D1_DATABASE_ID || PROD_D1_ID;
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM articles) AS articles,
      (SELECT COUNT(*) FROM site_settings) AS site_settings,
      (SELECT COUNT(*) FROM comments) AS comments,
      (SELECT COUNT(*) FROM notifications) AS notifications,
      (SELECT COUNT(*) FROM view_logs) AS view_logs,
      (SELECT COUNT(*) FROM distribute_logs) AS distribute_logs
  `;
  const result = await cloudflareRequest(
    env,
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${databaseId}/query`,
    { sql },
  );
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.json?.errors?.[0]?.message || "D1 query failed" };
  }
  const rows = result.json?.result?.[0]?.results || [];
  const first = rows[0] || {};
  return {
    ok: true,
    databaseIdHash: sha12(databaseId),
    counts: Object.fromEntries(Object.entries(first).map(([key, value]) => [key, Number(value || 0)])),
  };
}

function buildTests(includeCronPreview) {
  const tests = [
    { name: "health", path: "/api/health", validate: (s) => [
      s.databaseProvider === "d1" ? "" : `database provider is ${s.databaseProvider}`,
      s.databaseRuntimeReady === true ? "" : "database runtime is not ready",
    ].filter(Boolean) },
    { name: "auth-me", path: "/api/auth/me", auth: "cookie", validate: (s) => s.authed ? [] : ["not authed"] },
    { name: "articles", path: "/api/db/articles?page=1&limit=5", auth: "cookie" },
    { name: "articles-sidebar", path: "/api/db/articles/sidebar", auth: "cookie" },
    { name: "comments", path: "/api/db/comments", auth: "cookie" },
    { name: "notifications", path: "/api/db/notifications", auth: "cookie" },
    { name: "notifications-unread", path: "/api/db/notifications?unread=1", auth: "cookie" },
    { name: "access-logs", path: "/api/db/access-logs", auth: "cookie" },
    { name: "activity-logs", path: "/api/db/activity-logs", auth: "cookie" },
    { name: "view-logs", path: "/api/db/view-logs", auth: "cookie" },
    { name: "distribute-logs", path: "/api/db/distribute-logs", auth: "cookie" },
    { name: "api-keys", path: "/api/db/api-keys", auth: "cookie" },
    { name: "settings-admin", path: "/api/db/settings?key=cp-admin-accounts", auth: "cookie" },
    { name: "settings-site", path: "/api/db/settings?key=cp-site-settings" },
    {
      name: "auto-press-settings",
      path: "/api/db/auto-press-settings",
      auth: "cookie",
      validate: (s) => s.settings?.enabled === true ? [] : ["auto-press must be enabled"],
    },
    { name: "auto-press-history", path: "/api/db/auto-press-settings?history=1", auth: "cookie" },
    {
      name: "auto-news-settings",
      path: "/api/db/auto-news-settings",
      auth: "cookie",
      validate: (s) => s.settings?.enabled === false ? [] : ["auto-news must be disabled"],
    },
    { name: "auto-news-history", path: "/api/db/auto-news-settings?history=1", auth: "cookie" },
    { name: "newsletter", path: "/api/db/newsletter", auth: "cookie" },
    { name: "mail-list", path: "/api/mail/list?account=all", auth: "cookie" },
    { name: "telegram-audit", path: "/api/telegram/audit", auth: "cookie" },
    { name: "press-feed-newswire", path: "/api/press-feed?tab=newswire&page=1", auth: "cookie", timeoutMs: 30000 },
    { name: "rss", path: "/api/rss" },
    { name: "feed", path: "/feed.json" },
    { name: "cron-d1-health", path: "/api/cron/d1-health", auth: "cookie" },
    { name: "cron-cloudflare-usage", path: "/api/cron/cloudflare-usage-report", auth: "cookie", timeoutMs: 30000 },
    { name: "cron-media-storage-health", path: "/api/cron/media-storage-health", auth: "cookie", timeoutMs: 30000 },
    { name: "cron-backup-d1-guard", path: "/api/cron/backup", auth: "cookie" },
  ];
  if (includeCronPreview) {
    tests.push(
      {
        name: "auto-news-cron-disabled",
        path: "/api/cron/auto-news?preview=true&source=cron&count=1",
        auth: "cron",
        timeoutMs: 30000,
      },
      {
        name: "auto-press-preview",
        path: "/api/cron/auto-press",
        auth: "cookie",
        method: "POST",
        body: { preview: true, count: 1, noAiEdit: true, source: "manual" },
        timeoutMs: 45000,
      },
    );
  }
  return tests;
}

function markdown(report) {
  const lines = [
    "# D1 Feature Audit",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Base URL: ${report.baseUrl}`,
    `- Overall: ${report.ok ? "PASS" : "FAIL"}`,
    `- Login: ${report.login.ok ? "PASS" : `FAIL (${report.login.status || "n/a"})`}`,
    "",
    "## Endpoint Results",
    "",
    "| Name | Status | OK | Summary |",
    "| --- | ---: | --- | --- |",
  ];
  for (const result of report.endpoints) {
    lines.push(`| ${result.name} | ${result.status ?? ""} | ${result.ok ? "PASS" : "FAIL"} | ${JSON.stringify(result.summary || {}).replace(/\|/g, "\\|")} |`);
  }
  lines.push("", "## D1 Counts", "", "```json", JSON.stringify(report.d1, null, 2), "```");
  lines.push("", "## Source Scan", "", "```json", JSON.stringify(report.sourceScan, null, 2), "```");
  if (report.failures.length > 0) {
    lines.push("", "## Failures", "", "```json", JSON.stringify(report.failures, null, 2), "```");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const baseUrl = String(values["base-url"] || process.env.AUDIT_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const includeCronPreview = flags.has("include-cron-preview");
  const write = flags.has("write");
  const reportDir = values["report-dir"] || DEFAULT_REPORT_DIR;

  const loginResult = await login(baseUrl, env);
  const endpoints = [];
  for (const test of buildTests(includeCronPreview)) {
    endpoints.push(await runEndpoint(baseUrl, test, loginResult.cookie, env));
  }

  const d1 = await getD1Counts(env);
  const activeSupabaseCoupling = scanSupabaseCoupling();
  const sourceScan = {
    ok: activeSupabaseCoupling.length === 0,
    activeSupabaseCoupling,
  };
  const failures = [
    ...(!loginResult.ok ? [{ name: "login", status: loginResult.status, error: loginResult.error }] : []),
    ...endpoints.filter((result) => result.required && !result.ok).map((result) => ({
      name: result.name,
      status: result.status,
      errors: result.errors,
      summary: result.summary,
    })),
    ...(sourceScan.ok ? [] : [{ name: "source-scan", errors: activeSupabaseCoupling }]),
    ...(d1.ok ? [] : [{ name: "d1-counts", error: d1.error }]),
  ];
  const report = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    baseUrl,
    includeCronPreview,
    login: {
      ok: loginResult.ok,
      status: loginResult.status,
      usernameHash: loginResult.usernameHash,
      cookie: Boolean(loginResult.cookie),
      error: loginResult.error,
    },
    endpoints,
    d1,
    sourceScan,
    failures,
  };

  if (write) {
    fs.mkdirSync(reportDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    const jsonPath = path.join(reportDir, `d1-feature-audit-${stamp}.json`);
    const mdPath = path.join(reportDir, `d1-feature-audit-${stamp}.md`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(mdPath, markdown(report), "utf8");
    report.written = { jsonPath, mdPath };
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

await main();
