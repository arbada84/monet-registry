import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetFeedArticles: vi.fn(),
  serverGetSetting: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetFeedArticles: mocks.serverGetFeedArticles,
  serverGetSetting: mocks.serverGetSetting,
}));

describe("/news-sitemap.xml route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a Google News sitemap for articles from the last 48 hours", async () => {
    const recentDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    mocks.serverGetSetting.mockResolvedValue({ canonicalUrl: "https://culturepeople.co.kr" });
    mocks.serverGetFeedArticles.mockResolvedValue([
      { id: "recent", no: 501, title: "최근 뉴스", date: recentDate },
      { id: "old", no: 1, title: "오래된 뉴스", date: oldDate },
    ]);
    const { GET } = await import("@/app/news-sitemap.xml/route");

    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/xml");
    expect(mocks.serverGetFeedArticles).toHaveBeenCalledWith({ limit: 1000, includeBody: false });
    expect(xml).toContain("xmlns:news=\"http://www.google.com/schemas/sitemap-news/0.9\"");
    expect(xml).toContain("<loc>https://culturepeople.co.kr/article/501</loc>");
    expect(xml).toContain("<news:title>최근 뉴스</news:title>");
    expect(xml).not.toContain("오래된 뉴스");
  });
});
