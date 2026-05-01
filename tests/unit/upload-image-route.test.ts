import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const safeFetchMock = vi.hoisted(() => vi.fn());
const uploadBufferMock = vi.hoisted(() => vi.fn());
const verifyAuthTokenMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/lib/safe-remote-url", () => ({
  assertSafeRemoteUrl: vi.fn().mockResolvedValue(undefined),
  isPlausiblySafeRemoteUrl: vi.fn(() => true),
  safeFetch: safeFetchMock,
}));

vi.mock("@/lib/cookie-auth", () => ({
  verifyAuthToken: verifyAuthTokenMock,
}));

vi.mock("@/lib/image-processing-settings", () => ({
  getImageUploadSettings: vi.fn().mockResolvedValue({
    enabled: false,
    maxWidth: 1920,
    quality: 80,
  }),
}));

vi.mock("@/lib/watermark", () => ({
  applyWatermark: vi.fn(async (buffer: Buffer) => buffer),
  getWatermarkSettings: vi.fn().mockResolvedValue({
    enabled: false,
    type: "text",
    text: "",
    imageUrl: "",
    opacity: 0.5,
    size: 20,
    position: "bottom-right",
  }),
}));

vi.mock("@/lib/media-storage", () => ({
  isMediaStorageConfigured: vi.fn(() => true),
  isPublicMediaUrl: vi.fn(() => false),
  uploadBufferToMediaStorage: uploadBufferMock,
}));

import { POST } from "@/app/api/upload/image/route";

function jpegBuffer(size: number): ArrayBuffer {
  const buffer = new ArrayBuffer(size);
  const body = new Uint8Array(buffer);
  body[0] = 0xFF;
  body[1] = 0xD8;
  body[2] = 0xFF;
  body[3] = 0xDB;
  return buffer;
}

function jsonUploadRequest(url: string) {
  return new NextRequest("https://culturepeople.co.kr/api/upload/image", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "cp-admin-auth=test-token",
    },
    body: JSON.stringify({ url }),
  });
}

describe("POST /api/upload/image", () => {
  afterEach(() => {
    safeFetchMock.mockReset();
    uploadBufferMock.mockReset();
    verifyAuthTokenMock.mockReset();
  });

  it("accepts remote government download images above the direct upload limit", async () => {
    const source = jpegBuffer(5_502_016);
    verifyAuthTokenMock.mockResolvedValue({ valid: true, userId: "admin", role: "admin" });
    uploadBufferMock.mockResolvedValue("https://media.culturepeople.co.kr/images/test.jpg");
    safeFetchMock.mockResolvedValueOnce(new Response(source, {
      status: 200,
      headers: {
        "content-length": String(source.byteLength),
        "content-type": "application/x-download",
      },
    }));

    const response = await POST(jsonUploadRequest("https://www.korea.kr/common/download.do?fileId=198448595&tblKey=GMN"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, url: "https://media.culturepeople.co.kr/images/test.jpg" });
    expect(uploadBufferMock).toHaveBeenCalledWith(expect.objectContaining({
      mime: "image/jpeg",
      ext: "jpg",
    }));
  });

  it("keeps direct multipart uploads capped at 5MB", async () => {
    verifyAuthTokenMock.mockResolvedValue({ valid: true, userId: "admin", role: "admin" });
    const form = new FormData();
    form.append("file", new File([jpegBuffer(5 * 1024 * 1024 + 1)], "too-large.jpg", { type: "image/jpeg" }));

    const response = await POST(new NextRequest("https://culturepeople.co.kr/api/upload/image", {
      method: "POST",
      headers: {
        cookie: "cp-admin-auth=test-token",
      },
      body: form,
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });
});
