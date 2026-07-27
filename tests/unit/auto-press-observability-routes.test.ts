import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  getAutoPressObservedSummary: vi.fn(),
  listAutoPressObservedRuns: vi.fn(),
  listAutoPressObservedItems: vi.fn(),
  listAutoPressDeadLetterItems: vi.fn(),
  getAutoPressDeadLetterSummary: vi.fn(),
  requeueAutoPressDeadLetterItem: vi.fn(),
  discardAutoPressDeadLetterItem: vi.fn(),
  listAutoPressObservedEvents: vi.fn(),
  listAutoPressRetryQueue: vi.fn(),
  getAutoPressObservedRunDetail: vi.fn(),
  appendAutoPressObservedEvent: vi.fn(),
  reconcileAutoPressObservedRuns: vi.fn(),
  serverGetSetting: vi.fn(),
  serverGetArticleById: vi.fn(),
  serverGetAiSettings: vi.fn(),
  resolveAiApiKey: vi.fn(),
  getDatabaseProviderStatus: vi.fn(),
  checkMediaStorageHealth: vi.fn(),
  summarizeMediaStorageHealth: vi.fn(),
  getAutoPressRetrySchedulerHealth: vi.fn(),
  runAutoPressRetryScheduler: vi.fn(),
  runAutoPress: vi.fn(),
  notifyTelegramArticleRegistered: vi.fn(),
  notifyTelegramAutoPublishRun: vi.fn(),
  notifyTelegramAutoPressRetryQueue: vi.fn(),
  dispatchAutoPressWorker: vi.fn(),
  publishArticleToPortals: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/cookie-auth", () => ({
  isAuthenticated: mocks.isAuthenticated,
  timingSafeEqual: (a: string, b: string) => a === b,
}));

vi.mock("@/lib/auto-press-observability", () => ({
  getAutoPressObservedSummary: mocks.getAutoPressObservedSummary,
  listAutoPressObservedRuns: mocks.listAutoPressObservedRuns,
  listAutoPressObservedItems: mocks.listAutoPressObservedItems,
  listAutoPressDeadLetterItems: mocks.listAutoPressDeadLetterItems,
  getAutoPressDeadLetterSummary: mocks.getAutoPressDeadLetterSummary,
  requeueAutoPressDeadLetterItem: mocks.requeueAutoPressDeadLetterItem,
  discardAutoPressDeadLetterItem: mocks.discardAutoPressDeadLetterItem,
  listAutoPressObservedEvents: mocks.listAutoPressObservedEvents,
  listAutoPressRetryQueue: mocks.listAutoPressRetryQueue,
  getAutoPressObservedRunDetail: mocks.getAutoPressObservedRunDetail,
  appendAutoPressObservedEvent: mocks.appendAutoPressObservedEvent,
  reconcileAutoPressObservedRuns: mocks.reconcileAutoPressObservedRuns,
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
  serverGetArticleById: mocks.serverGetArticleById,
}));

vi.mock("@/lib/ai-settings-server", () => ({
  serverGetAiSettings: mocks.serverGetAiSettings,
  resolveAiApiKey: mocks.resolveAiApiKey,
}));

vi.mock("@/lib/database-provider", () => ({
  getDatabaseProviderStatus: mocks.getDatabaseProviderStatus,
}));

vi.mock("@/lib/media-storage-health", () => ({
  checkMediaStorageHealth: mocks.checkMediaStorageHealth,
  summarizeMediaStorageHealth: mocks.summarizeMediaStorageHealth,
}));

vi.mock("@/lib/auto-press-retry-scheduler", () => ({
  getAutoPressRetrySchedulerHealth: mocks.getAutoPressRetrySchedulerHealth,
  runAutoPressRetryScheduler: mocks.runAutoPressRetryScheduler,
}));

vi.mock("@/app/api/cron/auto-press/route", () => ({
  runAutoPress: mocks.runAutoPress,
}));

vi.mock("@/lib/telegram-notify", () => ({
  notifyTelegramArticleRegistered: mocks.notifyTelegramArticleRegistered,
  notifyTelegramAutoPublishRun: mocks.notifyTelegramAutoPublishRun,
  notifyTelegramAutoPressRetryQueue: mocks.notifyTelegramAutoPressRetryQueue,
}));

