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
      { id: "recent", no: 501, title: "최근 뉴스", date: recentDate, thumbnail: "https://media.example.com/recent.jpg" },
      { id: "old", no: 1, title: "오래된 뉴스", date: oldDate },
    ]);
    const { GET } = await import("@/app/news-sitemap.xml/route");

    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/xml");
    expect(mocks.serverGetFeedArticles).toHaveBeenCalledWith({ limit: 1000, includeBody: false });
    expect(xml).toContain("xmlns:news=\"http://www.google.com/schemas/sitemap-news/0.9\"");
    expect(xml).toContain("xmlns:image=\"http://www.google.com/schemas/sitemap-image/1.1\"");
    expect(xml).toContain("<loc>https://culturepeople.co.kr/article/501</loc>");
    expect(xml).toContain("<image:loc>https://media.example.com/recent.jpg</image:loc>");
    expect(xml).toContain("<news:title>최근 뉴스</news:title>");
    expect(xml).not.toContain("오래된 뉴스");
  });

  it("uses the precise creation time when the stored editorial date has no time", async () => {
    const createdAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const kstDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(createdAt));
    mocks.serverGetSetting.mockResolvedValue({ canonicalUrl: "https://culturepeople.co.kr" });
    mocks.serverGetFeedArticles.mockResolvedValue([
      { id: "precise", no: 502, title: "발행 시각 뉴스", date: kstDate, createdAt },
    ]);
    const { GET } = await import("@/app/news-sitemap.xml/route");

    const response = await GET();
    const xml = await response.text();

    expect(xml).toContain(`<news:publication_date>${createdAt}</news:publication_date>`);
  });
});
