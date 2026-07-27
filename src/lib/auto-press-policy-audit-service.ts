import "server-only";

import { d1HttpFirst, d1HttpQuery } from "@/lib/d1-http-client";
import { getAutoPressBlockedSubjectMatch, type AutoPressContentPolicyInput } from "@/lib/auto-press-content-policy";
import { findAuditByIdempotency, getPolicyBundle, getPolicyState, writePolicyAudit } from "@/lib/auto-press-policy-repository";
import { sha256Hex } from "@/lib/auto-press-policy-schema";
import type { PolicyActor } from "@/lib/auto-press-policy-auth";

const MAX_RESULTS = 500;
const PUBLIC_INTEREST = /피해|고발|비판|논란|재판|판결|수사|기소|구속|탈퇴|증언|예방|지원|상담|공익|주의|경고/i;
const PROMOTIONAL = /개최|모집|출시|오픈|초청|행사|세미나|공연|전시|캠페인|후원|협약|보도자료/i;

interface CandidateRow {
  id: string;
  no?: number | null;
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  tags?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  raw_json?: string | null;
  payload_json?: string | null;
  status?: string | null;
  created_at?: string | null;
  ai_generated?: number | null;
}

export interface PolicyAuditResult {
  store: "articles" | "queue" | "retry";
  recordId: string;
  articleNo: number | null;
  title: string;
  classification: "promotional_candidate" | "official_domain" | "mention_review" | "public_interest_review" | "queue_candidate";
  subjectId: string;
  matchType: string;
  matchedField: string;
  snippet: string;
}

