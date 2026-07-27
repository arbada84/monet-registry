#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_BACKUP_ROOT } from "./lib/backup-root.mjs";
import { expandHomePath, latestBackupDir, parseArgs, readJson, sha256Text, timestampForFile, writeJsonAtomic } from "./lib/culturepeople-ops-utils.mjs";

const APPLY_CONFIRMATION = "APPLY_AUTO_PRESS_STALE_RECOVERY";
const PROD_D1_ID = "9e69e770-f2e2-414f-bccc-f3f673e5988e";

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

function isExpired(item, nowMs, staleMinutes) {
  const lease = Date.parse(String(item?.lease_until || ""));
  const updated = Date.parse(String(item?.updated_at || item?.started_at || item?.created_at || ""));
  const cutoff = nowMs - staleMinutes * 60_000;
  return Number.isFinite(lease) ? lease <= nowMs : Number.isFinite(updated) && updated <= cutoff;
}

export function classifyStaleAutoPressItem(item, { publishedArticle = null, nowMs = Date.now(), staleMinutes = 15 } = {}) {
  if (String(item?.status || "") !== "running") return { eligible: false, action: "ignore", reason: "NOT_RUNNING" };
  if (!isExpired(item, nowMs, staleMinutes)) return { eligible: false, action: "ignore", reason: "LEASE_ACTIVE" };
  const articleEvidence = item.article_id || item.article_no || item.published_at || publishedArticle?.id || publishedArticle?.no;
  if (articleEvidence) {
    return {
      eligible: true,
      action: "reconcile_published",
      reason: "ARTICLE_EVIDENCE_PRESENT",
      articleId: item.article_id || publishedArticle?.id || null,
      articleNo: Number(item.article_no || publishedArticle?.no || 0) || null,
    };
  }
  const attempts = Number(item.attempt_count || item.retry_count || 0);
  const maxAttempts = Math.max(1, Number(item.max_attempts || 3));
  if (attempts >= maxAttempts) return { eligible: true, action: "mark_failed", reason: "MAX_ATTEMPTS_REACHED", attempts, maxAttempts };
  return { eligible: true, action: "requeue", reason: "EXPIRED_LEASE", attempts, maxAttempts };
}

function latestTable(root, name) {
  const backupDir = latestBackupDir(root);
  if (!backupDir) return { backupDir: "", rows: [] };
  return { backupDir, rows: readJson(path.join(backupDir, "raw", "d1", "tables", `${name}.json`), []) || [] };
}

export function buildStaleRecoveryReport({ items = [], articles = [], backupDir = "", staleMinutes = 15, now = new Date() } = {}) {
  const articleById = new Map();
  const articleBySource = new Map();
  for (const article of Array.isArray(articles) ? articles : []) {
    if (String(article?.status || "") !== "게시") continue;
    if (article.id) articleById.set(String(article.id), article);
    for (const source of [normalizeUrl(article.source_url), normalizeUrl(article.canonical_url)]) {
      if (source) articleBySource.set(source, article);
    }
  }
  const candidates = [];
  for (const item of Array.isArray(items) ? items : []) {
    const publishedArticle = (item.article_id && articleById.get(String(item.article_id)))
      || articleBySource.get(normalizeUrl(item.canonical_url))
      || articleBySource.get(normalizeUrl(item.source_url))
      || null;
    const classification = classifyStaleAutoPressItem(item, { publishedArticle, nowMs: now.getTime(), staleMinutes });
    if (!classification.eligible) continue;
    candidates.push({
      id: String(item.id || ""),
      runId: String(item.run_id || ""),
      status: String(item.status || ""),
      leaseUntil: item.lease_until || null,
      updatedAt: item.updated_at || null,
      attemptCount: Number(item.attempt_count || 0),
      maxAttempts: Number(item.max_attempts || 3),
      action: classification.action,
      reason: classification.reason,
      articleId: classification.articleId || null,
      articleNo: classification.articleNo || null,
    });
  }
  const counts = Object.fromEntries(["reconcile_published", "requeue", "mark_failed"].map((action) => [action, candidates.filter((item) => item.action === action).length]));
  const report = {
    formatVersion: 1,
    mode: "dry-run",
    generatedAt: now.toISOString(),
    backupDir: backupDir || null,
    staleMinutes,
    counts: { total: candidates.length, ...counts },
    candidates,
    safeguards: {
      publishedItemsNeverRequeued: true,
      conditionalLiveRecheckRequired: true,
      maxApplyLimit: 10,
      dailyLimitsRemainEnforcedByWorker: true,
    },
    secretValuesIncluded: false,
  };
  report.reportId = staleRecoveryReportId(report);
  report.ok = Boolean(backupDir);
  report.errors = backupDir ? [] : ["Latest D1 backup was not found."];
  return report;
}

export function staleRecoveryReportId(report) {
  return `stale-${sha256Text(JSON.stringify({ backupDir: report?.backupDir || "", staleMinutes: Number(report?.staleMinutes || 0), candidates: report?.candidates || [] })).slice(0, 20)}`;
}

