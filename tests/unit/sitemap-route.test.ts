import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetArticleSitemapData: vi.fn(),
  serverGetFeedArticles: vi.fn(),
  serverGetSetting: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetArticleSitemapData: mocks.serverGetArticleSitemapData,
  serverGetFeedArticles: mocks.serverGetFeedArticles,
  serverGetSetting: mocks.serverGetSetting,
}));

describe("/sitemap.xml route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SITEMAP_MIN_ARTICLE_COUNT;
  });

  it("uses article updatedAt before publish date for lastmod", async () => {
    process.env.SITEMAP_MIN_ARTICLE_COUNT = "1";
    mocks.serverGetArticleSitemapData.mockResolvedValue([
      {
        no: 77,
        date: "2026-04-29T00:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z",
        tags: "",
        author: "",
      },
    ]);
    mocks.serverGetSetting.mockResolvedValue([]);
    mocks.serverGetFeedArticles.mockResolvedValue([{ id: "article-77", no: 77, title: "latest", date: "2026-04-29T00:00:00.000Z" }]);
    const { GET } = await import("@/app/sitemap.xml/route");

    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain("<loc>https://culturepeople.co.kr/article/77</loc>");
    expect(xml).not.toContain("<loc>https://culturepeople.co.kr/search</loc>");
    expect(xml).toContain("<loc>https://culturepeople.co.kr/alidot</loc>");
    expect(xml).toContain("<loc>https://culturepeople.co.kr/alidot/terms</loc>");
    expect(xml).toContain("<loc>https://culturepeople.co.kr/alidot/privacy</loc>");
    expect(xml).toContain("<lastmod>2026-04-30T12:00:00.000Z</lastmod>");
    expect(xml).not.toContain("<lastmod>2026-04-29T00:00:00.000Z</lastmod>");
  });

  it("returns 503 instead of a static-only 200 when article data is unavailable", async () => {
    process.env.SITEMAP_MIN_ARTICLE_COUNT = "1";
    mocks.serverGetArticleSitemapData.mockRejectedValue(new Error("D1 unavailable"));
    mocks.serverGetFeedArticles.mockResolvedValue([]);
    mocks.serverGetSetting.mockResolvedValue([]);
    const { GET } = await import("@/app/sitemap.xml/route");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 when the newest published article is missing", async () => {
    process.env.SITEMAP_MIN_ARTICLE_COUNT = "1";
    mocks.serverGetArticleSitemapData.mockResolvedValue([{ no: 10, date: "2026-07-01T00:00:00Z" }]);
    mocks.serverGetFeedArticles.mockResolvedValue([{ id: "latest", no: 11, title: "latest", date: "2026-07-02T00:00:00Z" }]);
    mocks.serverGetSetting.mockResolvedValue([]);
    const { GET } = await import("@/app/sitemap.xml/route");

    expect((await GET()).status).toBe(503);
  });

  it("includes only tag pages backed by at least three published articles", async () => {
    process.env.SITEMAP_MIN_ARTICLE_COUNT = "1";
    mocks.serverGetArticleSitemapData.mockResolvedValue([
      { no: 1, date: "2026-07-01T00:00:00Z", tags: "문화,단일" },
      { no: 2, date: "2026-07-02T00:00:00Z", tags: "문화,두건" },
      { no: 3, date: "2026-07-03T00:00:00Z", tags: "문화,두건" },
    ]);
    mocks.serverGetFeedArticles.mockResolvedValue([
      { id: "latest", no: 3, title: "latest", date: "2026-07-03T00:00:00Z" },
    ]);
    mocks.serverGetSetting.mockResolvedValue([]);
    const { GET } = await import("@/app/sitemap.xml/route");

    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain("<loc>https://culturepeople.co.kr/tag/%EB%AC%B8%ED%99%94</loc>");
    expect(xml).not.toContain(encodeURIComponent("단일"));
    expect(xml).not.toContain(encodeURIComponent("두건"));
  });
});
