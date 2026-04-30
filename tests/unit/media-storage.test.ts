import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

vi.mock("server-only", () => ({}));

describe("media storage provider configuration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("defaults to Supabase unless R2 is explicitly selected", async () => {
    const { getMediaStorageProvider } = await import("@/lib/media-storage");

    expect(getMediaStorageProvider()).toBe("supabase");

    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "unknown");
    expect(getMediaStorageProvider()).toBe("supabase");

    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "r2");
    expect(getMediaStorageProvider()).toBe("r2");
  });

  it("checks Supabase configuration when Supabase is the active provider", async () => {
    const { isMediaStorageConfigured, isSupabaseStorageConfigured } = await import("@/lib/media-storage");

    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "supabase");
    expect(isSupabaseStorageConfigured()).toBe(false);
    expect(isMediaStorageConfigured()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-role-test");

    expect(isSupabaseStorageConfigured()).toBe(true);
    expect(isMediaStorageConfigured()).toBe(true);
  });

  it("requires all R2 settings before reporting R2 as configured", async () => {
    const { getPublicMediaBaseUrl, isMediaStorageConfigured, isPublicMediaUrl, isR2StorageConfigured } = await import("@/lib/media-storage");

    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "r2");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("R2_ACCESS_KEY_ID", "access-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-key");
    vi.stubEnv("CLOUDFLARE_R2_PROD_BUCKET", "culturepeople-media-prod");

    expect(isR2StorageConfigured()).toBe(false);
    expect(isMediaStorageConfigured()).toBe(false);

    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL", "https://media.culturepeople.co.kr/");

    expect(getPublicMediaBaseUrl()).toBe("https://media.culturepeople.co.kr");
    expect(isR2StorageConfigured()).toBe(true);
    expect(isMediaStorageConfigured()).toBe(true);
    expect(isPublicMediaUrl("https://media.culturepeople.co.kr/images/2026/04/a.webp")).toBe(true);
    expect(isPublicMediaUrl("https://culturepeople.co.kr/images/2026/04/a.webp")).toBe(false);
    expect(isPublicMediaUrl("not-a-url")).toBe(false);
  });

  it("uploads through Supabase when the provider is Supabase", async () => {
    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-role-test");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 }),
    );

    const { uploadBufferToMediaStorage } = await import("@/lib/media-storage");
    const url = await uploadBufferToMediaStorage({
      buffer: new Uint8Array([1, 2, 3]),
      mime: "image/webp",
      ext: "webp",
      objectKey: "2026/04/test.webp",
    });

    expect(url).toBe("https://example.supabase.co/storage/v1/object/public/images/2026/04/test.webp");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toBe("https://example.supabase.co/storage/v1/object/images/2026/04/test.webp");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer service-role-test",
      apikey: "service-role-test",
      "Content-Type": "image/webp",
      "x-upsert": "true",
    });
  });

  it("uses content-hash object keys by default to avoid duplicate media objects", async () => {
    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-role-test");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 }),
    );

    const bytes = new Uint8Array([9, 8, 7, 6]);
    const expectedHash = crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");

    const { uploadBufferToMediaStorage } = await import("@/lib/media-storage");
    const firstUrl = await uploadBufferToMediaStorage({
      buffer: bytes,
      mime: "image/webp",
      ext: ".webp",
    });
    const secondUrl = await uploadBufferToMediaStorage({
      buffer: bytes,
      mime: "image/webp",
      ext: ".webp",
    });

    expect(firstUrl).toBe(secondUrl);
    expect(firstUrl).toBe(`https://example.supabase.co/storage/v1/object/public/images/sha256/${expectedHash.slice(0, 2)}/${expectedHash}.webp`);
  });

  it("uses the same content-hash key shape for R2 uploads", async () => {
    vi.stubEnv("MEDIA_STORAGE_PROVIDER", "r2");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "account-id");
    vi.stubEnv("R2_ACCESS_KEY_ID", "access-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-key");
    vi.stubEnv("CLOUDFLARE_R2_PROD_BUCKET", "culturepeople-media-prod");
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL", "https://media.culturepeople.co.kr/");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 }),
    );

    const bytes = new Uint8Array([4, 3, 2, 1]);
    const expectedHash = crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");

    const { uploadBufferToMediaStorage } = await import("@/lib/media-storage");
    const url = await uploadBufferToMediaStorage({
      buffer: bytes,
      mime: "image/webp",
      ext: "webp",
    });

    const expectedKey = `images/sha256/${expectedHash.slice(0, 2)}/${expectedHash}.webp`;
    expect(url).toBe(`https://media.culturepeople.co.kr/${expectedKey}`);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://account-id.r2.cloudflarestorage.com/culturepeople-media-prod/${expectedKey}`);
  });
});
