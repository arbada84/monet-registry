import "server-only";

import { d1HttpFirst, d1HttpQuery } from "@/lib/d1-http-client";
import type {
  AutoPressArticleResult,
  AutoPressObservedEvent,
  AutoPressObservedItem,
  AutoPressObservedRun,
  AutoPressObservedRunStatus,
  AutoPressObservedSummary,
  AutoPressRetryQueueEntry,
  AutoPressRun,
} from "@/types/article";

export type AutoPressFailureReasonCode =
  | "NO_AI_SETTINGS"
  | "NO_AI_KEY"
  | "AI_TIMEOUT"
  | "AI_RESPONSE_INVALID"
  | "AI_RETRY_PENDING"
  | "RSS_FETCH_FAILED"
  | "DETAIL_FETCH_FAILED"
  | "BODY_TOO_SHORT"
  | "NO_IMAGE"
  | "IMAGE_UPLOAD_FAILED"
  | "DUPLICATE_SOURCE"
  | "OLD_DATE"
  | "BLOCKED_KEYWORD"
  | "DB_CREATE_FAILED"
  | "TIME_BUDGET_EXCEEDED"
  | "MANUAL_CANCELLED"
  | "UNKNOWN";

export interface AutoPressRunStartInput {
  id: string;
  source: AutoPressRun["source"];
  preview?: boolean;
  requestedCount?: number;
  triggeredBy?: string;
  options?: Record<string, unknown>;
  startedAt?: string;
}

export interface AutoPressRunFailInput extends AutoPressRunStartInput {
  errorCode?: AutoPressFailureReasonCode | string;
  errorMessage?: string;
}

const AUTO_PRESS_ITEM_LIMIT_MAX = 500;

function nowIso(): string {
  return new Date().toISOString();
}

