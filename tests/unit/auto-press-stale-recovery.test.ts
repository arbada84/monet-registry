import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
    expect(classifyStaleAutoPressItem(item, { publishedArticle: { id: "live", no: 2, status: "게시" } })).toMatchObject({ articleId: "live", articleNo: 2 });
    const worker = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
    const body = worker.slice(worker.indexOf("function classifyExpiredLease("), worker.indexOf("async function findPublishedArticleForExpiredItem("));
    const classifyWorker = new Function(`${body}; return classifyExpiredLease;`)();
    expect(classifyWorker(item).action).toBe("ignore");
    expect(classifyWorker(item, { id: "draft", status: "임시저장" }).action).toBe("ignore");
    expect(classifyWorker(item, { id: "live", no: 2, status: "게시" })).toMatchObject({ articleId: "live", articleNo: 2 });
    expect(worker).toContain('if (classification.action === "ignore") continue;');
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
