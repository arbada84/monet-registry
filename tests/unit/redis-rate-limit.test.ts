import { afterEach, describe, expect, it, vi } from "vitest";

describe("Redis rate limiter availability policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadRateLimiter(nodeEnv: string) {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    return import("@/lib/redis");
  }

  it("fails closed in production when Redis is unavailable and the caller requires it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { checkRateLimit } = await loadRateLimiter("production");

    await expect(
      checkRateLimit("203.0.113.7", "test:", 1, 60, {
        failClosedInProduction: true,
        context: "unit-test",
      }),
    ).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[rate-limit] Redis unavailable for unit-test; failing closed in production",
    );
  });

  it("fails open outside production when Redis is unavailable", async () => {
    const { checkRateLimit } = await loadRateLimiter("test");

    await expect(
      checkRateLimit("203.0.113.7", "test:", 1, 60, {
        failClosedInProduction: true,
        context: "unit-test",
      }),
    ).resolves.toBe(true);
  });

  it("keeps legacy fail-open behavior unless fail-closed is requested", async () => {
    const { checkRateLimit } = await loadRateLimiter("production");

    await expect(checkRateLimit("203.0.113.7", "test:", 1, 60)).resolves.toBe(true);
  });
});
