import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetSetting: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetSetting: mocks.serverGetSetting,
}));

describe("IndexNow key root route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("serves the configured IndexNow key as a root txt file", async () => {
    mocks.serverGetSetting.mockResolvedValue({ indexNowApiKey: "abc12345" });
    const { GET } = await import("@/app/[indexNowKey]/route");

    const response = await GET(
      new NextRequest("https://culturepeople.co.kr/abc12345.txt"),
      { params: Promise.resolve({ indexNowKey: "abc12345.txt" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("abc12345");
  });

  it("returns 404 for mismatched or non-txt key requests", async () => {
    mocks.serverGetSetting.mockResolvedValue({ indexNowApiKey: "abc12345" });
    const { GET } = await import("@/app/[indexNowKey]/route");

    const wrongKey = await GET(
      new NextRequest("https://culturepeople.co.kr/wrongkey.txt"),
      { params: Promise.resolve({ indexNowKey: "wrongkey.txt" }) },
    );
    const nonTxt = await GET(
      new NextRequest("https://culturepeople.co.kr/abc12345"),
      { params: Promise.resolve({ indexNowKey: "abc12345" }) },
    );

    expect(wrongKey.status).toBe(404);
    expect(nonTxt.status).toBe(404);
  });
});
