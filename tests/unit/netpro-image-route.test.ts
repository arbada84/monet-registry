import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const safeFetchMock = vi.hoisted(() => vi.fn());
const assertSafeRemoteUrlMock = vi.hoisted(() => vi.fn());
const isPlausiblySafeRemoteUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/safe-remote-url", () => ({
  assertSafeRemoteUrl: assertSafeRemoteUrlMock,
  isPlausiblySafeRemoteUrl: isPlausiblySafeRemoteUrlMock,
  safeFetch: safeFetchMock,
}));

import { GET } from "@/app/api/netpro/image/route";

function jpegBuffer(size = 64): ArrayBuffer {
  const buffer = new ArrayBuffer(size);
  const bytes = new Uint8Array(buffer);
  bytes[0] = 0xFF;
  bytes[1] = 0xD8;
  bytes[2] = 0xFF;
  bytes[3] = 0xDB;
  return buffer;
}

function request(url: string, token = "worker-secret") {
  return new NextRequest(`https://culturepeople.co.kr/api/netpro/image?url=${encodeURIComponent(url)}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

describe("GET /api/netpro/image", () => {
  const originalSecret = process.env.AUTO_PRESS_WORKER_SECRET;

  beforeEach(() => {
    process.env.AUTO_PRESS_WORKER_SECRET = "worker-secret";
    assertSafeRemoteUrlMock.mockResolvedValue(undefined);
    isPlausiblySafeRemoteUrlMock.mockReturnValue(true);
  });

  afterEach(() => {
    safeFetchMock.mockReset();
    assertSafeRemoteUrlMock.mockReset();
    isPlausiblySafeRemoteUrlMock.mockReset();
    if (originalSecret === undefined) delete process.env.AUTO_PRESS_WORKER_SECRET;
    else process.env.AUTO_PRESS_WORKER_SECRET = originalSecret;
  });

  it("requires the worker secret", async () => {
    const response = await GET(request("https://example.com/a.jpg", "wrong-secret"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("returns direct image bytes after validating the magic bytes", async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(jpegBuffer(), {
      status: 200,
      headers: {
        "content-type": "application/x-download",
        "content-length": "64",
      },
    }));

    const response = await GET(request("https://www.korea.kr/common/download.do?fileId=1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-cp-image-proxy")).toBe("direct");
    expect((await response.arrayBuffer()).byteLength).toBe(64);
  });

  it("falls back to the image proxy when direct download fails", async () => {
    safeFetchMock
      .mockResolvedValueOnce(new Response("bad gateway", { status: 525 }))
      .mockResolvedValueOnce(new Response(jpegBuffer(128), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "128",
        },
      }));

    const response = await GET(request("https://www.korea.kr/common/download.do?fileId=2"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cp-image-proxy")).toBe("proxy");
    expect(String(safeFetchMock.mock.calls[1][0])).toContain("images.weserv.nl");
  });

  it("rejects unsafe URLs before fetching", async () => {
    isPlausiblySafeRemoteUrlMock.mockReturnValue(false);

    const response = await GET(request("http://localhost/image.jpg"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });
});
