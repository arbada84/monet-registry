import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/server-request-auth", () => ({
  isCronOrAdminRequest: vi.fn(),
}));

vi.mock("@/lib/supabase-recovery-status", () => ({
  formatSupabaseRecoveryReportSection: vi.fn(() => "<b>Supabase 복구 감시</b>"),
  getSupabaseRecoveryStatus: vi.fn(),
}));

vi.mock("@/lib/telegram-notify", () => ({
  getTelegramStatus: vi.fn(async () => ({ enabled: true, chatCount: 1 })),
  sendTelegramMessage: vi.fn(async () => true),
}));

function request(path: string): NextRequest {
  return new NextRequest(`https://culturepeople.co.kr${path}`);
}

describe("supabase recovery cron route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { isCronOrAdminRequest } = await import("@/lib/server-request-auth");
    const { getSupabaseRecoveryStatus } = await import("@/lib/supabase-recovery-status");
    vi.mocked(isCronOrAdminRequest).mockResolvedValue(true);
    vi.mocked(getSupabaseRecoveryStatus).mockResolvedValue({
      ok: false,
      generatedAt: "2026-05-19T00:00:00.000Z",
      projectHost: "example.supabase.co",
      bucket: "images",
      config: { hasUrl: true, hasAnonKey: true, hasServiceKey: true },
      probes: [],
      classification: {
        ok: false,
        readyForDbExport: false,
        readyForStorageCopy: false,
        restricted: true,
        storageRestricted: true,
        phase: "quota_restricted",
        nextActions: ["대기"],
      },
    });
  });

  it("requires cron or admin authentication", async () => {
    const { isCronOrAdminRequest } = await import("@/lib/server-request-auth");
    vi.mocked(isCronOrAdminRequest).mockResolvedValueOnce(false);
    const { GET } = await import("@/app/api/cron/supabase-recovery-check/route");

    const response = await GET(request("/api/cron/supabase-recovery-check"));

    expect(response.status).toBe(401);
  });

  it("returns the recovery report without sending Telegram by default", async () => {
    const { sendTelegramMessage } = await import("@/lib/telegram-notify");
    const { GET } = await import("@/app/api/cron/supabase-recovery-check/route");

    const response = await GET(request("/api/cron/supabase-recovery-check"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sent).toBe(false);
    expect(body.report.classification.phase).toBe("quota_restricted");
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("can send the recovery report to Telegram on demand", async () => {
    const { getSupabaseRecoveryStatus } = await import("@/lib/supabase-recovery-status");
    const { sendTelegramMessage } = await import("@/lib/telegram-notify");
    const { GET } = await import("@/app/api/cron/supabase-recovery-check/route");

    const response = await GET(request("/api/cron/supabase-recovery-check?send=1&requireStorage=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sent).toBe(true);
    expect(getSupabaseRecoveryStatus).toHaveBeenCalledWith({ requireStorage: true });
    expect(sendTelegramMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: "<b>Supabase 복구 감시</b>",
      level: "warning",
    }));
  });
});
