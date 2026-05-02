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
    expect(text).toContain("/retry_queue - AI 재편집 대기열 조회");
    expect(text).toContain("/retry_ai [건수] - AI 재편집 대기열 처리 요청");
    expect(text).not.toContain("/article_off <id>");
  });
});
