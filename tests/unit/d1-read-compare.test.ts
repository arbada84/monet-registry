import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sbGetRecentArticlesMock = vi.fn();
const sbSearchArticlesMock = vi.fn();
const sbGetSettingMock = vi.fn();
const sbGetFeedArticlesMock = vi.fn();
const sbGetTopArticlesMock = vi.fn();
const sbGetScheduledArticlesMock = vi.fn();
const sbGetDeletedArticlesMock = vi.fn();
const sbGetMaintenanceArticlesMock = vi.fn();
const sbGetArticleSitemapDataMock = vi.fn();
const sbGetRecentTitlesMock = vi.fn();
const d1GetRecentArticlesMock = vi.fn();
const d1SearchArticlesMock = vi.fn();
const d1GetSettingMock = vi.fn();
const d1GetFeedArticlesMock = vi.fn();
const d1GetTopArticlesMock = vi.fn();
const d1GetScheduledArticlesMock = vi.fn();
const d1GetDeletedArticlesMock = vi.fn();
const d1GetMaintenanceArticlesMock = vi.fn();
const d1GetArticleSitemapDataMock = vi.fn();
const d1GetRecentTitlesMock = vi.fn();

vi.mock("@/lib/supabase-server-db", () => ({
  sbGetRecentArticles: sbGetRecentArticlesMock,
  sbSearchArticles: sbSearchArticlesMock,
  sbGetSetting: sbGetSettingMock,
  sbGetFeedArticles: sbGetFeedArticlesMock,
  sbGetTopArticles: sbGetTopArticlesMock,
  sbGetScheduledArticles: sbGetScheduledArticlesMock,
  sbGetDeletedArticles: sbGetDeletedArticlesMock,
  sbGetMaintenanceArticles: sbGetMaintenanceArticlesMock,
  sbGetArticleSitemapData: sbGetArticleSitemapDataMock,
  sbGetRecentTitles: sbGetRecentTitlesMock,
}));

vi.mock("@/lib/d1-server-db", () => ({
  d1GetRecentArticles: d1GetRecentArticlesMock,
  d1SearchArticles: d1SearchArticlesMock,
  d1GetSetting: d1GetSettingMock,
  d1GetFeedArticles: d1GetFeedArticlesMock,
  d1GetTopArticles: d1GetTopArticlesMock,
  d1GetScheduledArticles: d1GetScheduledArticlesMock,
  d1GetDeletedArticles: d1GetDeletedArticlesMock,
  d1GetMaintenanceArticles: d1GetMaintenanceArticlesMock,
  d1GetArticleSitemapData: d1GetArticleSitemapDataMock,
  d1GetRecentTitles: d1GetRecentTitlesMock,
}));

function article(id: string, title = id) {
  return {
    id,
    no: Number(id.replace(/\D/g, "")) || 1,
    title,
    category: "\uB274\uC2A4",
    date: "2026-04-29",
    status: "\uAC8C\uC2DC",
    views: 0,
    body: "",
    slug: id,
  };
}

