import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverAddViewLog: vi.fn(),
  serverIncrementViews: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverAddViewLog: mocks.serverAddViewLog,
  serverIncrementViews: mocks.serverIncrementViews,
}));

vi.mock("@/lib/cookie-auth", () => ({
  verifyAuthToken: mocks.verifyAuthToken,
}));

function request(userAgent: string, ip: string, cookie = "") {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": userAgent,
    "x-forwarded-for": ip,
  };
  if (cookie) headers.cookie = cookie;
  return new NextRequest("https://culturepeople.co.kr/api/db/article-view", {
    method: "POST",
    headers,
    body: JSON.stringify({ articleId: "article-1", path: "/article/1" }),
  });
}

describe("article-view route", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("does not write view logs or increment views for bots", async () => {
    const { POST } = await import("@/app/api/db/article-view/route");

    const response = await POST(request("Googlebot/2.1", "203.0.113.10"));
    const json = await response.json();

    expect(json).toMatchObject({ success: true, counted: false, reason: "bot" });
    expect(mocks.serverAddViewLog).not.toHaveBeenCalled();
    expect(mocks.serverIncrementViews).not.toHaveBeenCalled();
  });

  it("does not write view logs or increment views for admins", async () => {
    mocks.verifyAuthToken.mockResolvedValue({ valid: true });
    const { POST } = await import("@/app/api/db/article-view/route");

    const response = await POST(request("Mozilla/5.0", "203.0.113.11", "cp-admin-auth=valid"));
    const json = await response.json();

    expect(json).toMatchObject({ success: true, counted: false, reason: "admin" });
    expect(mocks.serverAddViewLog).not.toHaveBeenCalled();
    expect(mocks.serverIncrementViews).not.toHaveBeenCalled();
  });

  it("writes one log and increments views for a human visitor", async () => {
    mocks.verifyAuthToken.mockResolvedValue({ valid: false });
    const { POST } = await import("@/app/api/db/article-view/route");

    const response = await POST(request("Mozilla/5.0", "203.0.113.12"));
    const json = await response.json();

    expect(json).toMatchObject({ success: true, counted: true });
    expect(mocks.serverAddViewLog).toHaveBeenCalledWith(expect.objectContaining({
      articleId: "article-1",
      isAdmin: false,
      isBot: false,
    }));
    expect(mocks.serverIncrementViews).toHaveBeenCalledWith("article-1", { isBot: false });
  });
});
