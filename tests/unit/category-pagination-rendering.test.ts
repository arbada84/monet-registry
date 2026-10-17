import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Article } from "@/types/article";

vi.setConfig({ testTimeout: 30_000 });

const mocks = vi.hoisted(() => ({
  page: vi.fn(), setting: vi.fn(), top: vi.fn(), theme: vi.fn(),
}));
vi.mock("@/lib/db-server", () => ({
  serverGetCategoryArticlePage: mocks.page,
  serverGetSetting: mocks.setting,
  serverGetTopArticles: mocks.top,
}));
vi.mock("@/lib/site-type", () => ({ getSiteType: mocks.theme }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_HTTP_ERROR_FALLBACK;404"); },
  permanentRedirect: (url: string) => { throw new Error(`NEXT_REDIRECT;308;${url}`); },
}));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: { prefetch?: boolean }) => {
  expect(prefetch).toBe(false);
  return React.createElement("a", props);
} }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/ui/PopupRenderer", () => ({ default: () => null }));
vi.mock("@/components/ui/CoupangAutoAd", () => ({ default: () => null }));
vi.mock("@/components/ui/AdBanner", () => ({ default: () => null }));
vi.mock("@/components/registry/culturepeople-header-0", () => ({ default: () => null }));
vi.mock("@/components/registry/culturepeople-footer-6", () => ({ default: () => null }));
vi.mock("@/components/themes/culturepeople/CulturePeopleHeader", () => ({ default: () => null }));
vi.mock("@/components/themes/culturepeople/CulturePeopleFooter", () => ({ default: () => null }));
vi.mock("@/components/themes/insightkorea/InsightKoreaHeader", () => ({ default: () => null }));
vi.mock("@/components/themes/insightkorea/InsightKoreaFooter", () => ({ default: () => null }));
vi.mock("@/components/themes/culturepeople", async () => ({
  CulturePeopleCategoryPage: (await import("@/components/themes/culturepeople/CulturePeopleCategoryPage")).default,
}));
vi.mock("@/components/themes/insightkorea", async () => ({
  InsightKoreaCategoryPage: (await import("@/components/themes/insightkorea/InsightKoreaCategoryPage")).default,
}));

const articles = Array.from({ length: 20 }, (_, i) => ({
  id: `article-${i}`, no: i + 1, title: `Headline ${i}`, category: "news", date: "2026-10-18",
  status: "게시", body: "", summary: "List summary", views: 0,
})) as Article[];
const props = (page?: string, items?: string) => ({
  params: Promise.resolve({ slug: "news" }), searchParams: Promise.resolve({ page, items }),
});

beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.page.mockReset().mockResolvedValue({ articles, page: 2, hasNext: true });
  mocks.setting.mockImplementation((_key, fallback) => Promise.resolve(fallback));
  mocks.theme.mockResolvedValue("culturepeople");
  mocks.top.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe("category server rendering contracts", () => {
  it("has no local streaming fallback or client-only pagination", () => {
    expect(existsSync("src/app/category/[slug]/loading.tsx")).toBe(false);
    for (const path of [
      "src/app/category/[slug]/components/CategoryArticleList.tsx",
      "src/components/themes/culturepeople/CulturePeopleCategoryPage.tsx",
      "src/components/themes/insightkorea/InsightKoreaCategoryPage.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/useSearchParams|visibleCount|replaceState|handleLoadMore/);
    }
  });
  it.each(["culturepeople", "insightkorea", "default"])("%s renders all 20 supplied articles and real previous/next hrefs", async (theme) => {
    mocks.theme.mockResolvedValue(theme);
    const { default: CategoryPage } = await import("@/app/category/[slug]/page");
    const html = renderToStaticMarkup(await CategoryPage(props("2")));
    expect(html).toContain('href="/category/news"');
    expect(html).toContain('href="/category/news?page=3"');
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).toContain("Headline 19");
    expect(html.match(/href="\/article\//g)).toHaveLength(20);
    expect(html).toContain("List summary");
    expect(html).not.toContain("더보기");
    expect(html).not.toContain("건 남음");
    expect(html).not.toContain("numberOfItems");
    expect(html).toContain('"position":21');
    expect(mocks.page).toHaveBeenCalledWith("news", 2);
    if (theme !== "default") expect(mocks.top).toHaveBeenCalledWith(10);
    else expect(mocks.top).not.toHaveBeenCalled();
  });
  it("metadata is self-canonical for first and subsequent pages", async () => {
    const { generateMetadata } = await import("@/app/category/[slug]/page");
    const first = await generateMetadata(props());
    const second = await generateMetadata(props("2"));
    expect(first.alternates?.canonical).toMatch(/\/category\/news$/);
    expect(second.alternates?.canonical).toMatch(/\/category\/news\?page=2$/);
    expect(second.openGraph?.url).toBe(second.alternates?.canonical);
  });
  it("invalid pages fail with notFound before article IO, in both entry points", async () => {
    const { default: CategoryPage, generateMetadata } = await import("@/app/category/[slug]/page");
    for (const page of ["0", "10001", "2x"]) {
      await expect(CategoryPage(props(page))).rejects.toThrow("404");
      await expect(generateMetadata(props(page))).rejects.toThrow("404");
    }
    expect(mocks.page).not.toHaveBeenCalled();
  });
  it("empty later pages are 404 and database failures are not healthy empty pages", async () => {
    const { default: CategoryPage, generateMetadata } = await import("@/app/category/[slug]/page");
    mocks.page.mockResolvedValue({ articles: [], page: 2, hasNext: false });
    await expect(CategoryPage(props("2"))).rejects.toThrow("404");
    await expect(generateMetadata(props("2"))).rejects.toThrow("404");
    mocks.page.mockRejectedValue(new Error("DB unavailable"));
    await expect(CategoryPage(props())).rejects.toThrow("DB unavailable");
    await expect(generateMetadata(props())).rejects.toThrow("DB unavailable");
  });
  it("legacy items redirects to canonical page one without article IO", async () => {
    const { default: CategoryPage } = await import("@/app/category/[slug]/page");
    await expect(CategoryPage(props(undefined, "200"))).rejects.toThrow("308;/category/news");
    expect(mocks.page).not.toHaveBeenCalled();
  });
  it.each([1, 10000])("does not render navigation beyond boundary page %s", async (page) => {
    const { default: Pagination } = await import("@/components/ui/CategoryPagination");
    const html = renderToStaticMarkup(React.createElement(Pagination, { categoryName: "news", page, hasNext: page === 10000 }));
    expect(html).not.toContain('rel="next"');
    if (page === 1) expect(html).not.toContain('rel="prev"');
    else expect(html).toContain('href="/category/news?page=9999"');
  });
  it("first-page next link is crawlable without a previous link", async () => {
    const { default: Pagination } = await import("@/components/ui/CategoryPagination");
    const html = renderToStaticMarkup(React.createElement(Pagination, { categoryName: "news", page: 1, hasNext: true }));
    expect(html).toContain('href="/category/news?page=2"');
    expect(html).not.toContain('rel="prev"');
  });
});
