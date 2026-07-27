import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  serverGetFilteredArticles: vi.fn(),
  serverGetSetting: vi.fn(),
}));

vi.mock("@/lib/cookie-auth", () => ({
  isAuthenticated: mocks.isAuthenticated,
}));

vi.mock("@/lib/db-server", () => ({
  serverGetFilteredArticles: mocks.serverGetFilteredArticles,
  serverGetSetting: mocks.serverGetSetting,
}));

describe("/api/cam/portal-review", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires an authenticated admin request", async () => {
    mocks.isAuthenticated.mockResolvedValue(false);
    const { GET } = await import("@/app/api/cam/portal-review/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/cam/portal-review"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("returns a JSON portal review report", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.serverGetSetting.mockResolvedValue({ canonicalUrl: "https://culturepeople.co.kr" });
    mocks.serverGetFilteredArticles.mockResolvedValue({
      total: 1,
      articles: [
        {
          id: "article-1",
          no: 501,
          title: "심사 기사",
          category: "문화",
          date: "2026-06-01T00:00:00.000Z",
          status: "게시",
          views: 0,
          body: "<p>body</p>",
          author: "컬처피플",
        },
      ],
    });
    const { GET } = await import("@/app/api/cam/portal-review/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/cam/portal-review?months=6"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.report.rows[0].articleUrl).toBe("https://culturepeople.co.kr/article/501");
    expect(mocks.serverGetFilteredArticles).toHaveBeenCalledWith(expect.objectContaining({
      status: "게시",
      limit: 10000,
      authed: true,
    }));
  });

  it("returns a CSV attachment", async () => {
    mocks.isAuthenticated.mockResolvedValue(true);
    mocks.serverGetSetting.mockResolvedValue({ canonicalUrl: "https://culturepeople.co.kr" });
    mocks.serverGetFilteredArticles.mockResolvedValue({
      total: 1,
      articles: [
        {
          id: "article-1",
          no: 501,
          title: "CSV 기사",
          category: "문화",
          date: "2026-06-01T00:00:00.000Z",
          status: "게시",
          views: 0,
          body: "<p>body</p>",
          author: "컬처피플",
        },
      ],
    });
    const { GET } = await import("@/app/api/cam/portal-review/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/api/cam/portal-review?format=csv"));
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("culturepeople-portal-review");
    expect(csv).toContain("CSV 기사");
  });
});
