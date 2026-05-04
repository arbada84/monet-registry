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
  runAutoPress: vi.fn(),
  notifyTelegramAutoPublishRun: vi.fn(),
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

vi.mock("@/app/api/cron/auto-press/route", () => ({
  runAutoPress: mocks.runAutoPress,
}));

vi.mock("@/lib/telegram-notify", () => ({
  notifyTelegramAutoPublishRun: mocks.notifyTelegramAutoPublishRun,
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
    const { GET } = await import("@/app/api/auto-press/health/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/auto-press/health"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(json.checks.ai.detail.hasKey).toBe(true);
    expect(JSON.stringify(json)).not.toContain("secret-key");
    expect(json.retryQueue.due).toBe(2);
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
