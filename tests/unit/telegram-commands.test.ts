import { describe, expect, it, vi } from "vitest";

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
  listAutoPressRetryQueue: vi.fn(async () => []),
}));

describe("telegram commands", () => {
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
});
