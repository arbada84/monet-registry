import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logs: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db-server", () => ({
  serverGetViewLogs: mocks.logs,
  serverGetPublishedArticles: async () => [],
  serverGetSetting: async (_key: string, fallback: unknown) => fallback,
}));
vi.mock("@/lib/cloudflare-usage-report", () => ({ buildCloudflareUsageReportSection: async () => "" }));
vi.mock("@/lib/supabase-recovery-status", () => ({ buildSupabaseRecoveryReportSection: async () => "" }));
vi.mock("@/lib/auto-press-observability", () => ({
  getAutoPressObservedSummary: async () => null,
  listAutoPressSourceQuality: async () => [],
}));
vi.mock("@/lib/telegram-notify", () => ({ escapeTelegramHtml: (s: string) => s, sendTelegramMessage: vi.fn() }));

describe("daily report visitor identifiers are not pageviews or verified people", () => {
  const worker = readFileSync("cloudflare/auto-press-worker/src/index.js", "utf8");
  const helper = worker.slice(worker.indexOf("function formatDailyVisitorCount("), worker.indexOf("async function buildWorkerDailyTelegramReport("));
  const formatWorker = new Function("formatNumber", `${helper}; return formatDailyVisitorCount;`)((n: number) => String(n));
  beforeEach(() => mocks.logs.mockReset());

  it.each([
    [{ human_views: 0, human_visitors: 0, missing_visitor_keys: 0 }, "0"],
    [{ human_views: 4, human_visitors: 2, missing_visitor_keys: 0 }, "2"],
    [{ human_views: 4, human_visitors: 0, missing_visitor_keys: 4 }, "집계 불가 (식별값 누락)"],
    [{ human_views: 4, human_visitors: 2, missing_visitor_keys: 1 }, "집계 불가 (식별값 누락)"],
    [{ human_views: 4 }, "집계 불가 (식별값 누락)"],
  ])("Worker never substitutes PV for missing keys: %j", (row, expected) => {
    expect(formatWorker(row)).toBe(expected);
    expect(worker).not.toContain("traffic.human_visitors || traffic.human_views");
    expect(worker).toContain("AS missing_visitor_keys");
  });

  it.each([
    [[], "0", 0],
    [["a", "a", "b"], "2", 3],
    [[undefined, ""], "집계 불가 (식별값 누락)", 2],
    [["a", " "], "집계 불가 (식별값 누락)", 2],
  ])("Next report keeps missing identifiers separate from PV: %j", async (keys, expected, pv) => {
    mocks.logs.mockResolvedValue(keys.map((visitorKey) => ({ visitorKey, timestamp: "2026-10-15T03:00:00Z", isAdmin: false, isBot: false })));
    const { buildTelegramDailyReport } = await import("@/lib/telegram-report");
    const report = await buildTelegramDailyReport(new Date("2026-10-16T03:00:00Z"));
    expect(report).toContain(`기사 방문 식별값(추정): ${expected}`);
    expect(report).toContain(`비봇 분류 기사 조회 로그(PV): ${pv}`);
    expect(report).not.toContain("순수 방문자:");
  });
});
