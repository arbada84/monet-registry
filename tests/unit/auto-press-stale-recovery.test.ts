import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

describe("auto-press stale lease recovery", () => {
  it("never requeues an item that has published article evidence", async () => {
    // @ts-ignore mjs utility
    const { classifyStaleAutoPressItem } = await import("../../scripts/auto-press-stale-recovery.mjs");
    const item = { status: "running", lease_until: "2026-01-01T00:00:00Z", attempt_count: 1, max_attempts: 3 };
    expect(classifyStaleAutoPressItem({ ...item, article_id: "article-1" }, { nowMs: Date.parse("2026-07-21T00:00:00Z") }).action).toBe("ignore");
    expect(classifyStaleAutoPressItem(item, { publishedArticle: { id: "article-2", no: 2, status: "게시" }, nowMs: Date.parse("2026-07-21T00:00:00Z") }).action).toBe("reconcile_published");
  });

  it("holds deleted or unpublished references and prefers confirmed live article IDs", async () => {
    // @ts-ignore mjs utility
    const { classifyStaleAutoPressItem } = await import("../../scripts/auto-press-stale-recovery.mjs");
    const item = { status: "running", lease_until: "2026-01-01T00:00:00Z", article_id: "deleted", article_no: 1 };
    expect(classifyStaleAutoPressItem(item).eligible).toBe(false);
    expect(classifyStaleAutoPressItem(item, { publishedArticle: { id: "draft", status: "임시저장" } }).eligible).toBe(false);
    expect(classifyStaleAutoPressItem(item, { publishedArticle: { id: "deleted", status: "게시", deleted_at: "2026-10-17" } }).eligible).toBe(false);
    expect(classifyStaleAutoPressItem(item, { publishedArticle: { id: "live", no: 2, status: "게시" } })).toMatchObject({ articleId: "live", articleNo: 2 });
    const worker = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
    const body = worker.slice(worker.indexOf("function classifyExpiredLease("), worker.indexOf("async function findPublishedArticleForExpiredItem("));
    const classifyWorker = new Function(`${body}; return classifyExpiredLease;`)();
    expect(classifyWorker(item).action).toBe("ignore");
    expect(classifyWorker(item, { id: "draft", status: "임시저장" }).action).toBe("ignore");
    expect(classifyWorker(item, { id: "deleted", status: "게시", deleted_at: "2026-10-17" }).action).toBe("ignore");
    expect(classifyWorker(item, { id: "live", no: 2, status: "게시" })).toMatchObject({ articleId: "live", articleNo: 2 });
    expect(worker).toContain('if (classification.action === "ignore") continue;');
  });

  it("does not use a soft-deleted article as backup reconciliation evidence", async () => {
    // @ts-ignore mjs utility
    const { buildStaleRecoveryReport } = await import("../../scripts/auto-press-stale-recovery.mjs");
    const report = buildStaleRecoveryReport({
      backupDir: "/fixture/backup",
      items: [{ id: "item", status: "running", lease_until: "2026-01-01", article_id: "gone" }],
      articles: [{ id: "gone", status: "게시", deleted_at: "2026-10-17" }],
    });
    expect(report.candidates).toEqual([]);
  });

  it.each([
    { status: "게시", deleted_at: "2026-10-17" },
    { status: "임시저장", deleted_at: null },
  ])("holds source-only matches with non-public article evidence: %s", async (evidence) => {
    // @ts-ignore mjs utility
    const { buildStaleRecoveryReport } = await import("../../scripts/auto-press-stale-recovery.mjs");
    const report = buildStaleRecoveryReport({
      backupDir: "/fixture/backup",
      items: [{ id: "item", status: "running", lease_until: "2026-01-01", source_url: "https://example.test/release" }],
      articles: [{ id: "gone", source_url: "https://example.test/release?utm_source=old", ...evidence }],
    });
    expect(report.candidates).toEqual([]);
    expect(report.counts.requeue).toBe(0);
  });

  it("retains deleted-source evidence in both live lookup paths", async () => {
    const deleted = { id: "gone", no: 3, status: "게시", deleted_at: "2026-10-17" };
    const item = { status: "running", source_url: "https://example.test/release", lease_until: "2026-01-01" };
    // @ts-ignore mjs utility
    const { livePublishedArticle, classifyStaleAutoPressItem } = await import("../../scripts/auto-press-stale-recovery.mjs");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, result: [{ success: true, results: [deleted] }] }), { status: 200 })));
    try {
      const article = await livePublishedArticle({ accountId: "test", databaseId: "test", token: "test-only" }, item);
      expect(article).toEqual(deleted);
      expect(classifyStaleAutoPressItem(item, { publishedArticle: article }).action).toBe("ignore");
    } finally { vi.unstubAllGlobals(); }
    const worker = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
    const body = worker.slice(worker.indexOf("async function findPublishedArticleForExpiredItem("), worker.indexOf("async function recoverExpiredLeases("));
    const lookup = new Function("normalizeSourceUrl", `${body}; return findPublishedArticleForExpiredItem;`)((value: unknown) => String(value || ""));
    const sqls: string[] = [];
    const env = { DB: { prepare: (sql: string) => { sqls.push(sql); return { bind: () => ({ first: async () => deleted }) }; } } };
    expect(await lookup(env, item)).toEqual(deleted);
    expect(sqls).toHaveLength(1);
    expect(sqls[0]).toContain("ORDER BY CASE WHEN status = '게시' AND deleted_at IS NULL");
  });

  it("requeues below max attempts and fails at max attempts", async () => {
    // @ts-ignore mjs utility
    const { classifyStaleAutoPressItem } = await import("../../scripts/auto-press-stale-recovery.mjs");
    const base = { status: "running", lease_until: "2026-01-01T00:00:00Z", max_attempts: 3 };
    expect(classifyStaleAutoPressItem({ ...base, attempt_count: 2 }, { nowMs: Date.parse("2026-07-21T00:00:00Z") }).action).toBe("requeue");
    expect(classifyStaleAutoPressItem({ ...base, attempt_count: 3 }, { nowMs: Date.parse("2026-07-21T00:00:00Z") }).action).toBe("mark_failed");
  });

  it("binds a dry-run report ID to its candidate content", async () => {
    // @ts-ignore mjs utility
    const { buildStaleRecoveryReport, staleRecoveryReportId } = await import("../../scripts/auto-press-stale-recovery.mjs");
    const report = buildStaleRecoveryReport({
      backupDir: "/fixture/backup",
      now: new Date("2026-07-21T00:00:00Z"),
      items: [{ id: "item-1", status: "running", lease_until: "2026-01-01T00:00:00Z", attempt_count: 1, max_attempts: 3 }],
      articles: [],
    });
    expect(staleRecoveryReportId(report)).toBe(report.reportId);
    expect(staleRecoveryReportId({ ...report, candidates: [{ ...report.candidates[0], action: "reconcile_published" }] })).not.toBe(report.reportId);
  });

  it("keeps automatic sweeping disabled with a 24-hour observation window", () => {
    const workerConfig = readFileSync("cloudflare/auto-press-worker/wrangler.toml", "utf8");
    const worker = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
    expect(workerConfig).toContain('AUTO_PRESS_STALE_LEASE_RECOVERY_ENABLED = "false"');
    expect(workerConfig).toContain('AUTO_PRESS_STALE_LEASE_OBSERVATION_HOURS = "24"');
    expect(worker).toContain("recoverExpiredLeasesWithObservationWindow");
    expect(workerConfig).toContain('dead_letter_queue = "auto-press-jobs-dlq"');
  });
});
