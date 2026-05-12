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

function jpegBuffer(size: number): ArrayBuffer {
  const buffer = new ArrayBuffer(size);
  const body = new Uint8Array(buffer);
  body[0] = 0xFF;
  body[1] = 0xD8;
  body[2] = 0xFF;
  body[3] = 0xDB;
  return buffer;
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

  it("does not download an oversized proxy response", async () => {
    const proxyArrayBuffer = vi.fn().mockResolvedValue(jpegBuffer(12 * 1024 * 1024));
    safeFetchMock
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce({
        ok: true,
        redirected: false,
        headers: new Headers({
          "content-length": String(12 * 1024 * 1024),
          "content-type": "image/jpeg",
        }),
        arrayBuffer: proxyArrayBuffer,
      });

    const { serverUploadImageUrl } = await import("@/lib/server-upload-image");
    const url = await serverUploadImageUrl("https://example.com/oversized.jpg");

    expect(url).toBeNull();
    expect(proxyArrayBuffer).not.toHaveBeenCalled();
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });

  it("uploads ZIP buffers using detected bytes instead of the filename extension", async () => {
    uploadBufferMock.mockResolvedValue("https://media.culturepeople.co.kr/images/test.jpg");

    const { serverUploadBuffer } = await import("@/lib/server-upload-image");
    const uploaded = await serverUploadBuffer(new Uint8Array(jpegBuffer(16)), "image.png");

    expect(uploaded).toBe("https://media.culturepeople.co.kr/images/test.jpg");
    expect(uploadBufferMock).toHaveBeenCalledWith(expect.objectContaining({
      mime: "image/jpeg",
      ext: "jpg",
    }));
  });

  it("rejects ZIP buffers whose bytes are not an image", async () => {
    const { serverUploadBuffer } = await import("@/lib/server-upload-image");
    const uploaded = await serverUploadBuffer(new Uint8Array(bytes([0x25, 0x50, 0x44, 0x46])), "image.jpg");

    expect(uploaded).toBeNull();
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });
});
