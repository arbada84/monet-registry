import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTotalCount: vi.fn(),
  d1Health: vi.fn(),
  supabaseHealth: vi.fn(),
  provider: vi.fn(),
  mediaConfigured: vi.fn(),
}));

vi.mock("@/app/api/_common/services", () => ({ registryService: { getTotalCount: mocks.getTotalCount } }));
vi.mock("@/lib/d1-http-client", () => ({ d1HttpHealthCheck: mocks.d1Health }));
vi.mock("@/lib/supabase-health", () => ({ checkSupabaseHealth: mocks.supabaseHealth }));
vi.mock("@/lib/database-provider", () => ({ getDatabaseProviderStatus: mocks.provider }));
vi.mock("@/lib/media-storage", () => ({
  getMediaStorageProvider: () => "r2",
  isMediaStorageConfigured: mocks.mediaConfigured,
}));

import { GET } from "@/app/api/health/route";

describe("public health probe cache", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTotalCount.mockResolvedValue(10);
    mocks.provider.mockReturnValue({ provider: "d1" });
    mocks.d1Health.mockResolvedValue({ ok: true });
    mocks.supabaseHealth.mockResolvedValue({ ok: true });
    mocks.mediaConfigured.mockReturnValue(true);
  });

  it("allows only a short Vercel CDN cache for a healthy anonymous response", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("public, max-age=15");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.json()).toMatchObject({ status: "ok", initialized: true, component_count: 10 });
    expect(mocks.d1Health).toHaveBeenCalledWith({ timeoutMs: 5000 });
    expect(mocks.supabaseHealth).not.toHaveBeenCalled();
  });

  it.each(["database", "media"])("never caches a reported %s outage", async (dependency) => {
    if (dependency === "database") mocks.d1Health.mockResolvedValue({ ok: false });
    else mocks.mediaConfigured.mockReturnValue(false);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "error", initialized: false });
  });

  it("does not cache exceptions or leak their details and can recover on the next call", async () => {
    mocks.d1Health.mockRejectedValueOnce(new Error("private-provider-detail"));
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect(failed.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(failed.headers.get("retry-after")).toBe("60");
    expect(await failed.text()).not.toContain("private-provider-detail");
    expect((await GET()).status).toBe(200);
  });

  it("keeps the selected Supabase health check instead of probing both providers", async () => {
    mocks.provider.mockReturnValue({ provider: "supabase" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.supabaseHealth).toHaveBeenCalledTimes(1);
    expect(mocks.d1Health).not.toHaveBeenCalled();
  });
});
