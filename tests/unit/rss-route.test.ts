import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  serverGetFeedArticles: vi.fn(),
  serverGetSetting: vi.fn(),
  getApprovedEditorialNoticesForArticleNos: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetFeedArticles: mocks.serverGetFeedArticles,
  serverGetSetting: mocks.serverGetSetting,
}));

vi.mock("@/lib/editorial/repository", () => ({
  getApprovedEditorialNoticesForArticleNos: mocks.getApprovedEditorialNoticesForArticleNos,
}));

describe("/rss.xml route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.getApprovedEditorialNoticesForArticleNos.mockResolvedValue(new Map());
  });

  it("includes only approved editorial notices supplied by the repository", async () => {
    mocks.serverGetSetting.mockImplementation(async (key: string) => {
      if (key === "cp-seo-settings") return { canonicalUrl: "https://culturepeople.co.kr" };
      return { itemCount: 10, fullContent: true };
    });
    mocks.serverGetFeedArticles.mockResolvedValue([{
      id: "article-1",
      no: 401,
      title: "정정 기사",
      summary: "요약",
      body: "<p>본문</p>",
      date: "2026-07-29T00:00:00.000Z",
      category: "문화",
      author: "박영래",
      thumbnail: "",
    }]);
    mocks.getApprovedEditorialNoticesForArticleNos.mockResolvedValue(new Map([[
      401,
      [{ id: "notice-1", type: "correction", summary: "수치를 바로잡았습니다.", approvedAt: "2026-07-29T01:00:00.000Z" }],
    ]]));
    const { GET } = await import("@/app/rss.xml/route");
    const response = await GET(new NextRequest("https://culturepeople.co.kr/rss.xml"));
    const xml = await response.text();
    expect(xml).toContain("data-editorial-notice");
    expect(xml).toContain("수치를 바로잡았습니다.");
    expect(xml).toContain("<p>본문</p>");
  });

  it("serves RSS directly with full article body by default", async () => {
    mocks.serverGetSetting.mockImplementation(async (key: string) => {
      if (key === "cp-seo-settings") return { canonicalUrl: "https://culturepeople.co.kr" };
      if (key === "cp-rss-settings") return { itemCount: 10 };
      return {};
    });
    mocks.serverGetFeedArticles.mockResolvedValue([
      {
        id: "article-1",
        no: 401,
        title: "RSS 본문 기사",
        summary: "짧은 요약",
        body: "<p>포털 제출용 전체 본문입니다.</p>",
        date: new Date().toISOString(),
        category: "문화",
        author: "컬처피플",
        thumbnail: "https://media.example.com/thumb.jpg",
      },
    ]);
    const { GET } = await import("@/app/rss.xml/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/rss.xml"));
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/rss+xml");
    expect(xml).toContain("<atom:link href=\"https://culturepeople.co.kr/rss.xml\" rel=\"self\" type=\"application/rss+xml\" />");
    expect(xml).toContain("<content:encoded><![CDATA[<p>포털 제출용 전체 본문입니다.</p>]]></content:encoded>");
    expect(xml).toContain("<description>&lt;p&gt;포털 제출용 전체 본문입니다.&lt;/p&gt;</description>");
  });

  it("returns an empty 200 feed when the article provider is unavailable", async () => {
    mocks.serverGetSetting.mockResolvedValue({});
    mocks.serverGetFeedArticles.mockRejectedValue(new Error("provider unavailable"));
    const { GET } = await import("@/app/rss.xml/route");

    const response = await GET(new NextRequest("https://culturepeople.co.kr/rss.xml"));
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/rss+xml");
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});
