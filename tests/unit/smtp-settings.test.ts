import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetSetting: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
}));

const SMTP_ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
  "SMTP_SENDER_EMAIL",
  "SMTP_SENDER_NAME",
  "SMTP_REPLY_TO_EMAIL",
] as const;

describe("SMTP settings resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of SMTP_ENV_KEYS) {
      vi.stubEnv(key, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses Vercel SMTP environment values before stored newsletter settings", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.env.example");
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "env-user");
    vi.stubEnv("SMTP_PASS", "env-secret");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("SMTP_SENDER_EMAIL", "env-sender@example.com");
    vi.stubEnv("SMTP_SENDER_NAME", "Env Sender");
    vi.stubEnv("SMTP_REPLY_TO_EMAIL", "env-reply@example.com");
    mocks.serverGetSetting.mockResolvedValueOnce({
      smtpHost: "smtp.db.example",
      smtpPort: 2525,
      smtpUser: "db-user",
      smtpPass: "db-secret",
      smtpSecure: false,
      senderEmail: "db-sender@example.com",
      senderName: "DB Sender",
      replyToEmail: "db-reply@example.com",
    });

    const { getSmtpRuntimeConfig, NEWSLETTER_SETTINGS_KEY } = await import("@/lib/smtp-settings");
    const config = await getSmtpRuntimeConfig();

    expect(config).toMatchObject({
      host: "smtp.env.example",
      port: 465,
      user: "env-user",
      pass: "env-secret",
      secure: true,
      senderEmail: "env-sender@example.com",
      senderName: "Env Sender",
      replyToEmail: "env-reply@example.com",
    });
    expect(config.status.configured).toBe(true);
    expect(config.status.source).toMatchObject({
      host: "env",
      port: "env",
      user: "env",
      pass: "env",
      senderEmail: "env",
    });
    expect(mocks.serverGetSetting).toHaveBeenCalledWith(NEWSLETTER_SETTINGS_KEY, {});
  });

  it("returns an operator-safe error when the SMTP password is missing", async () => {
    mocks.serverGetSetting.mockResolvedValueOnce({
      smtpHost: "smtp.db.example",
      smtpUser: "db-user",
      senderEmail: "sender@example.com",
    });

    const { getSmtpConfigError, getSmtpRuntimeConfig } = await import("@/lib/smtp-settings");
    const config = await getSmtpRuntimeConfig();
    const error = getSmtpConfigError(config.status);

    expect(config.status.configured).toBe(false);
    expect(config.status.missing).toContain("pass");
    expect(error).toBe("SMTP 비밀번호가 설정되어 있지 않습니다. Vercel 환경변수 SMTP_PASS 또는 기존 발송 설정을 확인해주세요.");
    expect(error).not.toContain("db-user");
  });

  it("reports safe status without exposing raw SMTP passwords", async () => {
    vi.stubEnv("SMTP_PASS", "env-secret-value");
    mocks.serverGetSetting.mockResolvedValueOnce({
      smtpHost: "smtp.db.example",
      smtpUser: "db-user",
      smtpPass: "db-secret-value",
      senderEmail: "sender@example.com",
    });

    const { getSmtpRuntimeConfig } = await import("@/lib/smtp-settings");
    const config = await getSmtpRuntimeConfig();
    const statusJson = JSON.stringify(config.status);

    expect(config.pass).toBe("env-secret-value");
    expect(config.status.source.pass).toBe("env");
    expect(config.status.env.hasPass).toBe(true);
    expect(config.status.stored.hasPass).toBe(true);
    expect(statusJson).not.toContain("env-secret-value");
    expect(statusJson).not.toContain("db-secret-value");
  });
});