function safeJson(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sqlLiteral(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function candidateInput(row: CandidateRow): AutoPressContentPolicyInput {
  const payload = { ...safeJson(row.raw_json), ...safeJson(row.payload_json) };
  return {
    title: row.title || payload.title,
    summary: row.summary || payload.summary,
    bodyText: row.body || payload.bodyText || payload.body,
    tags: row.tags || payload.tags,
    sourceUrl: row.source_url || payload.sourceUrl,
    sourceName: row.source_name || payload.sourceName,
    keywords: Array.isArray(payload.keywords) ? payload.keywords : [],
  };
}

function compactSnippet(input: AutoPressContentPolicyInput, rule?: string): string {
  const text = [input.title, input.summary, input.bodyText].map((value) => String(value || "")).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const needle = String(rule || "").split(" + ")[0];
  const index = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  const start = Math.max(0, (index < 0 ? 0 : index) - 60);
  return text.slice(start, start + 160);
}

function classify(store: PolicyAuditResult["store"], row: CandidateRow, input: AutoPressContentPolicyInput, matchType?: string) {
  if (store !== "articles") return "queue_candidate" as const;
  if (matchType === "domain") return "official_domain" as const;
  const context = [input.title, input.summary, input.bodyText].map((value) => String(value || "")).join(" ");
  if (PUBLIC_INTEREST.test(context)) return "public_interest_review" as const;
  if (Number(row.ai_generated || 0) === 1 && PROMOTIONAL.test(context)) return "promotional_candidate" as const;
  return "mention_review" as const;
}

function mapRows(
  store: PolicyAuditResult["store"],
  rows: CandidateRow[],
  subjects: NonNullable<Awaited<ReturnType<typeof getPolicyBundle>>>["subjects"],
): PolicyAuditResult[] {
  const policy = { subjects: subjects.filter((subject) => subject.status === "active") };
  const results: PolicyAuditResult[] = [];
  for (const row of rows) {
    const input = candidateInput(row);
    const match = getAutoPressBlockedSubjectMatch(input, policy);
    if (!match.blocked || !match.subjectId) continue;
    results.push({
      store,
      recordId: row.id,
      articleNo: row.no == null ? null : Number(row.no),
      title: String(row.title || "(제목 없음)").slice(0, 300),
      classification: classify(store, row, input, match.matchType),
      subjectId: match.subjectId,
      matchType: match.matchType || "term",
      matchedField: match.matchedField || "title",
      snippet: compactSnippet(input, match.rule),
    });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

export async function runPolicyDryAudit(options: {
  version?: number;
  days?: number;
  actor: PolicyActor;
  idempotencyKey: string;
}) {
  const replay = await findAuditByIdempotency(options.idempotencyKey);
  const replaySummary = replay?.summary_json ? safeJson(replay.summary_json) : {};
  if (typeof replaySummary.reportId === "string") {
    const existing = await getPolicyDryAuditReport(replaySummary.reportId);
    return {
      reportId: existing.report.id,
      version: existing.report.policyVersion,
      checksum: existing.report.reportChecksum,
      counts: existing.report.summary,
      results: existing.results,
      replayed: true,
    };
  }
  const running = await d1HttpFirst<{ id: string }>(
    "SELECT id FROM auto_press_policy_reports WHERE state='running' AND expires_at > ? LIMIT 1",
    [new Date().toISOString()],
  );
  if (running) throw Object.assign(new Error("다른 편집정책 감사가 실행 중입니다."), { status: 423 });
  const state = await getPolicyState();
  const version = options.version || state?.publishedVersion;
  if (!version) throw Object.assign(new Error("Published policy version is unavailable."), { status: 409 });
  const bundle = await getPolicyBundle(version);
  if (!bundle?.version.checksum) throw Object.assign(new Error("Policy version must be validated before audit."), { status: 422 });
  const days = Math.min(Math.max(options.days || 183, 1), 365);
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const reportId = `policy-report-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 90 * 86400_000).toISOString();
  await d1HttpQuery(
    `INSERT INTO auto_press_policy_reports
      (id, policy_version, checksum, state, scope_json, created_by, created_at, expires_at)
     VALUES (?, ?, ?, 'running', ?, ?, ?, ?)`,
    [reportId, version, bundle.version.checksum, JSON.stringify({ days, cutoff, limit: MAX_RESULTS }), options.actor.name, createdAt, expiresAt],
  );

  try {
    const [articles, queue, retry] = await Promise.all([
      d1HttpQuery<CandidateRow>(
        `SELECT id, no, title, summary, body, tags, source_url, status, created_at, ai_generated
           FROM articles
          WHERE deleted_at IS NULL AND status = '게시' AND COALESCE(date, created_at) >= ?
          ORDER BY COALESCE(date, created_at) DESC LIMIT 300`,
        [cutoff],
      ),
      d1HttpQuery<CandidateRow>(
        `SELECT id, title, source_url, source_name, raw_json, status, created_at
           FROM auto_press_items
          WHERE status IN ('queued', 'running', 'fail') AND created_at >= ?
          ORDER BY created_at DESC LIMIT 100`,
        [cutoff],
      ),
      d1HttpQuery<CandidateRow>(
        `SELECT id, title, source_url, source_name, payload_json, status, created_at
           FROM auto_press_retry_queue
          WHERE status IN ('pending', 'running', 'failed') AND created_at >= ?
          ORDER BY created_at DESC LIMIT 100`,
        [cutoff],
      ),
    ]);
    const results = [
      ...mapRows("articles", articles.rows, bundle.subjects),
      ...mapRows("queue", queue.rows, bundle.subjects),
      ...mapRows("retry", retry.rows, bundle.subjects),
    ].slice(0, MAX_RESULTS);
    const counts = results.reduce<Record<string, number>>((acc, item) => {
      acc[item.classification] = (acc[item.classification] || 0) + 1;
      return acc;
    }, {});
    for (let start = 0; start < results.length; start += 50) {
      const values = results.slice(start, start + 50).map((item, index) => `(
        ${sqlLiteral(reportId)}, ${start + index}, ${sqlLiteral(item.store)}, ${sqlLiteral(item.recordId)},
        ${sqlLiteral(item.articleNo)}, ${sqlLiteral(item.title)}, ${sqlLiteral(item.classification)},
        ${sqlLiteral(item.subjectId)}, ${sqlLiteral(item.matchType)}, ${sqlLiteral(item.matchedField)},
        ${sqlLiteral(item.snippet)}, ${sqlLiteral(createdAt)}
      )`);
      await d1HttpQuery(
        `INSERT INTO auto_press_policy_report_results
          (report_id, ordinal, store, record_id, article_no, title, classification, subject_id,
           match_type, matched_field, snippet, created_at)
         VALUES ${values.join(",")}`,
      );
    }
    const reportChecksum = await sha256Hex({ reportId, version, cutoff, results });
    await d1HttpQuery(
      `UPDATE auto_press_policy_reports
          SET state='complete', summary_json=?, result_count=?, artifact_checksum=?, completed_at=?
        WHERE id=?`,
      [JSON.stringify(counts), results.length, reportChecksum, new Date().toISOString(), reportId],
    );
    await writePolicyAudit({
      event: "dry_run",
      version,
      actor: options.actor,
      idempotencyKey: options.idempotencyKey,
      afterChecksum: reportChecksum,
      summary: { reportId, days, resultCount: results.length, counts },
    });
    return { reportId, version, checksum: reportChecksum, counts, results };
  } catch (error) {
    await d1HttpQuery(
      "UPDATE auto_press_policy_reports SET state='failed', summary_json=?, completed_at=? WHERE id=?",
      [JSON.stringify({ errorCode: "AUDIT_FAILED" }), new Date().toISOString(), reportId],
    ).catch(() => undefined);
    throw error;
  }
}

export async function getPolicyDryAuditReport(reportId: string, limit = 50, offset = 0) {
  const report = await d1HttpFirst<{
    id: string; policy_version: number; checksum: string; state: string; scope_json: string;
    summary_json: string | null; result_count: number; artifact_key: string | null;
    artifact_checksum: string | null; created_by: string; created_at: string; expires_at: string; completed_at: string | null;
  }>("SELECT * FROM auto_press_policy_reports WHERE id=? LIMIT 1", [reportId]);
  if (!report) throw Object.assign(new Error("Audit report not found."), { status: 404 });
  const results = await d1HttpQuery(
    `SELECT ordinal, store, record_id, article_no, title, classification, subject_id,
            match_type, matched_field, snippet, created_at
       FROM auto_press_policy_report_results
      WHERE report_id=? ORDER BY ordinal ASC LIMIT ? OFFSET ?`,
    [reportId, Math.min(Math.max(limit, 1), 100), Math.max(offset, 0)],
  );
  return {
    report: {
      id: report.id,
      policyVersion: Number(report.policy_version),
      checksum: report.checksum,
      state: report.state,
      scope: JSON.parse(report.scope_json),
      summary: report.summary_json ? JSON.parse(report.summary_json) : {},
      resultCount: Number(report.result_count),
      reportChecksum: report.artifact_checksum,
      createdBy: report.created_by,
      createdAt: report.created_at,
      expiresAt: report.expires_at,
      completedAt: report.completed_at,
    },
    results: results.rows,
  };
}

export async function cancelPolicyReportQueueItems(options: {
  reportId: string;
  reportChecksum: string;
  recordKeys: string[];
  confirmation: string;
  actor: PolicyActor;
  idempotencyKey: string;
}) {
  const replay = await findAuditByIdempotency(options.idempotencyKey);
  if (replay?.event === "queue_cancel") {
    return { replayed: true, summary: safeJson(replay.summary_json) };
  }
  const keys = [...new Set(options.recordKeys.map((key) => String(key).trim()).filter((key) => /^(queue|retry):.+/.test(key)))];
  if (!keys.length || keys.length > 50) {
    throw Object.assign(new Error("큐 취소는 1~50건만 선택할 수 있습니다."), { status: 422 });
  }
  if (options.confirmation !== `QUEUE CANCEL ${keys.length}`) {
    throw Object.assign(new Error(`확인문구 'QUEUE CANCEL ${keys.length}'이 필요합니다.`), { status: 422 });
  }
  const report = await getPolicyDryAuditReport(options.reportId, 1, 0);
  if (
    report.report.state !== "complete"
    || !report.report.reportChecksum
    || report.report.reportChecksum !== options.reportChecksum
    || new Date(report.report.expiresAt).getTime() <= Date.now()
  ) {
    throw Object.assign(new Error("최신 검증 보고서와 checksum이 필요합니다."), { status: 409 });
  }
  const state = await getPolicyState();
  const bundle = await getPolicyBundle(report.report.policyVersion);
  if (
    !state
    || state.publishedVersion !== report.report.policyVersion
    || !bundle?.version.checksum
    || bundle.version.checksum !== report.report.checksum
  ) {
    throw Object.assign(new Error("보고서 생성 후 운영 정책이 변경됐습니다. 감사를 다시 실행하세요."), { status: 409 });
  }
  const placeholders = keys.map(() => "?").join(",");
  const selected = await d1HttpQuery<{ store: "queue" | "retry"; record_id: string; classification: string }>(
    `SELECT store, record_id, classification
       FROM auto_press_policy_report_results
      WHERE report_id=? AND (store || ':' || record_id) IN (${placeholders})`,
    [options.reportId, ...keys],
  );
  if (
    selected.rows.length !== keys.length
    || selected.rows.some((row) => !["queue", "retry"].includes(row.store) || row.classification !== "queue_candidate")
  ) {
    throw Object.assign(new Error("보고서의 검증된 queue/retry 후보만 취소할 수 있습니다."), { status: 422 });
  }

  const policy = { subjects: bundle.subjects.filter((subject) => subject.status === "active") };
  let cancelledQueue = 0;
  let cancelledRetry = 0;
  const now = new Date().toISOString();
  for (const selectedItem of selected.rows) {
    const row = selectedItem.store === "queue"
      ? await d1HttpFirst<CandidateRow>(
          `SELECT id, title, source_url, source_name, raw_json, status, created_at
             FROM auto_press_items WHERE id=? AND status IN ('queued', 'running', 'fail') LIMIT 1`,
          [selectedItem.record_id],
        )
      : await d1HttpFirst<CandidateRow>(
          `SELECT id, title, source_url, source_name, payload_json, status, created_at
             FROM auto_press_retry_queue WHERE id=? AND status IN ('pending', 'running', 'failed') LIMIT 1`,
          [selectedItem.record_id],
        );
    if (!row || !getAutoPressBlockedSubjectMatch(candidateInput(row), policy).blocked) {
      throw Object.assign(new Error("선택 항목이 변경됐거나 더 이상 정책에 일치하지 않습니다."), { status: 409 });
    }
    if (selectedItem.store === "queue") {
      await d1HttpQuery(
        `UPDATE auto_press_items
            SET status='skip', reason_code='BLOCKED_SUBJECT',
                reason_message='운영 편집정책에 따라 자동등록하지 않음', retryable=0,
                next_retry_at=NULL, lease_until=NULL, completed_at=COALESCE(completed_at, ?), updated_at=?
          WHERE id=? AND status IN ('queued', 'running', 'fail')`,
        [now, now, row.id],
      );
      cancelledQueue += 1;
    } else {
      await d1HttpQuery(
        `UPDATE auto_press_retry_queue
            SET status='cancelled', reason_code='BLOCKED_SUBJECT',
                reason_message='운영 편집정책에 따라 자동등록하지 않음',
                next_attempt_at=NULL, updated_at=?
          WHERE id=? AND status IN ('pending', 'running', 'failed')`,
        [now, row.id],
      );
      cancelledRetry += 1;
    }
  }
  const summary = { reportId: options.reportId, cancelledQueue, cancelledRetry, total: keys.length };
  await writePolicyAudit({
    event: "queue_cancel",
    version: report.report.policyVersion,
    actor: options.actor,
    idempotencyKey: options.idempotencyKey,
    beforeChecksum: report.report.reportChecksum,
    summary,
  });
  return { replayed: false, summary };
}
