import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db-server", () => ({
  serverGetPublishedArticles: vi.fn(async () => []),
  serverGetSetting: vi.fn(async () => []),
  serverGetViewLogs: vi.fn(async () => []),
}));
vi.mock("@/lib/cloudflare-usage-report", () => ({
  buildCloudflareUsageReportSection: vi.fn(async () => ""),
}));
vi.mock("@/lib/supabase-recovery-status", () => ({
  buildSupabaseRecoveryReportSection: vi.fn(async () => ""),
}));
vi.mock("@/lib/telegram-notify", async () => {
  const actual = await vi.importActual<typeof import("@/lib/telegram-notify")>("@/lib/telegram-notify");
  return {
    escapeTelegramHtml: actual.escapeTelegramHtml,
    sendTelegramMessage: vi.fn(async () => true),
  };
});
vi.mock("@/lib/auto-press-observability", () => ({
  getAutoPressDeadLetterSummary: vi.fn(async () => ({
    total: 4,
    workerProcessFailed: 1,
    imageUploadFailed: 1,
    aiIssue: 2,
    bodyIssue: 0,
    duplicateIssue: 0,
    other: 0,
  })),
  getAutoPressObservedSummary: vi.fn(async () => ({
    runningCount: 1,
    staleRunningCount: 1,
    queuedItemCount: 7,
    queuedDueCount: 2,
    queuedDelayedCount: 5,
    queuedDailyLimitCount: 3,
    pendingRetryCount: 5,
    latestRun: {
      id: "press_latest",
      source: "cron",
      status: "failed",
      preview: false,
      requestedCount: 10,
      processedCount: 10,
      publishedCount: 3,
      previewedCount: 0,
      skippedCount: 4,
      failedCount: 3,
      queuedCount: 0,
      startedAt: "2026-05-14T00:00:00.000Z",
    },
  })),
  listAutoPressSourceQuality: vi.fn(async () => [
    {
      sourceId: "newswire",
      sourceName: "뉴스와이어",
      totalCount: 10,
      publishedCount: 3,
      skippedCount: 2,
      failedCount: 5,
      queuedCount: 0,
      runningCount: 0,
      previewCount: 0,
      noImageCount: 1,
      duplicateCount: 1,
      bodyUnavailableCount: 1,
      bodyTooShortCount: 0,
      aiInvalidCount: 2,
      timeBudgetCount: 0,
      processedCount: 10,
      publishRate: 0.3,
      exclusionRate: 0.2,
      avgBodyChars: 900,
      avgImageCount: 1,
      recommendation: "review",
      recommendationLabel: "소스 점검",
      recommendationReason: "등록 성공률이 낮습니다.",
    },
  ]),
}));

describe("telegram daily report", () => {
  it("includes auto-press run, retry queue, DLQ, source quality, and Korean actions", async () => {
    const { buildTelegramDailyReport } = await import("@/lib/telegram-report");

    const text = await buildTelegramDailyReport(new Date("2026-05-15T00:30:00.000Z"));

    expect(text).toContain("[일일 리포트] 컬처피플 운영 요약");
    expect(text).toContain("보도자료 Worker 대기: 7 / AI 재시도 대기: 5 / 멈춤 의심: 1");
    expect(text).toContain("최근 D1 실행: 실패 / 등록 3 / 실패 3");
    expect(text).toContain("실패함(DLQ): 전체 4 / AI 2 / 이미지 1 / 본문 0 / Worker 1");
    expect(text).toContain("소스 등록률 TOP: 뉴스와이어 30% (3/10)");
    expect(text).toContain("점검 소스: 뉴스와이어: 소스 점검");
    expect(text).toContain("조치: /auto_press_dlq, /retry_queue, /auto_press_sources");
  });
});
