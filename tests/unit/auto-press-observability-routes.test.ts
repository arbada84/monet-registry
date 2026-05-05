import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  getAutoPressObservedSummary: vi.fn(),
  listAutoPressRetryQueue: vi.fn(),
  getAutoPressObservedRunDetail: vi.fn(),
  appendAutoPressObservedEvent: vi.fn(),
  serverGetSetting: vi.fn(),
  serverGetAiSettings: vi.fn(),
  resolveAiApiKey: vi.fn(),
  getDatabaseProviderStatus: vi.fn(),
  checkMediaStorageHealth: vi.fn(),
  summarizeMediaStorageHealth: vi.fn(),
  getAutoPressRetrySchedulerHealth: vi.fn(),
  runAutoPressRetryScheduler: vi.fn(),
  runAutoPress: vi.fn(),
  notifyTelegramAutoPublishRun: vi.fn(),
  notifyTelegramAutoPressRetryQueue: vi.fn(),
}));

vi.mock("@/lib/cookie-auth", () => ({
  isAuthenticated: mocks.isAuthenticated,
}));

vi.mock("@/lib/auto-press-observability", () => ({
  getAutoPressObservedSummary: mocks.getAutoPressObservedSummary,
  listAutoPressRetryQueue: mocks.listAutoPressRetryQueue,
  getAutoPressObservedRunDetail: mocks.getAutoPressObservedRunDetail,
  appendAutoPressObservedEvent: mocks.appendAutoPressObservedEvent,
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
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
  notifyTelegramAutoPublishRun: mocks.notifyTelegramAutoPublishRun,
  notifyTelegramAutoPressRetryQueue: mocks.notifyTelegramAutoPressRetryQueue,
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
    expect(mocks.runAutoPressRetryScheduler).toHaveBeenCalledWith({ limit: 3, preferWorker: true });
    expect(mocks.notifyTelegramAutoPressRetryQueue).toHaveBeenCalledWith(expect.objectContaining({ processed: 1 }));
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
});