function safeJson(value: unknown, fallback = "{}"): string {
  try {
    return JSON.stringify(value ?? (fallback === "[]" ? [] : {}));
  } catch {
    return fallback;
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function strOrUndef(value: unknown): string | undefined {
  return value != null && value !== "" ? String(value) : undefined;
}

function numOrUndef(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function boolFromSql(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  const n = Number(value || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), max));
}

function durationMs(startedAt: string, completedAt?: string): number | undefined {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return Math.max(0, end - start);
}

function observedRunFromRow(row: Record<string, unknown>): AutoPressObservedRun {
  return {
    id: String(row.id),
    source: String(row.source || "manual"),
    status: String(row.status || "running") as AutoPressObservedRunStatus,
    preview: boolFromSql(row.preview),
    requestedCount: Number(row.requested_count || 0),
    processedCount: Number(row.processed_count || 0),
    publishedCount: Number(row.published_count || 0),
    previewedCount: Number(row.previewed_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    failedCount: Number(row.failed_count || 0),
    queuedCount: Number(row.queued_count || 0),
    startedAt: String(row.started_at || ""),
    completedAt: strOrUndef(row.completed_at),
    lastEventAt: strOrUndef(row.last_event_at),
    durationMs: numOrUndef(row.duration_ms),
    triggeredBy: strOrUndef(row.triggered_by),
    options: parseJson<Record<string, unknown>>(row.options_json, {}),
    warnings: parseJson<string[]>(row.warnings_json, []),
    mediaStorage: parseJson<Record<string, unknown>>(row.media_storage_json, {}),
    summary: parseJson<Record<string, unknown>>(row.summary_json, {}),
    errorCode: strOrUndef(row.error_code),
    errorMessage: strOrUndef(row.error_message),
    createdAt: strOrUndef(row.created_at),
    updatedAt: strOrUndef(row.updated_at),
  };
}

function observedItemFromRow(row: Record<string, unknown>): AutoPressObservedItem {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    sourceId: strOrUndef(row.source_id),
    sourceName: strOrUndef(row.source_name),
    sourceUrl: strOrUndef(row.source_url),
    sourceItemId: strOrUndef(row.source_item_id),
    boTable: strOrUndef(row.bo_table),
    title: String(row.title || ""),
    status: String(row.status || "queued") as AutoPressObservedItem["status"],
    reasonCode: strOrUndef(row.reason_code),
    reasonMessage: strOrUndef(row.reason_message),
    articleId: strOrUndef(row.article_id),
    articleNo: numOrUndef(row.article_no),
    retryable: boolFromSql(row.retryable),
    retryCount: Number(row.retry_count || 0),
    nextRetryAt: strOrUndef(row.next_retry_at),
    bodyChars: Number(row.body_chars || 0),
    imageCount: Number(row.image_count || 0),
    warnings: parseJson<string[]>(row.warnings_json, []),
    raw: parseJson<Record<string, unknown>>(row.raw_json, {}),
    startedAt: strOrUndef(row.started_at),
    completedAt: strOrUndef(row.completed_at),
    createdAt: strOrUndef(row.created_at),
    updatedAt: strOrUndef(row.updated_at),
  };
}

function observedEventFromRow(row: Record<string, unknown>): AutoPressObservedEvent {
  return {
    id: Number(row.id || 0),
    runId: String(row.run_id),
    itemId: strOrUndef(row.item_id),
    level: String(row.level || "info"),
    code: String(row.code || ""),
    message: String(row.message || ""),
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: String(row.created_at || ""),
  };
}

function retryQueueFromRow(row: Record<string, unknown>): AutoPressRetryQueueEntry {
  return {
    id: String(row.id),
    runId: strOrUndef(row.run_id),
    itemId: strOrUndef(row.item_id),
    articleId: strOrUndef(row.article_id),
    articleNo: numOrUndef(row.article_no),
    title: String(row.title || ""),
    sourceUrl: strOrUndef(row.source_url),
    sourceName: strOrUndef(row.source_name),
    status: String(row.status || "pending"),
    reasonCode: String(row.reason_code || "UNKNOWN"),
    reasonMessage: String(row.reason_message || ""),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 6),
    nextAttemptAt: strOrUndef(row.next_attempt_at),
    lastAttemptAt: strOrUndef(row.last_attempt_at),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    result: parseJson<Record<string, unknown>>(row.result_json, {}),
    createdAt: strOrUndef(row.created_at),
    updatedAt: strOrUndef(row.updated_at),
  };
}

export function autoPressReasonCodeFromResult(result: AutoPressArticleResult): AutoPressFailureReasonCode | undefined {
  const message = `${result.error || ""} ${result.warnings?.join(" ") || ""}`.toLowerCase();
  if (result.status === "ok" || result.status === "preview") {
    if (message.includes("ai") || message.includes("편집 실패")) return "AI_RETRY_PENDING";
    return undefined;
  }
  if (result.status === "dup") return "DUPLICATE_SOURCE";
  if (result.status === "old") return "OLD_DATE";
  if (result.status === "no_image" || message.includes("이미지")) return "NO_IMAGE";
  if (message.includes("상세") || message.includes("수집")) return "DETAIL_FETCH_FAILED";
  if (message.includes("본문")) return "BODY_TOO_SHORT";
  if (message.includes("금칙어")) return "BLOCKED_KEYWORD";
  if (message.includes("시간") || message.includes("timeout")) return "TIME_BUDGET_EXCEEDED";
  if (message.includes("원문 그대로 등록 금지")) return undefined;
  if (message.includes("ai") || message.includes("api 키")) return "AI_RESPONSE_INVALID";
  return result.status === "fail" ? "UNKNOWN" : undefined;
}

function isSyntheticRunMarker(result: AutoPressArticleResult): boolean {
  const text = `${result.title || ""} ${result.error || ""}`;
  return !result.sourceUrl
    && !result.wrId
    && !result.boTable
    && /시간 초과|50초 안전 마진|안전 종료/.test(text);
}

function observableArticles(run: AutoPressRun): AutoPressArticleResult[] {
  return run.articles.filter((article) => !isSyntheticRunMarker(article));
}

