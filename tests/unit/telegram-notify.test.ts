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
    const status = getTelegramStatus();

    expect(status).toMatchObject({
      enabled: true,
      hasToken: true,
      hasWebhookSecret: true,
      hasWebhookHeaderSecret: true,
      tempLoginEnabled: true,
      chatCount: 2,
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
    expect(buildTelegramWebhookUrl()).toBe("https://culturepeople.example/api/telegram/webhook/webhook-secret");

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
      error: "TELEGRAM_WEBHOOK_SECRET is not configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
