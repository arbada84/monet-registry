import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyAuthToken: vi.fn(),
  unzipSync: vi.fn(),
  strFromU8: vi.fn(),
  serverCreateArticle: vi.fn(),
  serverMigrateBodyImages: vi.fn(),
  serverUploadBuffer: vi.fn(),
  serverUploadImageUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cookie-auth", () => ({
  verifyAuthToken: mocks.verifyAuthToken,
}));

vi.mock("fflate", () => ({
  unzipSync: mocks.unzipSync,
  strFromU8: mocks.strFromU8,
}));

vi.mock("@/lib/db-server", () => ({
  serverCreateArticle: mocks.serverCreateArticle,
}));

vi.mock("@/lib/server-upload-image", () => ({
  serverMigrateBodyImages: mocks.serverMigrateBodyImages,
  serverUploadBuffer: mocks.serverUploadBuffer,
  serverUploadImageUrl: mocks.serverUploadImageUrl,
}));

import { POST } from "@/app/api/upload/zip-articles/route";

function authedZipRequest() {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([0x50, 0x4b])], "articles.zip", { type: "application/zip" }));

  return new NextRequest("https://culturepeople.co.kr/api/upload/zip-articles", {
    method: "POST",
    headers: {
      cookie: "cp-admin-auth=test-token",
    },
    body: form,
  });
}

describe("POST /api/upload/zip-articles", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects ZIP archives with too many entries", async () => {
    mocks.verifyAuthToken.mockResolvedValue({ valid: true, userId: "admin", role: "admin" });
    mocks.unzipSync.mockReturnValue(Object.fromEntries(
      Array.from({ length: 501 }, (_, index) => [`entry-${index}.txt`, new Uint8Array([1])]),
    ));

    const response = await POST(authedZipRequest());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("500");
    expect(mocks.serverCreateArticle).not.toHaveBeenCalled();
  });

  it("rejects ZIP archives whose uncompressed size is too large", async () => {
    mocks.verifyAuthToken.mockResolvedValue({ valid: true, userId: "admin", role: "admin" });
    mocks.unzipSync.mockReturnValue({
      "article.md": { byteLength: 101 * 1024 * 1024 } as Uint8Array,
    });

    const response = await POST(authedZipRequest());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("100MB");
    expect(mocks.serverCreateArticle).not.toHaveBeenCalled();
  });

  it("keeps accepting a small valid markdown ZIP", async () => {
    mocks.verifyAuthToken.mockResolvedValue({ valid: true, userId: "admin", role: "admin" });
    mocks.unzipSync.mockReturnValue({
      "article.md": new Uint8Array([1, 2, 3]),
    });
    mocks.strFromU8.mockReturnValue("---\ntitle: ZIP Test\n---\nBody text");
    mocks.serverMigrateBodyImages.mockImplementation(async (html: string) => html);
    mocks.serverCreateArticle.mockResolvedValue(undefined);

    const response = await POST(authedZipRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, total: 1, succeeded: 1, failed: 0 });
    expect(mocks.serverCreateArticle).toHaveBeenCalledWith(expect.objectContaining({
      title: "ZIP Test",
      body: expect.stringContaining("Body text"),
    }));
  });
});
