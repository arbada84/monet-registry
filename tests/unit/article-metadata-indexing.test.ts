import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`permanentRedirect:${url}`);
  }),
}));
vi.mock("next/image", () => ({ default: vi.fn(() => null) }));
vi.mock("next/link", () => ({ default: vi.fn(({ children }) => children) }));

vi.mock("@/components/themes/culturepeople", () => ({ CulturePeopleArticlePage: vi.fn(() => null) }));
vi.mock("@/components/themes/insightkorea", () => ({ InsightKoreaArticlePage: vi.fn(() => null) }));
vi.mock("@/components/registry/culturepeople-header-0", () => ({ default: vi.fn(() => null) }));
vi.mock("@/components/registry/culturepeople-footer-6", () => ({ default: vi.fn(() => null) }));
vi.mock("@/components/ui/AdBanner", () => ({ default: vi.fn(() => null) }));
vi.mock("@/components/ui/PopupRenderer", () => ({ default: vi.fn(() => null) }));
vi.mock("@/components/ui/CoupangAutoAd", () => ({ default: vi.fn(() => null) }));
vi.mock("@/lib/site-type", () => ({ getSiteType: vi.fn(async () => "culturepeople") }));
vi.mock("@/lib/get-base-url", () => ({
  getCanonicalUrl: (value?: string) => (value || "https://culturepeople.co.kr").replace(/\/+$/, ""),
}));

const mocks = vi.hoisted(() => ({
  serverGetArticleById: vi.fn(),
  serverGetArticleByNo: vi.fn(),
  serverGetSetting: vi.fn(),
  serverGetTopArticles: vi.fn(),
}));

vi.mock("@/lib/db-server", () => ({
  serverGetArticleById: mocks.serverGetArticleById,
  serverGetArticleByNo: mocks.serverGetArticleByNo,
  serverGetSetting: mocks.serverGetSetting,
  serverGetTopArticles: mocks.serverGetTopArticles,
}));

function article(overrides: Record<string, unknown> = {}) {
  return {
    id: "article-id",
    no: 77,
    status: "게시",
    title: "게시 기사",
    summary: "기사 요약",
    body: "<p>기사 본문입니다.</p>",
    category: "문화",
    author: "박영래",
    date: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T01:00:00.000Z",
    thumbnail: "",
    ogImage: "",
    ...overrides,
  };
}

describe("article metadata indexing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not emit robots noindex for a published article URL", async () => {
    mocks.serverGetArticleByNo.mockResolvedValueOnce(article({ no: 77 }));
    mocks.serverGetSetting.mockResolvedValueOnce({ canonicalUrl: "https://culturepeople.co.kr" });
    const { generateMetadata } = await import("@/app/article/[id]/page");

    const metadata = await generateMetadata({ params: Promise.resolve({ id: "77" }) });

    expect(mocks.serverGetArticleByNo).toHaveBeenCalledWith(77);
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("https://culturepeople.co.kr/article/77");
  });

  it("throws notFound for unpublished or missing articles before article metadata is emitted", async () => {
    mocks.serverGetArticleByNo.mockResolvedValueOnce(article({ no: 78, status: "임시저장" }));
    mocks.serverGetSetting.mockResolvedValueOnce({ canonicalUrl: "https://culturepeople.co.kr" });
    const { generateMetadata } = await import("@/app/article/[id]/page");

    await expect(generateMetadata({ params: Promise.resolve({ id: "78" }) })).rejects.toThrow("notFound");
  });

  it("permanently redirects known historical duplicate article numbers to the kept article", async () => {
    const { generateMetadata } = await import("@/app/article/[id]/page");

    await expect(generateMetadata({ params: Promise.resolve({ id: "23" }) })).rejects.toThrow("permanentRedirect:/article/275");
    expect(mocks.serverGetArticleByNo).not.toHaveBeenCalled();
    expect(mocks.serverGetSetting).not.toHaveBeenCalled();
  });

  it("does not define a root or article loading boundary that can stream missing articles as HTTP 200", () => {
    const rootLoadingBoundary = path.resolve(process.cwd(), "src/app/loading.tsx");
    const articleLoadingBoundary = path.resolve(process.cwd(), "src/app/article/[id]/loading.tsx");

    expect(existsSync(rootLoadingBoundary)).toBe(false);
    expect(existsSync(articleLoadingBoundary)).toBe(false);
  });
});
