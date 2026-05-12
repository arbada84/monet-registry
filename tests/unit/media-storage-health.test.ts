import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("media storage health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("detects Supabase Storage quota restrictions without uploading", async () => {
    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-role-test");

    const fetchMock = vi.fn(async () => jsonResponse({
      message: "You have exceeded your plan's quota (Storage Size Exceeded).",
    }, 402));

    const { checkMediaStorageHealth } = await import("@/lib/media-storage-health");
    const report = await checkMediaStorageHealth({ fetchImpl: fetchMock as unknown as typeof fetch });

    expect(report.ok).toBe(false);
    expect(report.provider).toBe("supabase");
    expect(report.checks.supabaseRemote).toMatchObject({
      ok: false,
      status: 402,
      code: "supabase_storage_quota_restricted",
    });
    expect(report.recommendations.join(" ")).toContain("Cloudflare R2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/bucket/images",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("detects when Cloudflare R2 is not enabled for the account", async () => {
    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "r2");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-value");
    vi.stubEnv("R2_ACCESS_KEY_ID", "access-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-key");
    vi.stubEnv("CLOUDFLARE_R2_PROD_BUCKET", "culturepeople-media-prod");
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL", "https://media.culturepeople.co.kr");

    const fetchMock = vi.fn(async () => jsonResponse({
      success: false,
      errors: [{ message: "Please enable R2 through the Cloudflare Dashboard." }],
    }, 403));

    const { checkMediaStorageHealth } = await import("@/lib/media-storage-health");
    const report = await checkMediaStorageHealth({ fetchImpl: fetchMock as unknown as typeof fetch });

    expect(report.ok).toBe(false);
    expect(report.checks.r2Config.ok).toBe(true);
    expect(report.checks.r2Dashboard).toMatchObject({
      ok: false,
      status: 403,
      code: "r2_not_enabled",
    });
    expect(report.recommendations.join(" ")).toContain("R2를");
  });

  it("passes when R2 is enabled and the configured bucket exists", async () => {
    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "r2");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-value");
    vi.stubEnv("R2_ACCESS_KEY_ID", "access-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-key");
    vi.stubEnv("CLOUDFLARE_R2_PROD_BUCKET", "culturepeople-media-prod");
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL", "https://media.culturepeople.co.kr");

    const fetchMock = vi.fn(async () => jsonResponse({
      success: true,
      result: {
        buckets: [{ name: "culturepeople-media-prod" }],
      },
    }));

    const { checkMediaStorageHealth } = await import("@/lib/media-storage-health");
    const report = await checkMediaStorageHealth({ fetchImpl: fetchMock as unknown as typeof fetch });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.checks.r2Dashboard).toMatchObject({
      ok: true,
      status: 200,
    });
  });

  it("can run an explicit write probe without enabling it by default", async () => {
    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-role-test");

    const uploadFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 }),
    );
    const publicReadFetch = vi.fn(async () => new Response("ok", { status: 200 }));

    const { checkMediaStorageHealth } = await import("@/lib/media-storage-health");
    const readOnlyReport = await checkMediaStorageHealth({
      remote: false,
      fetchImpl: publicReadFetch as unknown as typeof fetch,
    });
    const writeReport = await checkMediaStorageHealth({
      remote: false,
      writeProbe: true,
      fetchImpl: publicReadFetch as unknown as typeof fetch,
    });

    expect(readOnlyReport.checks.writeProbe).toBeUndefined();
    expect(writeReport.checks.writeProbe).toMatchObject({ ok: true, status: 200 });
    expect(uploadFetch).toHaveBeenCalledTimes(1);
    expect(uploadFetch).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/images/health/media-storage-probe.png",
      expect.objectContaining({ method: "POST" }),
    );
    expect(publicReadFetch).toHaveBeenCalledTimes(1);
    expect(publicReadFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://example.supabase.co/storage/v1/object/public/images/health/media-storage-probe.png"),
      expect.objectContaining({ method: "GET" }),
    );
  });
});
