import { afterEach, describe, expect, it, vi } from "vitest";

const COOKIE_SECRET = "culturepeople-cookie-secret-for-unit-tests-2026";

async function importCookieAuth(redisMock: unknown = null) {
  vi.resetModules();
  vi.doMock("@/lib/redis", () => ({ redis: redisMock }));
  vi.stubEnv("COOKIE_SECRET", COOKIE_SECRET);
  return import("@/lib/cookie-auth");
}

function authRequest(cookieValue = "", bearer = "") {
  return {
    cookies: {
      get: (name: string) => (name === "cp-admin-auth" && cookieValue ? { value: cookieValue } : undefined),
    },
    headers: {
      get: (name: string) => (name.toLowerCase() === "authorization" ? bearer : null),
    },
  };
}

describe("cookie-auth", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock("@/lib/redis");
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("generates and verifies signed admin tokens with name and role payload", async () => {
    const { generateAuthToken, verifyAuthToken } = await importCookieAuth();

    const token = await generateAuthToken("관리자", "superadmin");
    const payload = await verifyAuthToken(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
    expect(payload).toEqual({ valid: true, name: "관리자", role: "superadmin" });
  });

  it("rejects tampered, empty, boolean-marker, and expired tokens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T00:00:00.000Z"));
    const { generateAuthToken, verifyAuthToken } = await importCookieAuth();

    const token = await generateAuthToken("관리자", "superadmin");
    const [payload, signature] = token.split(".");

    expect(await verifyAuthToken(`${payload}.${signature.replace(/.$/, "0")}`)).toEqual({
      valid: false,
      name: "",
      role: "",
    });
    expect(await verifyAuthToken("")).toEqual({ valid: false, name: "", role: "" });
    expect(await verifyAuthToken("true")).toEqual({ valid: false, name: "", role: "" });

    vi.setSystemTime(new Date("2026-05-21T00:00:00.001Z"));
    expect(await verifyAuthToken(token)).toEqual({ valid: false, name: "", role: "" });
  });

  it("uses constant-time style equality for same, different, and different-length strings", async () => {
    const { timingSafeEqual } = await importCookieAuth();

    expect(timingSafeEqual("same-value", "same-value")).toBe(true);
    expect(timingSafeEqual("same-value", "same-valuf")).toBe(false);
    expect(timingSafeEqual("short", "shorter")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "x")).toBe(false);
  });

  it("blocks invalidated in-memory tokens before accepting cookie authentication", async () => {
    const { generateAuthToken, invalidateToken, isAuthenticated, isTokenBlacklisted } = await importCookieAuth();
    const token = await generateAuthToken("관리자", "superadmin");

    expect(await isAuthenticated(authRequest(token))).toBe(true);
    await invalidateToken(token);

    expect(await isTokenBlacklisted(token)).toBe(true);
    expect(await isAuthenticated(authRequest(token))).toBe(false);
  });

  it("stores only hashed blacklist keys in Redis and honors Redis blacklist checks", async () => {
    const redisMock = {
      set: vi.fn().mockResolvedValue("OK"),
      exists: vi.fn().mockResolvedValue(1),
    };
    const { generateAuthToken, invalidateToken, isTokenBlacklisted } = await importCookieAuth(redisMock);
    const token = await generateAuthToken("관리자", "superadmin");

    await invalidateToken(token);
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringMatching(/^cp:blacklist:[a-f0-9]{16}$/),
      "1",
      { ex: 86400 },
    );
    expect(redisMock.set.mock.calls[0][0]).not.toContain(token);

    await expect(isTokenBlacklisted(token)).resolves.toBe(true);
    expect(redisMock.exists).toHaveBeenCalledWith(expect.stringMatching(/^cp:blacklist:[a-f0-9]{16}$/));
  });

  it("allows CRON_SECRET bearer authentication without a cookie token", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    const { isAuthenticated } = await importCookieAuth();

    await expect(isAuthenticated(authRequest("", "Bearer cron-secret-value"))).resolves.toBe(true);
    await expect(isAuthenticated(authRequest("", "Bearer wrong-secret"))).resolves.toBe(false);
  });
});
