import { afterEach, describe, expect, it, vi } from "vitest";

const safeFetchMock = vi.hoisted(() => vi.fn());
const uploadBufferMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/lib/safe-remote-url", () => ({
  assertSafeRemoteUrl: vi.fn().mockResolvedValue(undefined),
  isPlausiblySafeRemoteUrl: vi.fn(() => true),
  safeFetch: safeFetchMock,
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

function bytes(values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

describe("server image upload detection", () => {
  afterEach(() => {
    safeFetchMock.mockReset();
    uploadBufferMock.mockReset();
  });

  it("detects supported image formats from magic bytes", async () => {
    const { detectImageType } = await import("@/lib/server-upload-image");

    expect(detectImageType(bytes([0xFF, 0xD8, 0xFF, 0xDB]))).toBe("image/jpeg");
    expect(detectImageType(bytes([0x89, 0x50, 0x4E, 0x47]))).toBe("image/png");
    expect(detectImageType(bytes([0x47, 0x49, 0x46, 0x38]))).toBe("image/gif");
    expect(detectImageType(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(detectImageType(bytes([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it("uploads korea download responses when bytes are a real image", async () => {
    uploadBufferMock.mockResolvedValue("https://media.culturepeople.co.kr/images/test.jpg");
    safeFetchMock.mockResolvedValueOnce(new Response(bytes([0xFF, 0xD8, 0xFF, 0xDB]), {
      status: 200,
      headers: {
        "content-length": "5502016",
        "content-type": "application/x-download",
      },
    }));

    const { serverUploadImageUrl } = await import("@/lib/server-upload-image");
    const url = await serverUploadImageUrl("https://www.korea.kr/common/download.do?fileId=198448595&tblKey=GMN");

    expect(url).toBe("https://media.culturepeople.co.kr/images/test.jpg");
    expect(uploadBufferMock).toHaveBeenCalledWith(expect.objectContaining({
      mime: "image/jpeg",
      ext: "jpg",
    }));
  });

  it("rejects download responses whose bytes are not an image", async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(bytes([0x25, 0x50, 0x44, 0x46]), {
      status: 200,
      headers: {
        "content-type": "application/x-download",
      },
    }));

    const { serverUploadImageUrl } = await import("@/lib/server-upload-image");
    const url = await serverUploadImageUrl("https://www.korea.kr/common/download.do?fileId=not-image&tblKey=GMN");

    expect(url).toBeNull();
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });
});