vi.mock("@/lib/auto-press-worker-dispatch", () => ({
  dispatchAutoPressWorker: mocks.dispatchAutoPressWorker,
}));

vi.mock("@/lib/portal-publication", () => ({
  publishArticleToPortals: mocks.publishArticleToPortals,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

describe("auto-press observability routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns auto-press health checks without leaking secrets", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.getDatabaseProviderStatus.mockReturnValue({
      provider: "d1",
      configured: true,
      runtimeReady: true,
      d1: { httpApiReady: true },
    });
    mocks.serverGetSetting.mockResolvedValue({
      enabled: true,
      cronEnabled: true,
      requireImage: true,
      aiProvider: "gemini",
      aiModel: "gemini-2.5-flash",
      count: 5,
    });
    mocks.serverGetAiSettings.mockResolvedValue({ geminiApiKey: "secret-key" });
    mocks.resolveAiApiKey.mockReturnValue("secret-key");
    mocks.checkMediaStorageHealth.mockResolvedValue({ ok: true, provider: "r2", configured: true });
    mocks.summarizeMediaStorageHealth.mockReturnValue({ ok: true, provider: "r2", configured: true, errors: [], warnings: [], recommendations: [] });
    mocks.getAutoPressObservedSummary.mockResolvedValue({
      runningCount: 0,
      staleRunningCount: 0,
      pendingRetryCount: 1,
      latestRun: null,
    });
    mocks.listAutoPressRetryQueue.mockResolvedValue([
      { id: "queue-1", status: "pending", nextAttemptAt: null },
      { id: "queue-2", status: "failed", nextAttemptAt: "2000-01-01T00:00:00.000Z" },
    ]);
    mocks.getAutoPressRetrySchedulerHealth.mockResolvedValue({
      ok: true,
      level: "ok",
      message: "Cloudflare 재시도 스케줄러 기본 설정이 준비되어 있습니다.",
      configured: { accountId: true, apiToken: true, cronSecret: true, workerUrl: false },
      recommendations: [],
    });
    const { GET } = await import("@/app/api/auto-press/health/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/auto-press/health"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json.checks.ai.detail.hasKey).toBe(true);
    expect(json.checks.retryScheduler.level).toBe("ok");
    expect(JSON.stringify(json)).not.toContain("secret-key");
    expect(json.retryQueue.due).toBe(2);
  });

  it("returns D1-backed auto-press dead letter items for operators", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.listAutoPressDeadLetterItems.mockResolvedValue([
      {
        id: "press_1_0001",
        runId: "press_1",
        title: "Failed press",
        status: "fail",
        retryable: false,
        retryCount: 3,
        attemptCount: 3,
        bodyChars: 1200,
        imageCount: 1,
        reasonCode: "WORKER_PROCESS_FAILED",
        reasonMessage: "Worker timeout",
      },
    ]);
    mocks.getAutoPressDeadLetterSummary.mockResolvedValue({
      total: 1,
      workerProcessFailed: 1,
      imageUploadFailed: 0,
      aiIssue: 0,
      bodyIssue: 0,
      duplicateIssue: 0,
      other: 0,
    });
    const { GET } = await import("@/app/api/auto-press/dlq/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/auto-press/dlq?limit=500"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(json.summary.total).toBe(1);
    expect(mocks.listAutoPressDeadLetterItems).toHaveBeenCalledWith({
      limit: 500,
      reasonCode: undefined,
      includeRetryable: false,
    });
  });

  it("requeues a dead letter item and asks the Worker to enqueue the run", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.requeueAutoPressDeadLetterItem.mockResolvedValue({
      id: "press_1_0001",
      runId: "press_1",
      title: "Failed press",
      status: "queued",
      retryable: true,
      retryCount: 0,
      attemptCount: 0,
      bodyChars: 1200,
      imageCount: 1,
    });
    mocks.dispatchAutoPressWorker.mockResolvedValue({ configured: true, ok: true, enqueued: 1 });
    const { POST } = await import("@/app/api/auto-press/dlq/[id]/route");

    const response = await POST(
      new NextRequest("https://culturepeople.co.kr/api/auto-press/dlq/press_1_0001", {
        method: "POST",
        body: JSON.stringify({ action: "retry" }),
      }),
      { params: Promise.resolve({ id: "press_1_0001" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.requeueAutoPressDeadLetterItem).toHaveBeenCalledWith("press_1_0001", { reason: undefined });
    expect(mocks.dispatchAutoPressWorker).toHaveBeenCalledWith({ runId: "press_1", limit: 20 });
  });

  it("marks a dead letter item as discarded without dispatching Worker", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.discardAutoPressDeadLetterItem.mockResolvedValue({
      id: "press_1_0001",
      runId: "press_1",
      title: "Failed press",
      status: "skip",
      retryable: false,
      retryCount: 3,
      bodyChars: 1200,
      imageCount: 1,
    });
    const { POST } = await import("@/app/api/auto-press/dlq/[id]/route");

    const response = await POST(
      new NextRequest("https://culturepeople.co.kr/api/auto-press/dlq/press_1_0001", {
        method: "POST",
        body: JSON.stringify({ action: "discard", reason: "manual review" }),
      }),
      { params: Promise.resolve({ id: "press_1_0001" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.discardAutoPressDeadLetterItem).toHaveBeenCalledWith("press_1_0001", { reason: "manual review" });
    expect(mocks.dispatchAutoPressWorker).not.toHaveBeenCalled();
  });

  it("runs the retry scheduler route and sends a direct summary notification", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.runAutoPressRetryScheduler.mockResolvedValue({
      ok: true,
      mode: "direct",
      message: "Worker URL이 없어 서버에서 AI 재시도 대기열을 직접 실행했습니다.",
      workerUrlConfigured: false,
      summary: {
        message: "done",
        processed: 1,
        success: 1,
        failed: 0,
        skipped: 0,
        gaveUp: 0,
        waiting: 0,
        results: [],
      },
    });
    mocks.notifyTelegramAutoPressRetryQueue.mockResolvedValue(true);
    const { POST } = await import("@/app/api/auto-press/retry-scheduler/route");

    const response = await POST(new NextRequest("https://culturepeople.co.kr/api/auto-press/retry-scheduler", {
      method: "POST",
      body: JSON.stringify({ limit: 3, preferWorker: true }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.mode).toBe("direct");
    expect(mocks.runAutoPressRetryScheduler).toHaveBeenCalledWith({ limit: 3, preferWorker: true, allowDirectFallback: false });
    expect(mocks.notifyTelegramAutoPressRetryQueue).toHaveBeenCalledWith(expect.objectContaining({ processed: 1 }));
  });

  it("routes retry queue processing through the scheduler guard", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.runAutoPressRetryScheduler.mockResolvedValue({
      ok: false,
      mode: "blocked",
      status: 409,
      message: "blocked",
      workerUrlConfigured: false,
      directFallbackEnabled: false,
    });
    const { POST } = await import("@/app/api/auto-press/retry-queue/process/route");

    const response = await POST(new NextRequest("https://culturepeople.co.kr/api/auto-press/retry-queue/process", {
      method: "POST",
      body: JSON.stringify({ limit: 3 }),
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.mode).toBe("blocked");
    expect(mocks.runAutoPressRetryScheduler).toHaveBeenCalledWith({ limit: 3, preferWorker: true, allowDirectFallback: false });
    expect(mocks.notifyTelegramAutoPressRetryQueue).not.toHaveBeenCalled();
  });

  it("keeps manual run count uncapped while capping run list reads", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.runAutoPress.mockResolvedValue({
      id: "press_large",
      preview: false,
      articlesPublished: 0,
      articlesFailed: 0,
      articlesSkipped: 0,
      articles: [],
    });
    mocks.listAutoPressObservedRuns.mockResolvedValue([]);
    mocks.listAutoPressObservedItems.mockResolvedValue([]);
    mocks.getAutoPressObservedSummary.mockResolvedValue({ runningCount: 0, staleRunningCount: 0, pendingRetryCount: 0 });
    const { POST, GET } = await import("@/app/api/auto-press/runs/route");

    const postResponse = await POST(new NextRequest("https://culturepeople.co.kr/api/auto-press/runs", {
      method: "POST",
      body: JSON.stringify({ count: 250, dateRangeDays: 180, publishStatus: "게시" }),
    }));
    expect(postResponse.status).toBe(200);
    expect(mocks.runAutoPress).toHaveBeenCalledWith(expect.objectContaining({
      countOverride: 250,
      dateRangeDays: 180,
      statusOverride: "게시",
    }));

    const getResponse = await GET(new NextRequest("https://culturepeople.co.kr/api/auto-press/runs?limit=250"));
    expect(getResponse.status).toBe(200);
    expect(mocks.listAutoPressObservedRuns).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("continues an observed run while excluding already attempted source URLs", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.getAutoPressObservedRunDetail.mockResolvedValue({
      id: "press_old",
      status: "timeout",
      requestedCount: 10,
      options: { count: 10, publishStatus: "게시", force: true },
      items: [
        { sourceUrl: "https://example.com/a" },
        { sourceUrl: "https://example.com/b" },
      ],
    });
    mocks.appendAutoPressObservedEvent.mockResolvedValue(undefined);
    mocks.runAutoPress.mockResolvedValue({
      id: "press_new",
      preview: false,
      articlesFailed: 0,
      warnings: [],
      mediaStorage: { ok: true },
    });
    mocks.notifyTelegramAutoPublishRun.mockResolvedValue(true);
    const { POST } = await import("@/app/api/auto-press/runs/[id]/process/route");

    const response = await POST(
      new NextRequest("https://culturepeople.co.kr/api/auto-press/runs/press_old/process", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "press_old" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.runAutoPress).toHaveBeenCalledWith(expect.objectContaining({
      triggeredBy: "관리자 이어 실행 (press_old)",
      countOverride: 10,
      statusOverride: "게시",
      force: true,
      excludeUrls: ["https://example.com/a", "https://example.com/b"],
    }));
  });

  it("restores full per-article Telegram registration alerts for worker-published items", async () => {
    const previousSecret = process.env.AUTO_PRESS_WORKER_SECRET;
    process.env.AUTO_PRESS_WORKER_SECRET = "worker-secret";
    mocks.getAutoPressObservedRunDetail.mockResolvedValue({
      id: "press_article",
      source: "cron",
      status: "running",
      preview: false,
      requestedCount: 2,
      processedCount: 1,
      publishedCount: 1,
      previewedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      queuedCount: 1,
      startedAt: "2026-05-13T09:00:00.000Z",
      options: { publishStatus: "게시" },
      items: [
        {
          id: "item_ok",
          runId: "press_article",
          sourceId: "newswire",
          sourceName: "뉴스와이어",
          title: "등록 완료 보도자료",
          sourceUrl: "https://example.com/press",
          status: "ok",
          articleId: "article_301",
          articleNo: 301,
          imageUrl: "https://media.example.com/press/item_ok.jpg",
          retryable: false,
          retryCount: 1,
          bodyChars: 1200,
          imageCount: 2,
          completedAt: "2026-05-13T09:03:00.000Z",
        },
        {
          id: "item_wait",
          runId: "press_article",
          title: "남은 후보",
          status: "running",
          retryable: false,
          retryCount: 0,
          bodyChars: 0,
          imageCount: 0,
        },
      ],
    });
    mocks.listAutoPressObservedEvents.mockResolvedValue([]);
    mocks.serverGetArticleById.mockResolvedValue({ id: "article_301", no: 301, title: "등록 완료 보도자료", status: "게시" });
    mocks.notifyTelegramArticleRegistered.mockResolvedValue(true);
    mocks.publishArticleToPortals.mockResolvedValue(undefined);
    mocks.appendAutoPressObservedEvent.mockResolvedValue(undefined);
    const { POST } = await import("@/app/api/auto-press/worker-notify/route");

    const response = await POST(new NextRequest("https://culturepeople.co.kr/api/auto-press/worker-notify", {
      method: "POST",
      headers: { authorization: "Bearer worker-secret" },
      body: JSON.stringify({ runId: "press_article", itemId: "item_ok" }),
    }));
    const json = await response.json();

    if (previousSecret === undefined) delete process.env.AUTO_PRESS_WORKER_SECRET;
    else process.env.AUTO_PRESS_WORKER_SECRET = previousSecret;
    expect(response.status).toBe(200);
    expect(json.reason).toBe("RUN_NOT_TERMINAL");
    expect(json.articleRegisteredNotified).toBe(true);
    expect(mocks.notifyTelegramArticleRegistered).toHaveBeenCalledWith(expect.objectContaining({
      kind: "auto_press",
      title: "등록 완료 보도자료",
      source: "뉴스와이어",
      status: "게시",
      articleId: "article_301",
      articleNo: 301,
      sourceUrl: "https://example.com/press",
      thumbnail: "https://media.example.com/press/item_ok.jpg",
    }));
    expect(mocks.revalidateTag).toHaveBeenCalledWith("articles");
    expect(mocks.publishArticleToPortals).toHaveBeenCalledWith(expect.objectContaining({
      articleId: "article_301",
      articleNo: 301,
      title: "등록 완료 보도자료",
      status: "게시",
      source: "auto-press-worker",
    }));
    expect(mocks.appendAutoPressObservedEvent).toHaveBeenCalledWith(expect.objectContaining({
      itemId: "item_ok",
      code: "TELEGRAM_ARTICLE_REGISTERED_SENT",
      metadata: expect.objectContaining({
        articleNo: 301,
        imageUrl: "https://media.example.com/press/item_ok.jpg",
      }),
    }));
  });

  it("accepts CRON_SECRET bearer auth for worker-notify when the dedicated worker secret is not configured", async () => {
    const previousWorkerSecret = process.env.AUTO_PRESS_WORKER_SECRET;
    const previousCronSecret = process.env.CRON_SECRET;
    delete process.env.AUTO_PRESS_WORKER_SECRET;
    process.env.CRON_SECRET = "cron-secret";
    mocks.getAutoPressObservedRunDetail.mockResolvedValue({
      id: "press_cron_auth",
      source: "cron",
      status: "running",
      preview: false,
      requestedCount: 1,
      processedCount: 0,
      publishedCount: 0,
      previewedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      queuedCount: 1,
      startedAt: "2026-05-13T09:00:00.000Z",
      items: [
        {
          id: "item_wait",
          runId: "press_cron_auth",
          title: "대기 보도자료",
          status: "running",
          retryable: false,
          retryCount: 0,
          bodyChars: 0,
          imageCount: 0,
        },
      ],
    });
    mocks.listAutoPressObservedEvents.mockResolvedValue([]);
    const { POST } = await import("@/app/api/auto-press/worker-notify/route");

    const response = await POST(new NextRequest("https://culturepeople.co.kr/api/auto-press/worker-notify", {
      method: "POST",
      headers: { authorization: "Bearer cron-secret" },
      body: JSON.stringify({ runId: "press_cron_auth" }),
    }));
    const json = await response.json();

    if (previousWorkerSecret === undefined) delete process.env.AUTO_PRESS_WORKER_SECRET;
    else process.env.AUTO_PRESS_WORKER_SECRET = previousWorkerSecret;
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
    expect(response.status).toBe(200);
    expect(json.reason).toBe("RUN_NOT_TERMINAL");
  });

  it("does not submit worker-created drafts to portal publication", async () => {
    const previousSecret = process.env.AUTO_PRESS_WORKER_SECRET;
    process.env.AUTO_PRESS_WORKER_SECRET = "worker-secret";
    mocks.getAutoPressObservedRunDetail.mockResolvedValue({
      id: "press_draft",
      source: "cron",
      status: "running",
      preview: false,
      requestedCount: 1,
      processedCount: 1,
      publishedCount: 0,
      previewedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      queuedCount: 0,
      startedAt: "2026-05-13T09:00:00.000Z",
      options: { publishStatus: "임시저장" },
      items: [
        {
          id: "item_draft",
          runId: "press_draft",
          sourceName: "뉴스와이어",
          title: "임시저장 보도자료",
          status: "ok",
          articleId: "article_draft",
          articleNo: 302,
          retryable: false,
          retryCount: 0,
          bodyChars: 1000,
          imageCount: 1,
          completedAt: "2026-05-13T09:03:00.000Z",
        },
      ],
    });
    mocks.listAutoPressObservedEvents.mockResolvedValue([]);
    mocks.serverGetArticleById.mockResolvedValue({ id: "article_draft", no: 302, title: "임시저장 보도자료", status: "임시저장" });
    mocks.notifyTelegramArticleRegistered.mockResolvedValue(true);
    const { POST } = await import("@/app/api/auto-press/worker-notify/route");

    const response = await POST(new NextRequest("https://culturepeople.co.kr/api/auto-press/worker-notify", {
      method: "POST",
      headers: { authorization: "Bearer worker-secret" },
      body: JSON.stringify({ runId: "press_draft", itemId: "item_draft" }),
    }));
    const json = await response.json();

    if (previousSecret === undefined) delete process.env.AUTO_PRESS_WORKER_SECRET;
    else process.env.AUTO_PRESS_WORKER_SECRET = previousSecret;
    expect(response.status).toBe(200);
    expect(json.articleRegisteredNotified).toBe(true);
    expect(mocks.publishArticleToPortals).not.toHaveBeenCalled();
  });

  it("sends a one-time Telegram warning when worker items wait on the daily limit", async () => {
    const previousSecret = process.env.AUTO_PRESS_WORKER_SECRET;
    process.env.AUTO_PRESS_WORKER_SECRET = "worker-secret";
    mocks.getAutoPressObservedRunDetail.mockResolvedValue({
      id: "press_limit",
      source: "cron",
      status: "queued",
      preview: false,
      requestedCount: 30,
      processedCount: 27,
      publishedCount: 27,
      previewedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      queuedCount: 1,
      startedAt: "2026-05-13T09:00:00.000Z",
      items: [
        {
          id: "item_limit",
          runId: "press_limit",
          title: "한도 대기 후보",
          status: "queued",
          reasonCode: "DAILY_LIMIT_REACHED",
          reasonMessage: "일일 AI 호출 상한에 도달했습니다.",
          retryable: true,
          retryCount: 2,
          nextRetryAt: "2026-05-13T22:52:01.838Z",
          bodyChars: 900,
          imageCount: 1,
        },
      ],
    });
    mocks.listAutoPressObservedEvents.mockResolvedValue([]);
    mocks.notifyTelegramAutoPublishRun.mockResolvedValue(true);
    mocks.appendAutoPressObservedEvent.mockResolvedValue(undefined);
    const { POST } = await import("@/app/api/auto-press/worker-notify/route");

    const response = await POST(new NextRequest("https://culturepeople.co.kr/api/auto-press/worker-notify", {
      method: "POST",
      headers: { authorization: "Bearer worker-secret" },
      body: JSON.stringify({ runId: "press_limit", itemId: "item_limit" }),
    }));
    const json = await response.json();

    if (previousSecret === undefined) delete process.env.AUTO_PRESS_WORKER_SECRET;
    else process.env.AUTO_PRESS_WORKER_SECRET = previousSecret;
    expect(response.status).toBe(200);
    expect(json.reason).toBe("DAILY_LIMIT_WAITING_SENT");
    expect(json.dailyLimitWaitingCount).toBe(1);
    expect(mocks.notifyTelegramAutoPublishRun).toHaveBeenCalledWith("auto_press", expect.objectContaining({
      warnings: expect.arrayContaining([expect.stringContaining("일일 처리 한도")]),
    }));
    expect(mocks.appendAutoPressObservedEvent).toHaveBeenCalledWith(expect.objectContaining({
      code: "TELEGRAM_DAILY_LIMIT_WAITING_SENT",
      metadata: expect.objectContaining({ dailyLimitWaitingCount: 1 }),
    }));
  });
});
