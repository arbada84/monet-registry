import { describe, expect, it } from "vitest";
import type { Article } from "@/types/article";
import { buildPortalReviewReport, portalReviewToCsv } from "@/lib/portal-review";

const articles: Article[] = [
  {
    id: "manual-1",
    no: 101,
    title: "자체 기사",
    category: "문화",
    date: "2026-05-10T09:00:00.000Z",
    updatedAt: "2026-05-11T09:00:00.000Z",
    status: "게시",
    views: 10,
    body: "<p>body</p>",
    author: "김기자",
  },
  {
    id: "press-1",
    no: 102,
    title: "보도자료 기사",
    category: "공연",
    date: "2026-04-10T09:00:00.000Z",
    status: "게시",
    views: 5,
    body: "<p>body</p>",
    author: "박기자",
    sourceUrl: "https://example.com/press",
  },
  {
    id: "ai-1",
    no: 103,
    title: "AI 기사",
    category: "문화",
    date: "2026-03-10T09:00:00.000Z",
    status: "게시",
    views: 1,
    body: "<p>body</p>",
    author: "김기자",
    aiGenerated: true,
  },
  {
    id: "old-1",
    no: 104,
    title: "기간 밖 기사",
    category: "문화",
    date: "2025-01-10T09:00:00.000Z",
    status: "게시",
    views: 1,
    body: "<p>body</p>",
  },
];

describe("portal review report", () => {
  it("builds submission rows and review summary for the selected period", () => {
    const report = buildPortalReviewReport(articles, {
      baseUrl: "https://culturepeople.co.kr/",
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-05-31T00:00:00.000Z",
      generatedAt: "2026-06-14T00:00:00.000Z",
    });

    expect(report.rows).toHaveLength(3);
    expect(report.rows[0]).toMatchObject({
      no: 101,
      articleUrl: "https://culturepeople.co.kr/article/101",
      reviewType: "자체기사 후보",
    });
    expect(report.summary).toMatchObject({
      total: 3,
      aiGenerated: 1,
      externalSource: 1,
      ownArticleCandidate: 1,
    });
    expect(report.summary.byCategory).toContainEqual({ name: "문화", count: 2 });
    expect(report.summary.byAuthor).toContainEqual({ name: "김기자", count: 2 });
  });

  it("exports a Korean CSV with escaped cells", () => {
    const report = buildPortalReviewReport([
      { ...articles[0], title: "따옴표 \" 포함" },
    ], {
      baseUrl: "https://culturepeople.co.kr",
      from: "2026-05-01",
      to: "2026-05-31",
    });

    const csv = portalReviewToCsv(report);

    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain("\"기사 번호\",\"ID\",\"제목\"");
    expect(csv).toContain("\"따옴표 \"\" 포함\"");
  });
});