function isRetryableResult(result: AutoPressArticleResult): boolean {
  if (isSyntheticRunMarker(result)) return false;
  const reason = autoPressReasonCodeFromResult(result);
  return reason === "AI_RETRY_PENDING"
    || reason === "AI_TIMEOUT"
    || reason === "AI_RESPONSE_INVALID"
    || reason === "DETAIL_FETCH_FAILED"
    || reason === "TIME_BUDGET_EXCEEDED"
    || reason === "IMAGE_UPLOAD_FAILED";
}

function articleNoFromResult(result: AutoPressArticleResult): number | undefined {
  const n = Number(result.articleId);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function retryNextAttemptAt(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export async function createAutoPressObservedRun(input: AutoPressRunStartInput): Promise<void> {
  const startedAt = input.startedAt || nowIso();
  await d1HttpQuery(
    `INSERT INTO auto_press_runs (
       id, source, status, preview, requested_count, started_at, last_event_at,
       triggered_by, options_json, created_at, updated_at
     )
     VALUES (?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source = excluded.source,
       status = 'running',
       preview = excluded.preview,
       requested_count = excluded.requested_count,
       started_at = excluded.started_at,
       last_event_at = excluded.last_event_at,
       triggered_by = excluded.triggered_by,
       options_json = excluded.options_json,
       updated_at = excluded.updated_at`,
    [
      input.id,
      input.source,
      input.preview ? 1 : 0,
      input.requestedCount || 0,
      startedAt,
      startedAt,
      input.triggeredBy || null,
      safeJson(input.options),
      startedAt,
      startedAt,
    ],
  );
}

export async function appendAutoPressObservedEvent(input: {
  runId: string;
  itemId?: string;
  level?: "debug" | "info" | "warn" | "error" | string;
  code: string;
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await d1HttpQuery(
    `INSERT INTO auto_press_events (run_id, item_id, level, code, message, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.runId,
      input.itemId || null,
      input.level || "info",
      input.code,
      input.message || "",
      safeJson(input.metadata),
    ],
  );
  await d1HttpQuery(
    `UPDATE auto_press_runs
     SET last_event_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
    [input.runId],
  );
}

async function upsertAutoPressObservedItem(
  run: AutoPressRun,
  result: AutoPressArticleResult,
  index: number,
): Promise<AutoPressObservedItem> {
  const reasonCode = autoPressReasonCodeFromResult(result);
  const retryable = isRetryableResult(result);
  const completedAt = run.completedAt || nowIso();
  const itemId = `${run.id}_${String(index + 1).padStart(4, "0")}`;
  const articleNo = articleNoFromResult(result);

  await d1HttpQuery(
    `INSERT INTO auto_press_items (
       id, run_id, source_url, source_item_id, bo_table, title, status,
       reason_code, reason_message, article_id, article_no, retryable,
       retry_count, next_retry_at, warnings_json, raw_json, completed_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source_url = excluded.source_url,
       source_item_id = excluded.source_item_id,
       bo_table = excluded.bo_table,
       title = excluded.title,
       status = excluded.status,
       reason_code = excluded.reason_code,
       reason_message = excluded.reason_message,
       article_id = excluded.article_id,
       article_no = excluded.article_no,
       retryable = excluded.retryable,
       next_retry_at = excluded.next_retry_at,
       warnings_json = excluded.warnings_json,
       raw_json = excluded.raw_json,
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at`,
    [
      itemId,
      run.id,
      result.sourceUrl || null,
      result.wrId || null,
      result.boTable || null,
      result.title || "",
      result.status,
      reasonCode || null,
      result.error || null,
      result.articleId || null,
      articleNo || null,
      retryable ? 1 : 0,
      retryable ? retryNextAttemptAt() : null,
      safeJson(result.warnings || [], "[]"),
      safeJson(result),
      completedAt,
      completedAt,
    ],
  );

  const saved = await d1HttpFirst<Record<string, unknown>>(
    `SELECT * FROM auto_press_items WHERE id = ? LIMIT 1`,
    [itemId],
  );
  return observedItemFromRow(saved || {
    id: itemId,
    run_id: run.id,
    title: result.title,
    status: result.status,
  });
}

async function enqueueRetryIfNeeded(run: AutoPressRun, result: AutoPressArticleResult, item: AutoPressObservedItem): Promise<void> {
  if (!item.retryable) return;

  const reasonCode = item.reasonCode || autoPressReasonCodeFromResult(result) || "UNKNOWN";
  const queueId = `${item.id}_retry`;
  await d1HttpQuery(
    `INSERT INTO auto_press_retry_queue (
       id, run_id, item_id, article_id, article_no, title, source_url,
       source_name, status, reason_code, reason_message, attempts,
       max_attempts, next_attempt_at, payload_json, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0, 6, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       article_id = excluded.article_id,
       article_no = excluded.article_no,
       title = excluded.title,
       source_url = excluded.source_url,
       reason_code = excluded.reason_code,
       reason_message = excluded.reason_message,
       next_attempt_at = excluded.next_attempt_at,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [
      queueId,
      run.id,
      item.id,
      result.articleId || null,
      item.articleNo || null,
      result.title || "",
      result.sourceUrl || null,
      item.sourceName || null,
      reasonCode,
      result.error || result.warnings?.join(", ") || "",
      item.nextRetryAt || retryNextAttemptAt(),
      safeJson({ result, runId: run.id }),
      nowIso(),
    ],
  );
}

export async function saveAutoPressRunSnapshot(
  run: AutoPressRun,
  options: {
    status?: AutoPressObservedRunStatus;
    requestedCount?: number;
    triggeredBy?: string;
    options?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const status = options.status || "completed";
  const completedAt = run.completedAt || nowIso();
  const visibleArticles = observableArticles(run);
  const syntheticMarkers = run.articles.filter((article) => isSyntheticRunMarker(article));
  const processedCount = visibleArticles.length;
  const queuedCount = visibleArticles.filter((article) => isRetryableResult(article)).length;
  const duration = durationMs(run.startedAt, completedAt);
  const timedOut = status === "timeout" || Boolean(run.timedOut);
  const errorCode = status === "failed"
    ? "UNKNOWN"
    : timedOut
      ? "TIME_BUDGET_EXCEEDED"
      : null;
  const errorMessage = status === "failed"
    ? "보도자료 자동등록 실행이 실패했습니다."
    : timedOut
      ? run.continuation?.message || syntheticMarkers[0]?.error || "보도자료 자동등록이 시간 제한으로 안전 종료되었습니다."
      : null;

  await d1HttpQuery(
    `INSERT INTO auto_press_runs (
       id, source, status, preview, requested_count, processed_count,
       published_count, previewed_count, skipped_count, failed_count, queued_count,
       started_at, completed_at, last_event_at, duration_ms, triggered_by,
       options_json, warnings_json, media_storage_json, summary_json,
       error_code, error_message, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source = excluded.source,
       status = excluded.status,
       preview = excluded.preview,
       requested_count = excluded.requested_count,
       processed_count = excluded.processed_count,
       published_count = excluded.published_count,
       previewed_count = excluded.previewed_count,
       skipped_count = excluded.skipped_count,
       failed_count = excluded.failed_count,
       queued_count = excluded.queued_count,
       started_at = excluded.started_at,
       completed_at = excluded.completed_at,
       last_event_at = excluded.last_event_at,
       duration_ms = excluded.duration_ms,
       triggered_by = excluded.triggered_by,
       options_json = excluded.options_json,
       warnings_json = excluded.warnings_json,
       media_storage_json = excluded.media_storage_json,
       summary_json = excluded.summary_json,
       error_code = excluded.error_code,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
    [
      run.id,
      run.source,
      status,
      run.preview ? 1 : 0,
      options.requestedCount || processedCount,
      processedCount,
      run.articlesPublished || 0,
      run.articlesPreviewed || 0,
      run.articlesSkipped || 0,
      run.articlesFailed || 0,
      queuedCount,
      run.startedAt,
      completedAt,
      completedAt,
      duration || null,
      options.triggeredBy || null,
      safeJson(options.options || {}),
      safeJson(run.warnings || [], "[]"),
      safeJson(run.mediaStorage || {}),
      safeJson({
        articleCount: processedCount,
        timedOut,
        continuation: run.continuation || null,
        markers: syntheticMarkers.map((marker) => ({
          title: marker.title,
          error: marker.error,
        })),
      }),
      errorCode,
      errorMessage,
      completedAt,
    ],
  );

  await appendAutoPressObservedEvent({
    runId: run.id,
    level: status === "failed" ? "error" : timedOut ? "warn" : "info",
    code: timedOut ? "TIME_BUDGET_EXCEEDED" : status === "failed" ? "RUN_FAILED" : "RUN_COMPLETED",
    message: errorMessage || `보도자료 자동등록 실행이 완료되었습니다. 등록 ${run.articlesPublished || 0}건, 실패 ${run.articlesFailed || 0}건, 스킵 ${run.articlesSkipped || 0}건.`,
    metadata: {
      requestedCount: options.requestedCount || processedCount,
      processedCount,
      publishedCount: run.articlesPublished || 0,
      previewedCount: run.articlesPreviewed || 0,
      skippedCount: run.articlesSkipped || 0,
      failedCount: run.articlesFailed || 0,
      queuedCount,
      timedOut,
    },
  });

  for (const [index, result] of visibleArticles.entries()) {
    const item = await upsertAutoPressObservedItem(run, result, index);
    await enqueueRetryIfNeeded(run, result, item);
  }
}

export async function failAutoPressObservedRun(input: AutoPressRunFailInput): Promise<void> {
  const startedAt = input.startedAt || nowIso();
  const completedAt = nowIso();
  const duration = durationMs(startedAt, completedAt);
  await d1HttpQuery(
    `INSERT INTO auto_press_runs (
       id, source, status, preview, requested_count, processed_count,
       started_at, completed_at, last_event_at, duration_ms, triggered_by,
       options_json, error_code, error_message, updated_at
     )
     VALUES (?, ?, 'failed', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = 'failed',
       completed_at = excluded.completed_at,
       last_event_at = excluded.last_event_at,
       duration_ms = excluded.duration_ms,
       error_code = excluded.error_code,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
    [
      input.id,
      input.source,
      input.preview ? 1 : 0,
      input.requestedCount || 0,
      startedAt,
      completedAt,
      completedAt,
      duration || null,
      input.triggeredBy || null,
      safeJson(input.options),
      input.errorCode || "UNKNOWN",
      input.errorMessage || "보도자료 자동등록 실행이 실패했습니다.",
      completedAt,
    ],
  );
  await appendAutoPressObservedEvent({
    runId: input.id,
    level: "error",
    code: input.errorCode || "UNKNOWN",
    message: input.errorMessage || "보도자료 자동등록 실행이 실패했습니다.",
  });
}

export async function listAutoPressObservedRuns(options: {
  limit?: number;
  status?: string;
} = {}): Promise<AutoPressObservedRun[]> {
  const limit = clampLimit(options.limit, 30, 200);
  const params: unknown[] = [];
  const filters: string[] = [];
  if (options.status) {
    filters.push("status = ?");
    params.push(options.status);
  }
  params.push(limit);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT * FROM auto_press_runs
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY started_at DESC
     LIMIT ?`,
    params,
  );
  return rows.rows.map(observedRunFromRow);
}

export async function getAutoPressObservedRun(id: string): Promise<AutoPressObservedRun | null> {
  const row = await d1HttpFirst<Record<string, unknown>>(
    "SELECT * FROM auto_press_runs WHERE id = ? LIMIT 1",
    [id],
  );
  return row ? observedRunFromRow(row) : null;
}

export async function getAutoPressObservedItem(id: string): Promise<AutoPressObservedItem | null> {
  const row = await d1HttpFirst<Record<string, unknown>>(
    "SELECT * FROM auto_press_items WHERE id = ? LIMIT 1",
    [id],
  );
  return row ? observedItemFromRow(row) : null;
}

export async function listAutoPressObservedItems(options: {
  runId?: string;
  status?: string;
  limit?: number;
  order?: "asc" | "desc";
} = {}): Promise<AutoPressObservedItem[]> {
  const limit = clampLimit(options.limit, 100, AUTO_PRESS_ITEM_LIMIT_MAX);
  const order = options.order === "desc" ? "DESC" : "ASC";
  const params: unknown[] = [];
  const filters: string[] = [];
  if (options.runId) {
    filters.push("run_id = ?");
    params.push(options.runId);
  }
  if (options.status) {
    filters.push("status = ?");
    params.push(options.status);
  }
  params.push(limit);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT * FROM auto_press_items
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY created_at ${order}
     LIMIT ?`,
    params,
  );
  return rows.rows.map(observedItemFromRow);
}

export async function enqueueAutoPressObservedItemRetry(
  id: string,
  options: {
    reason?: string;
    nextAttemptAt?: string | null;
  } = {},
): Promise<AutoPressRetryQueueEntry | null> {
  const item = await getAutoPressObservedItem(id);
  if (!item) return null;
  if (!item.articleId && !item.articleNo) {
    throw new Error("등록된 기사 ID가 없어 AI 재편집 대기열에 넣을 수 없습니다. 먼저 기사 등록 여부를 확인하세요.");
  }

  const now = nowIso();
  const reasonCode = item.reasonCode || "AI_RETRY_PENDING";
  const reason = options.reason || "운영자가 기사별 결과 화면에서 AI 재편집을 다시 요청했습니다.";
  const queueId = `${item.id}_retry`;
  const nextAttemptAt = options.nextAttemptAt ?? null;

  await d1HttpQuery(
    `UPDATE auto_press_items
     SET retryable = 1,
         reason_code = ?,
         reason_message = ?,
         next_retry_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [reasonCode, reason, nextAttemptAt, now, item.id],
  );

  await d1HttpQuery(
    `INSERT INTO auto_press_retry_queue (
       id, run_id, item_id, article_id, article_no, title, source_url,
       source_name, status, reason_code, reason_message, attempts,
       max_attempts, next_attempt_at, payload_json, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0, 6, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       run_id = excluded.run_id,
       item_id = excluded.item_id,
       article_id = excluded.article_id,
       article_no = excluded.article_no,
       title = excluded.title,
       source_url = excluded.source_url,
       source_name = excluded.source_name,
       status = 'pending',
       reason_code = excluded.reason_code,
       reason_message = excluded.reason_message,
       next_attempt_at = excluded.next_attempt_at,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [
      queueId,
      item.runId,
      item.id,
      item.articleId || null,
      item.articleNo || null,
      item.title || "",
      item.sourceUrl || null,
      item.sourceName || null,
      reasonCode,
      reason,
      nextAttemptAt,
      safeJson({
        itemId: item.id,
        runId: item.runId,
        requestedBy: "admin",
        requestedAt: now,
      }),
      now,
    ],
  );

  await appendAutoPressObservedEvent({
    runId: item.runId,
    itemId: item.id,
    level: "warn",
    code: "AI_RETRY_PENDING",
    message: reason,
    metadata: { queueId, articleId: item.articleId, articleNo: item.articleNo },
  }).catch(() => undefined);

  return getAutoPressRetryQueueEntry(queueId);
}

export async function getAutoPressObservedRunDetail(id: string): Promise<AutoPressObservedRun | null> {
  const run = await getAutoPressObservedRun(id);
  if (!run) return null;
  run.items = await listAutoPressObservedItems({ runId: id, limit: AUTO_PRESS_ITEM_LIMIT_MAX });
  return run;
}

export async function cancelAutoPressObservedRun(
  id: string,
  reason = "운영자가 보도자료 자동등록 실행을 중단 표시했습니다.",
): Promise<AutoPressObservedRun | null> {
  const existing = await getAutoPressObservedRun(id);
  if (!existing) return null;
  if (!["queued", "running", "timeout"].includes(existing.status)) return existing;

  const now = nowIso();
  await d1HttpQuery(
    `UPDATE auto_press_runs
     SET status = 'cancelled',
         completed_at = COALESCE(completed_at, ?),
         last_event_at = ?,
         error_code = 'MANUAL_CANCELLED',
         error_message = ?,
         updated_at = ?
     WHERE id = ?
       AND status IN ('queued', 'running', 'timeout')`,
    [now, now, reason, now, id],
  );
  await appendAutoPressObservedEvent({
    runId: id,
    level: "warn",
    code: "MANUAL_CANCELLED",
    message: reason,
  }).catch(() => undefined);
  return getAutoPressObservedRun(id);
}

export async function listAutoPressObservedEvents(options: {
  runId: string;
  limit?: number;
}): Promise<AutoPressObservedEvent[]> {
  const limit = clampLimit(options.limit, 100, 500);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT * FROM auto_press_events
     WHERE run_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [options.runId, limit],
  );
  return rows.rows.map(observedEventFromRow);
}

export async function listAutoPressRetryQueue(options: {
  limit?: number;
  status?: string;
} = {}): Promise<AutoPressRetryQueueEntry[]> {
  const limit = clampLimit(options.limit, 50, 300);
  const params: unknown[] = [];
  const filters: string[] = [];
  if (options.status) {
    filters.push("status = ?");
    params.push(options.status);
  }
  params.push(limit);
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT * FROM auto_press_retry_queue
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY
       CASE status WHEN 'pending' THEN 0 WHEN 'running' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,
       next_attempt_at IS NULL,
       next_attempt_at ASC,
       created_at DESC
     LIMIT ?`,
    params,
  );
  return rows.rows.map(retryQueueFromRow);
}

export async function getAutoPressRetryQueueEntry(id: string): Promise<AutoPressRetryQueueEntry | null> {
  const row = await d1HttpFirst<Record<string, unknown>>(
    "SELECT * FROM auto_press_retry_queue WHERE id = ? LIMIT 1",
    [id],
  );
  return row ? retryQueueFromRow(row) : null;
}

export async function listDueAutoPressRetryQueue(options: {
  limit?: number;
  now?: string;
} = {}): Promise<AutoPressRetryQueueEntry[]> {
  const limit = clampLimit(options.limit, 5, 20);
  const now = options.now || nowIso();
  const rows = await d1HttpQuery<Record<string, unknown>>(
    `SELECT * FROM auto_press_retry_queue
     WHERE status IN ('pending', 'failed')
       AND attempts < max_attempts
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY
       next_attempt_at IS NULL,
       next_attempt_at ASC,
       created_at ASC
     LIMIT ?`,
    [now, limit],
  );
  return rows.rows.map(retryQueueFromRow);
}

export async function markAutoPressRetryQueueRunning(id: string): Promise<AutoPressRetryQueueEntry | null> {
  const now = nowIso();
  await d1HttpQuery(
    `UPDATE auto_press_retry_queue
     SET status = 'running',
         attempts = attempts + 1,
         last_attempt_at = ?,
         updated_at = ?
     WHERE id = ?
       AND status IN ('pending', 'failed')`,
    [now, now, id],
  );
  return getAutoPressRetryQueueEntry(id);
}

export async function completeAutoPressRetryQueueEntry(
  id: string,
  result: Record<string, unknown> = {},
): Promise<void> {
  const now = nowIso();
  await d1HttpQuery(
    `UPDATE auto_press_retry_queue
     SET status = 'completed',
         next_attempt_at = NULL,
         result_json = ?,
         updated_at = ?
     WHERE id = ?`,
    [safeJson(result), now, id],
  );
  await d1HttpQuery(
    `UPDATE auto_press_items
     SET status = 'ok',
         retryable = 0,
         reason_code = NULL,
         reason_message = NULL,
         updated_at = ?
     WHERE id = (SELECT item_id FROM auto_press_retry_queue WHERE id = ?)`,
    [now, id],
  );
}

export async function failAutoPressRetryQueueEntry(
  id: string,
  input: {
    error: string;
    status?: "failed" | "gave_up";
    nextAttemptAt?: string | null;
    result?: Record<string, unknown>;
  },
): Promise<void> {
  const now = nowIso();
  const status = input.status || "failed";
  await d1HttpQuery(
    `UPDATE auto_press_retry_queue
     SET status = ?,
         reason_message = ?,
         next_attempt_at = ?,
         result_json = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      status,
      input.error,
      input.nextAttemptAt || null,
      safeJson(input.result || { error: input.error }),
      now,
      id,
    ],
  );
  await d1HttpQuery(
    `UPDATE auto_press_items
     SET retry_count = retry_count + 1,
         next_retry_at = ?,
         reason_message = ?,
         retryable = CASE WHEN ? = 'gave_up' THEN 0 ELSE retryable END,
         updated_at = ?
     WHERE id = (SELECT item_id FROM auto_press_retry_queue WHERE id = ?)`,
    [
      input.nextAttemptAt || null,
      input.error,
      status,
      now,
      id,
    ],
  );
}

export async function cancelAutoPressRetryQueueEntry(
  id: string,
  reason = "운영자가 AI 재시도 대기열에서 취소했습니다.",
): Promise<void> {
  const now = nowIso();
  await d1HttpQuery(
    `UPDATE auto_press_retry_queue
     SET status = 'cancelled',
         reason_message = ?,
         next_attempt_at = NULL,
         result_json = ?,
         updated_at = ?
     WHERE id = ?`,
    [reason, safeJson({ cancelledAt: now, reason }), now, id],
  );
  await d1HttpQuery(
    `UPDATE auto_press_items
     SET retryable = 0,
         next_retry_at = NULL,
         reason_message = ?,
         updated_at = ?
     WHERE id = (SELECT item_id FROM auto_press_retry_queue WHERE id = ?)`,
    [reason, now, id],
  );
}

export async function resetAutoPressRetryQueueEntry(
  id: string,
  nextAttemptAt: string | null = null,
): Promise<void> {
  const now = nowIso();
  await d1HttpQuery(
    `UPDATE auto_press_retry_queue
     SET status = 'pending',
         next_attempt_at = ?,
         updated_at = ?
     WHERE id = ?
       AND status IN ('pending', 'failed', 'gave_up', 'cancelled')`,
    [nextAttemptAt, now, id],
  );
  await d1HttpQuery(
    `UPDATE auto_press_items
     SET retryable = 1,
         next_retry_at = ?,
         updated_at = ?
     WHERE id = (SELECT item_id FROM auto_press_retry_queue WHERE id = ?)`,
    [nextAttemptAt, now, id],
  );
}

export async function getAutoPressObservedSummary(): Promise<AutoPressObservedSummary> {
  const [running, staleRunning, retries, latest] = await Promise.all([
    d1HttpFirst<{ total?: number }>("SELECT COUNT(*) AS total FROM auto_press_runs WHERE status = 'running'", []),
    d1HttpFirst<{ total?: number }>(
      `SELECT COUNT(*) AS total
       FROM auto_press_runs
       WHERE status = 'running'
         AND COALESCE(last_event_at, started_at) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 minutes')`,
      [],
    ),
    d1HttpFirst<{ total?: number }>("SELECT COUNT(*) AS total FROM auto_press_retry_queue WHERE status = 'pending'", []),
    listAutoPressObservedRuns({ limit: 1 }),
  ]);
  return {
    runningCount: Number(running?.total || 0),
    staleRunningCount: Number(staleRunning?.total || 0),
    pendingRetryCount: Number(retries?.total || 0),
    latestRun: latest[0] || null,
  };
}
