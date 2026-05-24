import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetSetting: vi.fn(),
  serverSaveSetting: vi.fn(),
  verifyAuthToken: vi.fn(),
  timingSafeEqual: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
  serverSaveSetting: mocks.serverSaveSetting,
}));

vi.mock("@/lib/cookie-auth", () => ({
  verifyAuthToken: mocks.verifyAuthToken,
  timingSafeEqual: mocks.timingSafeEqual,
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

describe("/api/db/settings SMTP safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAuthToken.mockResolvedValue({ valid: true });
    for (const key of SMTP_ENV_KEYS) {
      vi.stubEnv(key, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns masked SMTP settings with safe env runtime status", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.env.example");
    vi.stubEnv("SMTP_USER", "env-user");
    vi.stubEnv("SMTP_PASS", "env-secret");
    mocks.serverGetSetting.mockResolvedValue({
      smtpHost: "smtp.db.example",
      smtpUser: "db-user",
      smtpPass: "db-secret",
      senderEmail: "sender@example.com",
    });

    const { GET } = await import("@/app/api/db/settings/route");
    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/db/settings?key=cp-newsletter-settings"));
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.value.smtpPass).toBe("••••••••");
    expect(json.value.smtpRuntimeStatus).toMatchObject({
      configured: true,
      source: {
        host: "env",
        user: "env",
        pass: "env",
      },
      env: {
        hasHost: true,
        hasUser: true,
        hasPass: true,
      },
    });
    expect(serialized).not.toContain("env-secret");
    expect(serialized).not.toContain("db-secret");
  });

  it("strips runtime status and preserves env-managed SMTP fields on save", async () => {
    vi.stubEnv("SMTP_USER", "env-user");
    vi.stubEnv("SMTP_PASS", "env-secret");
    mocks.serverGetSetting.mockResolvedValue({
      smtpHost: "smtp.db.example",
      smtpUser: "db-user",
      smtpPass: "db-secret",
      senderName: "컬처피플",
    });
    mocks.serverSaveSetting.mockResolvedValue(undefined);

    const { PUT } = await import("@/app/api/db/settings/route");
    const response = await PUT(new NextRequest("https://culturepeople.co.kr/api/db/settings", {
      method: "PUT",
      body: JSON.stringify({
        key: "cp-newsletter-settings",
        value: {
          smtpHost: "smtp.changed.example",
          smtpUser: "changed-user",
          smtpPass: "••••••••",
          senderName: "새 발신자",
          smtpRuntimeStatus: { pass: "should-not-save" },
        },
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.serverSaveSetting).toHaveBeenCalledWith(
      "cp-newsletter-settings",
      expect.objectContaining({
        smtpHost: "smtp.changed.example",
        smtpUser: "db-user",
        smtpPass: "db-secret",
        senderName: "새 발신자",
      }),
    );
    const [, saved] = mocks.serverSaveSetting.mock.calls[0];
    expect(saved).not.toHaveProperty("smtpRuntimeStatus");
    expect(JSON.stringify(saved)).not.toContain("env-secret");
  });
});
