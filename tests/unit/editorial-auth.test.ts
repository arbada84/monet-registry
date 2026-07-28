import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("editorial admin authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.COOKIE_SECRET = "editorial-test-cookie-secret-longer-than-32-characters";
    process.env.CRON_SECRET = "cron-is-not-editorial-admin";
  });

  it("rejects cron bearer auth and requires the signed admin cookie", async () => {
    const { getEditorialActor } = await import("@/lib/editorial/auth");
    const request = new NextRequest("https://culturepeople.co.kr/api/editorial/candidates", {
      headers: { authorization: "Bearer cron-is-not-editorial-admin" },
    });
    await expect(getEditorialActor(request)).resolves.toBeNull();
  });

  it("limits reporter review and superadmin runtime capabilities", async () => {
    const { generateAuthToken } = await import("@/lib/cookie-auth");
    const { requireEditorialCapability } = await import("@/lib/editorial/auth");
    const reporterToken = await generateAuthToken("기자", "reporter");
    const reporter = new NextRequest("https://culturepeople.co.kr/api/editorial/candidates", {
      headers: { cookie: `cp-admin-auth=${reporterToken}` },
    });
    expect((await requireEditorialCapability(reporter, "view")).actor?.role).toBe("reporter");
    expect((await requireEditorialCapability(reporter, "review")).error?.status).toBe(403);

    const rootToken = await generateAuthToken("대표자", "superadmin");
    const root = new NextRequest("https://culturepeople.co.kr/api/editorial/runtime", {
      headers: { cookie: `cp-admin-auth=${rootToken}` },
    });
    expect((await requireEditorialCapability(root, "runtime")).actor?.role).toBe("superadmin");
    expect((await requireEditorialCapability(root, "rights")).actor?.role).toBe("superadmin");
  });

  it("separates editor, sensitive editor, and source-rights capabilities", async () => {
    const { generateAuthToken } = await import("@/lib/cookie-auth");
    const { requireEditorialCapability } = await import("@/lib/editorial/auth");
    const requestFor = async (role: "editor" | "sensitive_editor") => {
      const token = await generateAuthToken(role, role);
      return new NextRequest("https://culturepeople.co.kr/api/editorial/candidates", {
        headers: { cookie: `cp-admin-auth=${token}` },
      });
    };
    const editor = await requestFor("editor");
    const sensitive = await requestFor("sensitive_editor");
    expect((await requireEditorialCapability(editor, "review")).actor?.role).toBe("editor");
    expect((await requireEditorialCapability(editor, "sensitive-review")).error?.status).toBe(403);
    expect((await requireEditorialCapability(editor, "rights")).error?.status).toBe(403);
    expect((await requireEditorialCapability(sensitive, "sensitive-review")).actor?.role).toBe("sensitive_editor");
    expect((await requireEditorialCapability(sensitive, "rights")).error?.status).toBe(403);
  });

  it("rejects cross-origin mutation and short idempotency keys", async () => {
    const { assertEditorialSameOrigin, requireEditorialIdempotencyKey } = await import("@/lib/editorial/auth");
    const crossOrigin = new NextRequest("https://culturepeople.co.kr/api/editorial/runtime", {
      method: "PATCH",
      headers: { origin: "https://attacker.example", host: "culturepeople.co.kr" },
    });
    expect(assertEditorialSameOrigin(crossOrigin)?.status).toBe(403);
    const shortKey = new NextRequest("https://culturepeople.co.kr/api/editorial/runtime", {
      headers: { "idempotency-key": "short" },
    });
    expect(requireEditorialIdempotencyKey(shortKey)).not.toBe("short");
  });
});