async function d1Query({ accountId, databaseId, token, sql, params = [] }) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(`D1 query failed: HTTP ${response.status}`);
  return body.result?.[0] || {};
}

async function liveItem(config, id) {
  const result = await d1Query({ ...config, sql: "SELECT * FROM auto_press_items WHERE id = ? LIMIT 1", params: [id] });
  return result.results?.[0] || null;
}

async function livePublishedArticle(config, item) {
  if (item.article_id) {
    const result = await d1Query({ ...config, sql: "SELECT id, no, status FROM articles WHERE id = ? AND status = '게시' LIMIT 1", params: [item.article_id] });
    if (result.results?.[0]) return result.results[0];
  }
  if (item.article_no) {
    const result = await d1Query({ ...config, sql: "SELECT id, no, status FROM articles WHERE no = ? AND status = '게시' LIMIT 1", params: [Number(item.article_no)] });
    if (result.results?.[0]) return result.results[0];
  }
  const urls = [...new Set([
    normalizeUrl(item.canonical_url),
    normalizeUrl(item.source_url),
    String(item.canonical_url || "").trim(),
    String(item.source_url || "").trim(),
  ].filter(Boolean))].slice(0, 4);
  if (!urls.length) return null;
  const placeholders = urls.map(() => "?").join(",");
  const result = await d1Query({ ...config, sql: `SELECT id, no, status FROM articles WHERE source_url IN (${placeholders}) AND status = '게시' ORDER BY created_at DESC LIMIT 1`, params: urls });
  return result.results?.[0] || null;
}

async function refreshLiveRunCounts(config, runId) {
  const grouped = await d1Query({ ...config, sql: "SELECT status, COUNT(*) AS count FROM auto_press_items WHERE run_id = ? GROUP BY status", params: [runId] });
  const counts = Object.fromEntries((grouped.results || []).map((row) => [row.status, Number(row.count || 0)]));
  const published = Number(counts.ok || 0);
  const failed = Number(counts.fail || 0);
  const queued = Number(counts.queued || 0);
  const running = Number(counts.running || 0);
  const skipped = Number(counts.skip || 0) + Number(counts.dup || 0) + Number(counts.no_image || 0) + Number(counts.old || 0);
  const status = running > 0 ? "running" : queued > 0 ? "queued" : failed > 0 && published === 0 && skipped === 0 ? "failed" : "completed";
  const now = new Date().toISOString();
  await d1Query({
    ...config,
    sql: "UPDATE auto_press_runs SET status=?, processed_count=?, published_count=?, skipped_count=?, failed_count=?, queued_count=?, completed_at=CASE WHEN ?=0 AND ?=0 THEN COALESCE(completed_at, ?) ELSE completed_at END, last_event_at=?, updated_at=? WHERE id=?",
    params: [status, published + failed + skipped, published, skipped, failed, queued, queued, running, now, now, now, runId],
  });
}