describe("D1 read shadow compare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sbGetRecentArticlesMock.mockResolvedValue([]);
    sbSearchArticlesMock.mockResolvedValue([]);
    sbGetSettingMock.mockResolvedValue({ enabled: true });
    sbGetFeedArticlesMock.mockResolvedValue([]);
    sbGetTopArticlesMock.mockResolvedValue([]);
    sbGetScheduledArticlesMock.mockResolvedValue([]);
    sbGetDeletedArticlesMock.mockResolvedValue([]);
    sbGetMaintenanceArticlesMock.mockResolvedValue([]);
    sbGetArticleSitemapDataMock.mockResolvedValue([]);
    sbGetRecentTitlesMock.mockResolvedValue([]);
    d1GetRecentArticlesMock.mockResolvedValue([]);
    d1SearchArticlesMock.mockResolvedValue([]);
    d1GetSettingMock.mockResolvedValue({ enabled: true });
    d1GetFeedArticlesMock.mockResolvedValue([]);
    d1GetTopArticlesMock.mockResolvedValue([]);
    d1GetScheduledArticlesMock.mockResolvedValue([]);
    d1GetDeletedArticlesMock.mockResolvedValue([]);
    d1GetMaintenanceArticlesMock.mockResolvedValue([]);
    d1GetArticleSitemapDataMock.mockResolvedValue([]);
    d1GetRecentTitlesMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports ok when recent articles, search results, and settings match", async () => {
    sbGetRecentArticlesMock.mockResolvedValueOnce([article("a1"), article("a2")]);
    d1GetRecentArticlesMock.mockResolvedValueOnce([article("a1"), article("a2")]);
    sbSearchArticlesMock.mockResolvedValueOnce([article("a1")]);
    d1SearchArticlesMock.mockResolvedValueOnce([article("a1")]);
    sbGetSettingMock.mockResolvedValue({ enabled: true });
    d1GetSettingMock.mockResolvedValue({ enabled: true });

    const { buildD1ReadCompareReport } = await import("@/lib/d1-read-compare");
    const report = await buildD1ReadCompareReport({
      limit: 2,
      searchQuery: "\uB274\uC2A4",
      settingKeys: ["cp-auto-press-settings"],
    });

    expect(report.ok).toBe(true);
    expect(report.recent).toMatchObject({ ok: true, supabaseCount: 2, d1Count: 2 });
    expect(report.search).toMatchObject({ ok: true, supabaseCount: 1, d1Count: 1 });
    expect(report.articleChecks.recent).toMatchObject({ ok: true, supabaseCount: 2, d1Count: 2 });
    expect(report.articleChecks.feed).toMatchObject({ ok: true, supabaseCount: 0, d1Count: 0 });
    expect(report.dataChecks.sitemap).toMatchObject({ ok: true, supabaseCount: 0, d1Count: 0 });
    expect(report.settings).toEqual([{
      ok: true,
      key: "cp-auto-press-settings",
      supabaseFound: true,
      d1Found: true,
      mismatch: false,
    }]);
  });

  it("reports article mismatches without throwing", async () => {
    sbGetRecentArticlesMock.mockResolvedValueOnce([article("a1", "Supabase title"), article("a2")]);
    d1GetRecentArticlesMock.mockResolvedValueOnce([article("a1", "D1 title"), article("a3")]);
    sbGetSettingMock.mockResolvedValue({ enabled: true });
    d1GetSettingMock.mockResolvedValue({ enabled: true });

    const { buildD1ReadCompareReport } = await import("@/lib/d1-read-compare");
    const report = await buildD1ReadCompareReport({
      limit: 2,
      settingKeys: ["cp-auto-press-settings"],
    });

    expect(report.ok).toBe(false);
    expect(report.recent?.missingInD1.map((item) => item.id)).toEqual(["a2"]);
    expect(report.recent?.missingInSupabase.map((item) => item.id)).toEqual(["a3"]);
    expect(report.recent?.fieldMismatches).toEqual([
      { id: "a1", field: "title", supabase: "Supabase title", d1: "D1 title" },
    ]);
  });

  it("keeps provider errors in the report", async () => {
    sbGetRecentArticlesMock.mockRejectedValueOnce(new Error("Supabase 402"));
    sbGetSettingMock.mockRejectedValueOnce(new Error("settings unavailable"));

    const { buildD1ReadCompareReport } = await import("@/lib/d1-read-compare");
    const report = await buildD1ReadCompareReport({
      limit: 2,
      settingKeys: ["cp-auto-press-settings"],
    });

    expect(report.ok).toBe(false);
    expect(report.recent).toBeNull();
    expect(report.errors).toEqual([
      "recent: Supabase 402",
      "setting:cp-auto-press-settings: settings unavailable",
    ]);
  });

  it("compares expanded article and data checks", async () => {
    sbGetFeedArticlesMock.mockResolvedValueOnce([article("feed1")]);
    d1GetFeedArticlesMock.mockResolvedValueOnce([article("feed1")]);
    sbGetTopArticlesMock.mockResolvedValueOnce([article("top1")]);
    d1GetTopArticlesMock.mockResolvedValueOnce([article("top1")]);
    sbGetScheduledArticlesMock.mockResolvedValueOnce([article("scheduled1")]);
    d1GetScheduledArticlesMock.mockResolvedValueOnce([article("scheduled1")]);
    sbGetDeletedArticlesMock.mockResolvedValueOnce([article("deleted1")]);
    d1GetDeletedArticlesMock.mockResolvedValueOnce([article("deleted1")]);
    sbGetMaintenanceArticlesMock.mockResolvedValueOnce([article("maint1")]);
    d1GetMaintenanceArticlesMock.mockResolvedValueOnce([article("maint1")]);
    sbGetArticleSitemapDataMock.mockResolvedValueOnce([{ no: 1, date: "2026-04-29", tags: "culture", author: "Reporter" }]);
    d1GetArticleSitemapDataMock.mockResolvedValueOnce([{ no: 1, date: "2026-04-29", tags: "culture", author: "Reporter" }]);
    sbGetRecentTitlesMock.mockResolvedValueOnce([{ title: "Existing", sourceUrl: "https://example.com/source" }]);
    d1GetRecentTitlesMock.mockResolvedValueOnce([{ title: "Existing", sourceUrl: "https://example.com/source" }]);

    const { buildD1ReadCompareReport } = await import("@/lib/d1-read-compare");
    const report = await buildD1ReadCompareReport({
      limit: 5,
      checks: ["feed", "top", "scheduled", "deleted", "maintenance", "sitemap", "recent-titles"],
      settingKeys: [],
      recentTitleDays: 14,
    });

    expect(report.ok).toBe(true);
    expect(report.articleChecks.feed).toMatchObject({ ok: true, supabaseCount: 1, d1Count: 1 });
    expect(report.articleChecks.top).toMatchObject({ ok: true, supabaseCount: 1, d1Count: 1 });
    expect(report.articleChecks.scheduled).toMatchObject({ ok: true, supabaseCount: 1, d1Count: 1 });
    expect(report.articleChecks.deleted).toMatchObject({ ok: true, supabaseCount: 1, d1Count: 1 });
    expect(report.articleChecks.maintenance).toMatchObject({ ok: true, supabaseCount: 1, d1Count: 1 });
    expect(report.dataChecks.sitemap).toMatchObject({ ok: true, supabaseCount: 1, d1Count: 1 });
    expect(report.dataChecks.recentTitles).toMatchObject({ ok: true, supabaseCount: 1, d1Count: 1 });
    expect(sbGetFeedArticlesMock).toHaveBeenCalledWith({ limit: 5, includeBody: false });
    expect(d1GetArticleSitemapDataMock).toHaveBeenCalledWith(5);
    expect(sbGetRecentTitlesMock).toHaveBeenCalledWith(14);
  });
});
