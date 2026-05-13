import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

vi.mock("@/lib/db-server", () => ({
  serverGetPublishedArticles: vi.fn(),
  serverGetSetting: vi.fn(),
  serverGetViewLogs: vi.fn(),
  serverDeleteArticle: vi.fn(),
  serverGetArticleById: vi.fn(),
  serverGetArticleByNo: vi.fn(),
  serverSaveSetting: vi.fn(),
  serverUpdateArticle: vi.fn(),
}));
vi.mock("@/lib/cloudflare-usage-report", () => ({
  buildCloudflareUsageReportSection: vi.fn(),
}));
vi.mock("@/lib/telegram-report", () => ({
  buildTelegramDailyReport: vi.fn(),
}));
vi.mock("@/lib/auto-press-observability", () => ({
  getAutoPressObservedSummary: vi.fn(async () => ({
    runningCount: 0,
    staleRunningCount: 0,
    queuedItemCount: 0,
    queuedDueCount: 0,
    queuedDelayedCount: 0,
    queuedDailyLimitCount: 0,
    pendingRetryCount: 0,
    latestRun: null,
  })),
  listAutoPressObservedItems: vi.fn(async () => []),
  listAutoPressRetryQueue: vi.fn(async () => []),
  listAutoPressSourceQuality: vi.fn(async () => []),
}));

describe("telegram commands", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("escapes placeholder brackets in help text for Telegram HTML mode", async () => {
    const { buildTelegramCommandResponse } = await import("@/lib/telegram-commands");

    const text = await buildTelegramCommandResponse("/help", "510397134");

    expect(text).toContain("/article_off &lt;id&gt;");
    expect(text).toContain("/article_delete &lt;id&gt;");
    expect(text).toContain("/retry_queue - AI 편집 대기열 조회");
    expect(text).toContain("/retry_ai [건수] - AI 편집 대기열 처리 요청");
    expect(text).not.toContain("/article_off <id>");
  });

  it("shows whether retry queue items will create new articles or re-edit existing articles", async () => {
    const { listAutoPressRetryQueue } = await import("@/lib/auto-press-observability");
    vi.mocked(listAutoPressRetryQueue).mockResolvedValueOnce([
      {
        id: "q1",
        title: "새 보도자료 후보",
        status: "pending",
        reasonCode: "AI_RESPONSE_INVALID",
        reasonMessage: "AI 편집 실패",
        attempts: 0,
        maxAttempts: 6,
        payload: { result: { retryPayload: { type: "auto_press_unpublished" } } },
      },
      {
        id: "q2",
        articleId: "101",
        articleNo: 101,
        title: "기존 기사",
        status: "failed",
        reasonCode: "NO_AI_KEY",
        reasonMessage: "AI API 키 없음",
        attempts: 1,
        maxAttempts: 6,
      },
    ]);
    const { buildTelegramCommandResponse } = await import("@/lib/telegram-commands");

    const text = await buildTelegramCommandResponse("/retry_queue", "510397134");

    expect(text).toContain("AI 편집 대기열");
    expect(text).toContain("신규 등록 대기 1건 / 기존 기사 재편집 1건");
    expect(text).toContain("대기 · 신규 등록 대기: 새 보도자료 후보");
    expect(text).toContain("실패 · 기존 기사 재편집: 기존 기사");
  });

  it("shows daily-limit and retry timing details for the auto-press queue command", async () => {
    const { getAutoPressObservedSummary, listAutoPressObservedItems } = await import("@/lib/auto-press-observability");
    vi.mocked(getAutoPressObservedSummary).mockResolvedValueOnce({
      runningCount: 0,
      staleRunningCount: 0,
      queuedItemCount: 19,
      queuedDueCount: 0,
      queuedDelayedCount: 19,
      queuedDailyLimitCount: 19,
      nextQueuedRetryAt: "2026-05-13T22:52:01.838Z",
      pendingRetryCount: 0,
      latestRun: null,
    });
    vi.mocked(listAutoPressObservedItems).mockResolvedValueOnce([
      {
        id: "item_1",
        runId: "press_1",
        title: "한도 대기 보도자료",
        sourceName: "뉴스와이어",
        status: "queued",
        reasonCode: "DAILY_LIMIT_REACHED",
        reasonMessage: "일일 AI 호출 상한에 도달했습니다.",
        retryable: true,
        retryCount: 2,
        nextRetryAt: "2026-05-13T22:52:01.838Z",
        bodyChars: 900,
        imageCount: 1,
      },
    ]);
    const { buildTelegramCommandResponse } = await import("@/lib/telegram-commands");

    const text = await buildTelegramCommandResponse("/auto_press_queue", "510397134");

    expect(text).toContain("예약 대기 19건 / 즉시 처리 가능 0건 / 일일 한도 대기 19건");
    expect(text).toContain("다음 재시도:");
    expect(text).toContain("한도 대기 보도자료 · 뉴스와이어 - 일일 AI 호출 상한에 도달했습니다.");
    expect(text).toContain("/process_auto_press 3");
  });
});
