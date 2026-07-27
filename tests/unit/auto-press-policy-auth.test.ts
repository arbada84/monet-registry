import { NextRequest } from "next/server";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("auto-press policy admin authentication", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.COOKIE_SECRET = "test-cookie-secret-that-is-longer-than-32-chars";
    process.env.CRON_SECRET = "cron-only-secret";
  });

  it("does not accept CRON_SECRET as an admin policy session", async () => {
    const { getPolicyActor } = await import("@/lib/auto-press-policy-auth");
    const request = new NextRequest("https://culturepeople.co.kr/api/auto-press/blocked-subjects", {
      headers: { authorization: "Bearer cron-only-secret" },
    });
    await expect(getPolicyActor(request)).resolves.toBeNull();
  });

  it("maps admin and superadmin capabilities from the signed cookie", async () => {
    const { generateAuthToken } = await import("@/lib/cookie-auth");
    const { requirePolicyCapability } = await import("@/lib/auto-press-policy-auth");
    const adminToken = await generateAuthToken("운영자", "admin");
    const admin = new NextRequest("https://culturepeople.co.kr/api/auto-press/blocked-subjects", {
      headers: { cookie: `cp-admin-auth=${adminToken}` },
    });
    expect((await requirePolicyCapability(admin, "view")).actor?.role).toBe("admin");
    expect((await requirePolicyCapability(admin, "publish")).error?.status).toBe(403);

    const superToken = await generateAuthToken("대표자", "superadmin");
    const superadmin = new NextRequest("https://culturepeople.co.kr/api/auto-press/blocked-subjects", {
      headers: { cookie: `cp-admin-auth=${superToken}` },
    });
    expect((await requirePolicyCapability(superadmin, "publish")).actor?.role).toBe("superadmin");
  });

  it("returns 403 for an authenticated reporter", async () => {
    const { generateAuthToken } = await import("@/lib/cookie-auth");
    const { requirePolicyCapability } = await import("@/lib/auto-press-policy-auth");
    const reporterToken = await generateAuthToken("기자", "reporter");
    const reporter = new NextRequest("https://culturepeople.co.kr/api/auto-press/blocked-subjects", {
      headers: { cookie: `cp-admin-auth=${reporterToken}` },
    });
    expect((await requirePolicyCapability(reporter, "view")).error?.status).toBe(403);
  });

  it("rejects cross-origin mutations", async () => {
    const { assertPolicySameOrigin } = await import("@/lib/auto-press-policy-auth");
    const request = new NextRequest("https://culturepeople.co.kr/api/auto-press/blocked-subjects", {
      method: "POST",
      headers: { origin: "https://attacker.example", host: "culturepeople.co.kr" },
    });
    expect(assertPolicySameOrigin(request)?.status).toBe(403);
  });

  it("returns a redacted 400 response for invalid Zod input", async () => {
    const { policyApiError } = await import("@/lib/auto-press-policy-api");
    const parsed = z.object({ version: z.number() }).safeParse({ version: "secret-like-input" });
    if (parsed.success) throw new Error("fixture must fail");
    const response = policyApiError(parsed.error);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "요청 입력값이 올바르지 않습니다.",
    });
  });
});