async function applyOne(config, candidate, staleMinutes) {
  const item = await liveItem(config, candidate.id);
  if (!item) return { id: candidate.id, status: "skipped", reason: "LIVE_ITEM_MISSING" };
  const article = await livePublishedArticle(config, item);
  const current = classifyStaleAutoPressItem(item, { publishedArticle: article, staleMinutes });
  if (!current.eligible || current.action !== candidate.action) return { id: candidate.id, status: "skipped", reason: `LIVE_RECHECK_${current.reason}` };
  const now = new Date().toISOString();
  const staleWithoutLease = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  let sql;
  let params;
  if (current.action === "reconcile_published") {
    sql = `UPDATE auto_press_items SET status='ok', reason_code='STALE_LEASE_RECONCILED', reason_message='만료 lease를 게시 기사 근거로 정합화했습니다.', article_id=COALESCE(article_id, ?), article_no=COALESCE(article_no, ?), retryable=0, next_retry_at=NULL, lease_until=NULL, completed_at=COALESCE(completed_at, ?), updated_at=? WHERE id=? AND status='running' AND ((lease_until IS NOT NULL AND lease_until<=?) OR (lease_until IS NULL AND updated_at<=?))`;
    params = [current.articleId, current.articleNo, now, now, item.id, now, staleWithoutLease];
  } else if (current.action === "mark_failed") {
    sql = `UPDATE auto_press_items SET status='fail', reason_code='STALE_LEASE_MAX_ATTEMPTS', reason_message='만료 lease가 최대 재시도 횟수에 도달했습니다.', retryable=0, next_retry_at=NULL, lease_until=NULL, completed_at=COALESCE(completed_at, ?), updated_at=? WHERE id=? AND status='running' AND ((lease_until IS NOT NULL AND lease_until<=?) OR (lease_until IS NULL AND updated_at<=?))`;
    params = [now, now, item.id, now, staleWithoutLease];
  } else {
    sql = `UPDATE auto_press_items SET status='queued', reason_code='STALE_LEASE_RECOVERED', reason_message='만료 lease를 제한적으로 재큐잉했습니다.', retryable=1, next_retry_at=?, lease_until=NULL, updated_at=? WHERE id=? AND status='running' AND ((lease_until IS NOT NULL AND lease_until<=?) OR (lease_until IS NULL AND updated_at<=?))`;
    params = [now, now, item.id, now, staleWithoutLease];
  }
  const changed = await d1Query({ ...config, sql, params });
  const changes = Number(changed.meta?.changes || 0);
  if (changes !== 1) return { id: candidate.id, status: "skipped", reason: "CONDITIONAL_UPDATE_NOT_APPLIED" };
  await d1Query({
    ...config,
    sql: "INSERT INTO auto_press_events (run_id,item_id,level,code,message,metadata_json) VALUES (?,?, 'warn','STALE_LEASE_RECOVERY','만료 lease 복구 작업을 적용했습니다.',?)",
    params: [item.run_id, item.id, JSON.stringify({ action: current.action, reportId: candidate.reportId || null })],
  });
  return { id: candidate.id, runId: item.run_id, status: "applied", action: current.action };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const root = path.resolve(expandHomePath(values.root || DEFAULT_BACKUP_ROOT));
  let staleMinutes = Math.max(5, Number(values["stale-minutes"] || 15));
  const apply = flags.has("apply");
  let report;
  let reportPath;
  if (apply) {
    reportPath = path.resolve(expandHomePath(values.report || ""));
    report = readJson(reportPath, null);
    if (!report) throw new Error("Apply blocked: --report must reference a valid dry-run report.");
    const reportAgeHours = report.generatedAt ? (Date.now() - Date.parse(report.generatedAt)) / 36e5 : Number.POSITIVE_INFINITY;
    if (report.mode !== "dry-run" || report.ok !== true || report.reportId !== staleRecoveryReportId(report)) throw new Error("Apply blocked: dry-run report integrity check failed.");
    if (!Number.isFinite(reportAgeHours) || reportAgeHours > 24) throw new Error("Apply blocked: dry-run report is older than 24 hours.");
    if (values["report-id"] !== report.reportId) throw new Error("Apply blocked: --report-id must match the dry-run report.");
    if (values.confirm !== APPLY_CONFIRMATION) throw new Error(`Apply blocked: --confirm ${APPLY_CONFIRMATION} is required.`);
    staleMinutes = Math.max(5, Number(report.staleMinutes || 15));
  } else {
    const itemsResult = latestTable(root, "auto_press_items");
    const articlesResult = latestTable(root, "articles");
    report = buildStaleRecoveryReport({ items: itemsResult.rows, articles: articlesResult.rows, backupDir: itemsResult.backupDir, staleMinutes });
    reportPath = path.resolve(values.report || path.join(".auto-press-recovery-runs", `stale-recovery-${timestampForFile()}.json`));
    report.reportPath = reportPath;
    writeJsonAtomic(reportPath, report);
    if (flags.has("json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log("CulturePeople auto-press stale lease recovery dry-run");
      console.log(`- report id: ${report.reportId}`);
      console.log(`- candidates: ${report.counts.total}`);
      console.log(`- reconcile/requeue/fail: ${report.counts.reconcile_published}/${report.counts.requeue}/${report.counts.mark_failed}`);
      console.log(`- report: ${reportPath}`);
    }
    if (!report.ok) process.exitCode = 1;
    return;
  }

  const limit = Number(values.limit || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("Apply blocked: --limit must be between 1 and 10.");
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const databaseId = String(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID || PROD_D1_ID).trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!accountId || !databaseId || !token) throw new Error("Apply blocked: Cloudflare D1 environment is incomplete.");
  const config = { accountId, databaseId, token };
  const selected = report.candidates.slice(0, limit).map((candidate) => ({ ...candidate, reportId: report.reportId }));
  const results = [];
  for (const candidate of selected) {
    try {
      results.push(await applyOne(config, candidate, staleMinutes));
    } catch (error) {
      results.push({ id: candidate.id, status: "error", reason: error instanceof Error ? error.message.slice(0, 300) : "unknown error" });
    }
  }
  for (const runId of [...new Set(results.filter((item) => item.status === "applied" && item.runId).map((item) => item.runId))]) {
    try { await refreshLiveRunCounts(config, runId); }
    catch (error) { results.push({ runId, status: "error", reason: `RUN_COUNT_RECONCILE_FAILED: ${error instanceof Error ? error.message.slice(0, 240) : "unknown"}` }); }
  }
  const applyReport = {
    ok: results.every((item) => ["applied", "skipped"].includes(item.status)),
    mode: "bounded-apply",
    generatedAt: new Date().toISOString(),
    sourceReport: reportPath,
    sourceReportId: report.reportId,
    requestedLimit: limit,
    applied: results.filter((item) => item.status === "applied").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    results,
    observationRequiredHours: 24,
    secretValuesIncluded: false,
  };
  const output = path.resolve(path.dirname(reportPath), `stale-recovery-apply-${timestampForFile()}.json`);
  applyReport.reportPath = output;
  writeJsonAtomic(output, applyReport);
  if (flags.has("json")) console.log(JSON.stringify(applyReport, null, 2));
  else console.log(`Applied ${applyReport.applied}; skipped ${applyReport.skipped}. Observe for 24h. Report: ${output}`);
  if (!applyReport.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[auto-press:stale-recovery] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
