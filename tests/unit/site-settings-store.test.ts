import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  d1: {
    d1GetSetting: vi.fn(),
    d1SaveSetting: vi.fn(),
  },
}));

vi.mock("@/lib/d1-server-db", () => mocks.d1);

function enableD1ReadAdapter() {
  vi.stubEnv("D1_READ_ADAPTER_ENABLED", "true");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
  vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
}

describe("shared site settings store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads site_settings from Supabase when D1 reads are not enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-role-test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([{ value: { enabled: true } }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { readSiteSetting } = await import("@/lib/site-settings-store");

    await expect(readSiteSetting("cp-test", { enabled: false }, { useServiceKey: true })).resolves.toEqual({ enabled: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/site_settings?key=eq.cp-test&select=value&limit=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "service-role-test",
          Authorization: "Bearer service-role-test",
        }),
      }),
    );
    expect(mocks.d1.d1GetSetting).not.toHaveBeenCalled();
  });

  it("routes site setting reads and writes to D1 when the D1 read adapter is ready", async () => {
    enableD1ReadAdapter();
    mocks.d1.d1GetSetting.mockResolvedValueOnce({ enabled: true });
    mocks.d1.d1SaveSetting.mockResolvedValueOnce(undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { readSiteSetting, writeSiteSetting } = await import("@/lib/site-settings-store");

    await expect(readSiteSetting("cp-test", { enabled: false })).resolves.toEqual({ enabled: true });
    await expect(writeSiteSetting("cp-test", { enabled: true })).resolves.toBeUndefined();
    expect(mocks.d1.d1GetSetting).toHaveBeenCalledWith("cp-test", { enabled: false });
    expect(mocks.d1.d1SaveSetting).toHaveBeenCalledWith("cp-test", { enabled: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dual-writes Supabase primary setting writes to D1 only when enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-role-test");
    vi.stubEnv("D1_SETTINGS_DUAL_WRITE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "database-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 200 }));
    mocks.d1.d1SaveSetting.mockResolvedValueOnce(undefined);

    const { writeSiteSetting } = await import("@/lib/site-settings-store");

    await expect(writeSiteSetting("cp-test", { enabled: true })).resolves.toBeUndefined();
    expect(mocks.d1.d1SaveSetting).toHaveBeenCalledWith("cp-test", { enabled: true });
  });
});
