import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const settingsStore = new Map<string, unknown>();
  const serverGetSetting = vi.fn(async <T>(key: string, fallback: T): Promise<T> => (
    settingsStore.has(key) ? settingsStore.get(key) as T : fallback
  ));
  const serverSaveSetting = vi.fn(async (key: string, value: unknown): Promise<void> => {
    settingsStore.set(key, value);
  });
  const runAutoPress = vi.fn(async () => ({
    id: "press_test",
    startedAt: "2026-05-02T09:00:00.000Z",
    completedAt: "2026-05-02T09:00:10.000Z",
    source: "manual" as const,
    preview: true,
    articlesPublished: 0,
    articlesPreviewed: 1,
    articlesSkipped: 0,
    articlesFailed: 0,
    articles: [{ title: "보도자료 미리보기", sourceUrl: "https://example.com", wrId: "1", boTable: "rss", status: "preview" as const }],
  }));
  const runAutoNews = vi.fn(async () => ({
    id: "news_test",
    startedAt: "2026-05-02T09:00:00.000Z",
    completedAt: "2026-05-02T09:00:10.000Z",
    source: "manual" as const,
    preview: true,
    articlesPublished: 0,
    articlesPreviewed: 1,
    articlesSkipped: 0,
    articlesFailed: 0,
    articles: [{ title: "자동 뉴스 미리보기", sourceUrl: "https://example.com", status: "preview" as const }],
  }));
  const processAutoPressRetryQueue = vi.fn(async () => ({
    message: "AI 편집 처리 완료: 성공 1, 실패 0, 포기 0",
    processed: 1,
    success: 1,
    failed: 0,
    skipped: 0,
    gaveUp: 0,
    waiting: 0,
    results: [{ id: "q1", title: "재편집 성공 기사", status: "success" as const, articleId: "101", targetType: "existing_article" as const, retryCount: 1 }],
  }));

  return { settingsStore, serverGetSetting, serverSaveSetting, runAutoPress, runAutoNews, processAutoPressRetryQueue };
});

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
  serverSaveSetting: mocks.serverSaveSetting,
  serverGetArticleById: vi.fn(),
  serverGetArticleByNo: vi.fn(),
  serverUpdateArticle: vi.fn(),
  serverDeleteArticle: vi.fn(),
}));
vi.mock("@/lib/admin-recovery-token", () => ({
  createAdminRecoveryLink: vi.fn(),
}));
vi.mock("@/app/api/cron/auto-press/route", () => ({ runAutoPress: mocks.runAutoPress }));
vi.mock("@/app/api/cron/auto-news/route", () => ({ runAutoNews: mocks.runAutoNews }));
vi.mock("@/lib/auto-press-retry-queue", () => ({ processAutoPressRetryQueue: mocks.processAutoPressRetryQueue }));

describe("telegram command actions", () => {
  beforeEach(() => {
    mocks.settingsStore.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores auto-press preview options behind a confirmation code", async () => {
    const { buildRunAutoPressRequest } = await import("@/lib/telegram-command-actions");

    const response = await buildRunAutoPressRequest("510397134", ["3", "preview", "draft"]);
    const pending = mocks.settingsStore.get("cp-telegram-command-pending") as Array<Record<string, unknown>>;

    expect(response).toContain("/confirm");
    expect(pending[0]).toMatchObject({
      action: "run_auto_press",
      payload: { count: 3, preview: true, statusOverride: "임시저장" },
    });
  });

  it("keeps auto-news live publishing locked unless explicitly enabled by env", async () => {
    const { buildRunAutoNewsRequest } = await import("@/lib/telegram-command-actions");

    const response = await buildRunAutoNewsRequest("510397134", ["1", "publish"]);

    expect(response).toContain("자동 뉴스 실제 발행은 잠겨 있습니다");
    expect(mocks.settingsStore.get("cp-telegram-command-pending")).toBeUndefined();
  });

  it("executes auto-news preview after confirmation", async () => {
    const { buildRunAutoNewsRequest, confirmTelegramAction } = await import("@/lib/telegram-command-actions");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      run: {
        id: "news_test",
        startedAt: "2026-05-02T09:00:00.000Z",
        completedAt: "2026-05-02T09:00:10.000Z",
        source: "manual",
        preview: true,
        articlesPublished: 0,
        articlesPreviewed: 1,
        articlesSkipped: 0,
        articlesFailed: 0,
        articles: [{ title: "자동 뉴스 미리보기", sourceUrl: "https://example.com", status: "preview" }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await buildRunAutoNewsRequest("510397134", ["1"]);
    const pending = mocks.settingsStore.get("cp-telegram-command-pending") as Array<{ id: string }>;
    const result = await confirmTelegramAction("510397134", pending[0].id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({ source: "manual", count: 1, preview: true });
    expect(result).toContain("자동 뉴스 발행 미리보기현황");
  });

  it("executes AI retry queue processing after confirmation", async () => {
    const { buildRunAiRetryRequest, confirmTelegramAction } = await import("@/lib/telegram-command-actions");

    await buildRunAiRetryRequest("510397134", ["2"]);
    const pending = mocks.settingsStore.get("cp-telegram-command-pending") as Array<{ id: string }>;
    const result = await confirmTelegramAction("510397134", pending[0].id);

    expect(mocks.processAutoPressRetryQueue).toHaveBeenCalledWith({ limit: 2 });
    expect(result).toContain("AI 편집 대기열 처리현황");
    expect(result).toContain("성공 · 기존 기사 재편집 #101");
  });
});
