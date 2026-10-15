import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/site-settings-store", () => ({
  readSiteSetting: vi.fn(async () => { throw new Error("D1 daily operation limit exceeded"); }),
  writeSiteSetting: vi.fn(),
}));
describe("Telegram alert configuration during D1 outage", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("restores notification fields without enabling login or webhook access", async () => {
    vi.stubEnv("COOKIE_SECRET", "test-only-secret");
    const { encrypt } = await import("@/lib/encrypt");
    vi.stubEnv("TELEGRAM_ALERT_FALLBACK_JSON", JSON.stringify({
      enabled: true, botToken: encrypt("123:notification-token"), chatIds: "456",
      allowTempLogin: true, webhookSecret: "do-not-restore", timeoutMs: 3500,
    }));
    const { getTelegramRuntimeConfig } = await import("@/lib/telegram-settings");
    const config = await getTelegramRuntimeConfig();
    expect(config).toMatchObject({ enabledFlag: true, botToken: "123:notification-token", chatIds: ["456"], allowTempLogin: false, webhookSecret: "" });
  });
  it("handles a corrupt fallback without exposing it", async () => {
    vi.stubEnv("TELEGRAM_ALERT_FALLBACK_JSON", "invalid-json");
    const { getTelegramRuntimeConfig } = await import("@/lib/telegram-settings");
    expect(await getTelegramRuntimeConfig()).toMatchObject({ botToken: "", chatIds: [] });
  });
});
