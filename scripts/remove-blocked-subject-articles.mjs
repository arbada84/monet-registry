#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const APPLY_CONFIRMATION = "DELETE_BLOCKED_SUBJECT_ARTICLES";
const REPORT_DIR = ".content-policy-runs";
const policy = JSON.parse(fs.readFileSync(new URL("../config/auto-press-blocked-subjects.json", import.meta.url), "utf8"));

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--" || !arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) values[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) values[key] = argv[++index];
    else flags.add(key);
  }
  return { flags, values };
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const result = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || rawLine.trim().startsWith("#")) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) result[match[1]] = value;
  }
  return result;
}

function loadEnv() {
  return {
    ...readEnvFile(".env.local"),
    ...readEnvFile(".env.production.local"),
    ...readEnvFile(".env.vercel.local"),
    ...process.env,
  };
}

function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function compact(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/<[^>]+>/g, " ").replace(/[\s\u00a0._\-–—/]+/g, "");
}

function hostname(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function sqliteLikeProbe(value, maxBytes = 40) {
  let output = "";
  for (const character of String(value || "").toLowerCase()) {
    if (Buffer.byteLength(output + character, "utf8") > maxBytes) break;
    output += character;
  }
  return output;
}

function matchRow(row) {
  const text = compact([
    row.title,
    row.summary,
    row.body,
    row.tags,
    row.raw_json,
    row.payload_json,
    row.source_url,
  ].filter(Boolean).join(" "));
  const host = hostname(row.source_url);
  for (const subject of policy.subjects) {
    if (subject.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return subject;
    if (subject.terms.some((term) => text.includes(compact(term)))) return subject;
    if ((subject.termGroups || []).some((group) => group.every((term) => text.includes(compact(term))))) return subject;
  }
  return null;
}

function isPromotionalArticle(row, subject) {
  const host = hostname(row.source_url);
  if (subject.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  if (host === "newswire.co.kr" || host.endsWith(".newswire.co.kr")) return true;

  const title = compact(row.title);
  const subjectInTitle = subject.terms.some((term) => title.includes(compact(term)))
    || (subject.termGroups || []).some((group) => group.every((term) => title.includes(compact(term))));
  if (!subjectInTitle) return false;
  return [
    "개최", "출범", "창립", "기념", "봉사", "후원", "캠페인", "세미나",
    "콘퍼런스", "컨퍼런스", "축제", "공연", "전시", "모집", "수상", "협약",
  ].some((term) => title.includes(compact(term)));
}

function d1Config(env) {
  return {
    accountId: clean(env.CLOUDFLARE_ACCOUNT_ID),
    databaseId: clean(env.CLOUDFLARE_D1_DATABASE_ID || env.D1_DATABASE_ID),
    token: clean(env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_D1_API_TOKEN),
  };
}

async function d1Query(config, sql, params = []) {
  if (!config.accountId || !config.databaseId || !config.token) throw new Error("Cloudflare D1 environment is incomplete.");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/d1/database/${encodeURIComponent(config.databaseId)}/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`D1 HTTP ${response.status}: ${body.errors?.[0]?.message || "query failed"}`);
  }
  return body.result?.[0]?.results || [];
}

function matchSqlChunks(fields, maxVariables = 24) {
  const units = [];
  for (const subject of policy.subjects) {
    for (const term of subject.terms) {
      const clauses = [];
      const params = [];
      for (const field of fields) {
        clauses.push(`LOWER(COALESCE(${field}, '')) LIKE ?`);
        params.push(`%${sqliteLikeProbe(term)}%`);
      }
      units.push({ sql: `(${clauses.join(" OR ")})`, params });
    }
    for (const group of subject.termGroups || []) {
      const groupClauses = [];
      const params = [];
      for (const term of group) {
        const fieldClauses = fields.map((field) => `LOWER(COALESCE(${field}, '')) LIKE ?`);
        groupClauses.push(`(${fieldClauses.join(" OR ")})`);
        for (const _field of fields) params.push(`%${sqliteLikeProbe(term)}%`);
      }
      units.push({ sql: `(${groupClauses.join(" AND ")})`, params });
    }
    for (const domain of subject.domains) {
      units.push({
        sql: "LOWER(COALESCE(source_url, '')) LIKE ?",
        params: [`%${sqliteLikeProbe(domain)}%`],
      });
    }
  }
  const chunks = [];
  let current = { clauses: [], params: [] };
  for (const unit of units) {
    if (current.params.length && current.params.length + unit.params.length > maxVariables) {
      chunks.push({ sql: `(${current.clauses.join(" OR ")})`, params: current.params });
      current = { clauses: [], params: [] };
    }
    current.clauses.push(unit.sql);
    current.params.push(...unit.params);
  }
  if (current.clauses.length) chunks.push({ sql: `(${current.clauses.join(" OR ")})`, params: current.params });
  return chunks.length ? chunks : [{ sql: "0", params: [] }];
}

async function d1MatchingRows(config, fields, selectSql) {
  const byId = new Map();
  const chunks = matchSqlChunks(fields);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    let rows;
    try {
      rows = await d1Query(config, selectSql.replace("/*MATCH*/", chunk.sql), chunk.params);
    } catch (error) {
      const patterns = [...new Set(chunk.params.map((value) => String(value).replace(/^%|%$/g, "")))];
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} (chunk ${index + 1}/${chunks.length}, patterns=${patterns.join(" | ")})`,
      );
    }
    for (const row of rows) byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function auditD1(config) {
  const articles = await d1MatchingRows(
    config,
    ["title", "summary", "body", "tags"],
    `SELECT id, no, title, status, date, source_url, deleted_at, summary, body, tags
       FROM articles
      WHERE deleted_at IS NULL AND /*MATCH*/
      ORDER BY no ASC`,
  );
  const queueItems = await d1MatchingRows(
    config,
    ["title", "raw_json"],
    `SELECT id, run_id, title, source_url, status, raw_json
       FROM auto_press_items
      WHERE status IN ('queued', 'running', 'fail') AND /*MATCH*/
      ORDER BY created_at ASC`,
  );
  const retryItems = await d1MatchingRows(
    config,
    ["title", "payload_json"],
    `SELECT id, run_id, item_id, title, source_url, status, payload_json
       FROM auto_press_retry_queue
      WHERE status IN ('pending', 'running', 'failed') AND /*MATCH*/
      ORDER BY created_at ASC`,
  );
  const matchedArticles = articles.filter(matchRow);
  const promotionalArticles = matchedArticles.filter((row) => isPromotionalArticle(row, matchRow(row)));
  const reviewArticles = matchedArticles.filter((row) => !isPromotionalArticle(row, matchRow(row)));
  const summarizeArticle = ({ body, summary, tags, ...row }) => ({
      ...row,
      subjectId: matchRow({ ...row, body, summary, tags })?.id,
    });
  return {
    articles: promotionalArticles.map(summarizeArticle),
    reviewArticles: reviewArticles.map(summarizeArticle),
    queueItems: queueItems.filter(matchRow).map(({ raw_json, ...row }) => row),
    retryItems: retryItems.filter(matchRow).map(({ payload_json, ...row }) => row),
  };
}

async function auditSupabase(env) {
  const base = clean(env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const key = clean(env.SUPABASE_SERVICE_KEY);
  if (!base || !key) return { status: "not_configured", articles: [] };
  const orTerms = [];
  for (const subject of policy.subjects) {
    for (const term of subject.terms) {
      for (const field of ["title", "summary", "body", "tags"]) orTerms.push(`${field}.ilike.*${term}*`);
    }
    for (const group of subject.termGroups || []) {
      for (const term of group) {
        for (const field of ["title", "summary", "body", "tags"]) orTerms.push(`${field}.ilike.*${term}*`);
      }
    }
    for (const domain of subject.domains) orTerms.push(`source_url.ilike.*${domain}*`);
  }
  try {
    const rowsById = new Map();
    for (let index = 0; index < orTerms.length; index += 40) {
      const chunk = orTerms.slice(index, index + 40);
      const url = `${base}/rest/v1/articles?select=id,no,title,status,date,source_url,deleted_at,summary,body,tags&deleted_at=is.null&or=(${encodeURIComponent(chunk.join(","))})`;
      const response = await fetch(url, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return { status: `blocked_http_${response.status}`, articles: [] };
      for (const row of await response.json()) rowsById.set(row.id, row);
    }
    const rows = [...rowsById.values()];
    const matchedArticles = rows.filter(matchRow);
    const promotionalArticles = matchedArticles.filter((row) => isPromotionalArticle(row, matchRow(row)));
    const reviewArticles = matchedArticles.filter((row) => !isPromotionalArticle(row, matchRow(row)));
    const summarizeArticle = ({ body, summary, tags, ...row }) => ({
      ...row,
      subjectId: matchRow({ ...row, body, summary, tags })?.id,
    });
    return {
      status: "ok",
      articles: promotionalArticles.map(summarizeArticle),
      reviewArticles: reviewArticles.map(summarizeArticle),
    };
  } catch (error) {
    return { status: `blocked_${error instanceof Error ? error.name : "error"}`, articles: [] };
  }
}

function reportIdentity(report) {
  return crypto.createHash("sha256").update(JSON.stringify({
    policyVersion: report.policyVersion,
    d1Articles: report.d1.articles.map((row) => [row.id, row.no]),
    d1QueueItems: report.d1.queueItems.map((row) => row.id),
    d1RetryItems: report.d1.retryItems.map((row) => row.id),
    supabaseArticles: report.supabase.articles.map((row) => [row.id, row.no]),
  })).digest("hex").slice(0, 20);
}

function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `blocked-subject-${report.generatedAt.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return file;
}

async function softDeleteViaSite(baseUrl, cronSecret, article) {
  const url = new URL("/api/db/articles", baseUrl);
  url.searchParams.set("id", article.id);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${cronSecret}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(`article no=${article.no} delete HTTP ${response.status}`);
}

async function softDeleteSupabase(env, article, deletedAt) {
  const base = clean(env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const key = clean(env.SUPABASE_SERVICE_KEY);
  const response = await fetch(`${base}/rest/v1/articles?id=eq.${encodeURIComponent(article.id)}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ deleted_at: deletedAt, updated_at: deletedAt }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Supabase article no=${article.no} delete HTTP ${response.status}`);
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const config = d1Config(env);

  if (!flags.has("apply")) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: "dry-run",
      policyVersion: policy.version,
      subjects: policy.subjects.map(({ id, label }) => ({ id, label })),
      d1: await auditD1(config),
      supabase: await auditSupabase(env),
    };
    report.reportId = reportIdentity(report);
    const reportPath = writeReport(report);
    console.log("CulturePeople blocked-subject article audit");
  console.log(`- D1 active articles: ${report.d1.articles.length}`);
  console.log(`- D1 mention-only/manual review: ${report.d1.reviewArticles?.length || 0}`);
    console.log(`- D1 active queue/retry: ${report.d1.queueItems.length}/${report.d1.retryItems.length}`);
    console.log(`- Supabase: ${report.supabase.status}, active articles: ${report.supabase.articles.length}`);
    for (const article of report.d1.articles) console.log(`  - no=${article.no} ${article.title}`);
    console.log(`- report ID: ${report.reportId}`);
    console.log(`- report: ${reportPath}`);
    return;
  }

  const reportPath = path.resolve(String(values.report || ""));
  if (!reportPath || !fs.existsSync(reportPath)) throw new Error("Apply blocked: --report <dry-run.json> is required.");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.mode !== "dry-run" || report.reportId !== reportIdentity(report)) throw new Error("Apply blocked: report integrity check failed.");
  if (values["report-id"] !== report.reportId) throw new Error("Apply blocked: --report-id does not match.");
  if (values.confirm !== APPLY_CONFIRMATION) throw new Error(`Apply blocked: --confirm ${APPLY_CONFIRMATION} is required.`);
  const maxArticles = Number(values["max-articles"] || 0);
  if (!Number.isInteger(maxArticles) || maxArticles < report.d1.articles.length) throw new Error(`Apply blocked: --max-articles must be at least ${report.d1.articles.length}.`);

  const baseUrl = clean(values.base || env.NEXT_PUBLIC_SITE_URL || "https://culturepeople.co.kr");
  const cronSecret = clean(env.CRON_SECRET);
  if (!cronSecret) throw new Error("Apply blocked: CRON_SECRET is missing.");
  for (const article of report.d1.articles) await softDeleteViaSite(baseUrl, cronSecret, article);

  const now = new Date().toISOString();
  for (const item of report.d1.queueItems) {
    await d1Query(config, "UPDATE auto_press_items SET status='skip', reason_code='BLOCKED_SUBJECT', reason_message='운영 차단 주제 관련 보도자료', retryable=0, next_retry_at=NULL, lease_until=NULL, completed_at=COALESCE(completed_at, ?), updated_at=? WHERE id=?", [now, now, item.id]);
  }
  for (const item of report.d1.retryItems) {
    await d1Query(config, "UPDATE auto_press_retry_queue SET status='cancelled', reason_code='BLOCKED_SUBJECT', reason_message='운영 차단 주제 관련 보도자료', next_attempt_at=NULL, updated_at=? WHERE id=?", [now, item.id]);
  }
  if (report.supabase.status === "ok") {
    for (const article of report.supabase.articles) await softDeleteSupabase(env, article, now);
  }

  const verified = await auditD1(config);
  if (verified.articles.length || verified.queueItems.length || verified.retryItems.length) {
    throw new Error(`Apply verification failed: articles=${verified.articles.length}, queue=${verified.queueItems.length}, retry=${verified.retryItems.length}`);
  }
  report.mode = "apply";
  report.appliedAt = now;
  report.result = {
    d1ArticlesDeleted: report.d1.articles.length,
    d1QueueItemsCancelled: report.d1.queueItems.length,
    d1RetryItemsCancelled: report.d1.retryItems.length,
    supabaseArticlesDeleted: report.supabase.status === "ok" ? report.supabase.articles.length : 0,
    supabaseStatus: report.supabase.status,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("Blocked-subject deletion applied and verified.");
  console.log(JSON.stringify(report.result));
}

main().catch((error) => {
  console.error(`[blocked-subject-delete] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
