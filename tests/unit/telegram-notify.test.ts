import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("telegram notification helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reports safe configuration status without exposing token values", async () => {
    vi.stubEnv("TELEGRAM_ENABLED", "true");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "1234567890:AA_fake_token_for_unit_test_only");
    vi.stubEnv("TELEGRAM_ALLOWED_CHAT_IDS", "123456789, -100987654321");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret");
    vi.stubEnv("TELEGRAM_WEBHOOK_HEADER_SECRET", "header-secret");
    vi.stubEnv("TELEGRAM_ALLOW_TEMP_LOGIN", "true");

    const { getTelegramStatus } = await import("@/lib/telegram-notify");
    const status = await getTelegramStatus();

    expect(status).toMatchObject({
      enabled: true,
      hasToken: true,
      hasWebhookSecret: true,
      hasWebhookHeaderSecret: true,
      tempLoginEnabled: true,
      chatCount: 2,
      botSelfChatIdConfigured: false,
    });
    expect(status.chatIds).toEqual(["12***89", "-1***21"]);
    expect(JSON.stringify(status)).not.toContain("fake_token");
  });

  it("builds and registers the configured webhook with Telegram", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "1234567890:AA_fake_token_for_unit_test_only");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret");
    vi.stubEnv("TELEGRAM_WEBHOOK_HEADER_SECRET", "header-secret");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://culturepeople.example");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { buildTelegramWebhookUrl, setTelegramWebhook } = await import("@/lib/telegram-notify");
    await expect(buildTelegramWebhookUrl()).resolves.toBe("https://culturepeople.example/api/telegram/webhook/webhook-secret");

    await expect(setTelegramWebhook({ dropPendingUpdates: true })).resolves.toMatchObject({
      ok: true,
      result: true,
      url: "https://culturepeople.example/api/telegram/webhook/webhook-secret",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      url: "https://culturepeople.example/api/telegram/webhook/webhook-secret",
      secret_token: "header-secret",
      drop_pending_updates: true,
    });
    expect(body.allowed_updates).toEqual(["message"]);
  });

  it("does not attempt webhook registration without a webhook secret", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "1234567890:AA_fake_token_for_unit_test_only");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { setTelegramWebhook } = await import("@/lib/telegram-notify");
    await expect(setTelegramWebhook()).resolves.toMatchObject({
      ok: false,
      error: "텔레그램 웹훅 비밀값이 설정되지 않았습니다.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects the bot's own id before sending Telegram messages", async () => {
    vi.stubEnv("TELEGRAM_ENABLED", "true");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "8679696238:AA_fake_token_for_unit_test_only");
    vi.stubEnv("TELEGRAM_ALLOWED_CHAT_IDS", "8679696238");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { getTelegramStatus, sendTelegramMessage } = await import("@/lib/telegram-notify");
    await expect(getTelegramStatus()).resolves.toMatchObject({
      enabled: true,
      chatCount: 1,
      botSelfChatIdConfigured: true,
    });

    await expect(sendTelegramMessage({ text: "테스트" })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds a Korean auto-publish run summary with counts and article statuses", async () => {
    const { buildTelegramAutoPublishRunSummary } = await import("@/lib/telegram-notify");

    const text = buildTelegramAutoPublishRunSummary("auto_press", {
      id: "press_1",
      startedAt: "2026-05-02T09:00:00.000Z",
      completedAt: "2026-05-02T09:01:00.000Z",
      source: "manual",
      articlesPublished: 1,
      articlesPreviewed: 0,
      articlesSkipped: 1,
      articlesFailed: 1,
      articles: [
        { title: "등록 기사", sourceUrl: "https://example.com/a", wrId: "1", boTable: "rss", status: "ok", articleId: "101" },
        { title: "이미지 없는 기사", sourceUrl: "https://example.com/b", wrId: "2", boTable: "rss", status: "no_image" },
        { title: "실패 기사", sourceUrl: "https://example.com/c", wrId: "3", boTable: "rss", status: "fail", error: "AI 오류" },
      ],
      mediaStorage: {
        ok: true,
        provider: "r2",
        configured: true,
        errors: [],
        warnings: [],
        recommendations: [],
      },
    });

    expect(text).toContain("보도자료 자동등록 실행현황");
    expect(text).toContain("등록: 1건 / 미리보기: 0건 / 건너뜀: 1건 / 실패: 1건");
    expect(text).toContain("등록 #101: 등록 기사");
    expect(text).toContain("실패 3: 실패 기사 - AI 오류");
  });
});
