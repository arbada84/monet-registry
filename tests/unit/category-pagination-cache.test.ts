import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  cache: vi.fn((fn: (...args: unknown[]) => unknown, _keys: string[], _options: unknown) => fn),
  d1: vi.fn(), supabase: vi.fn(), useD1: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_cache: mocks.cache, revalidateTag: vi.fn() }));
vi.mock("@/lib/d1-server-db", () => ({ d1GetCategoryArticlePage: mocks.d1 }));
vi.mock("@/lib/supabase-server-db", () => ({ sbGetCategoryArticlePage: mocks.supabase }));
vi.mock("@/lib/database-provider", () => ({ shouldUseD1ReadAdapter: mocks.useD1 }));

afterEach(() => { mocks.d1.mockReset(); mocks.supabase.mockReset(); });

describe("category page cache", () => {
  it("passes category and page as cache arguments, tags articles, and honors the adapter gate", async () => {
    const { serverGetCategoryArticlePage } = await import("@/lib/db-server");
    const cacheCall = mocks.cache.mock.calls.find((call) => call[1][0] === "public-category-article-page");
    expect(cacheCall?.[2]).toEqual({ revalidate: 300, tags: ["articles"] });
    const result = { articles: [], page: 2, hasNext: false };
    mocks.useD1.mockReturnValue(true);
    mocks.d1.mockResolvedValue(result);
    await expect(serverGetCategoryArticlePage("news", 2)).resolves.toBe(result);
    expect(mocks.d1).toHaveBeenCalledWith("news", 2);
    mocks.useD1.mockReturnValue(false);
    mocks.supabase.mockResolvedValue(result);
    await serverGetCategoryArticlePage("culture", 3);
    expect(mocks.supabase).toHaveBeenCalledWith("culture", 3);
  });
  it("does not convert adapter failures into cached empty success", async () => {
    const { serverGetCategoryArticlePage } = await import("@/lib/db-server");
    mocks.useD1.mockReturnValue(true);
    mocks.d1.mockRejectedValue(new Error("DB failed"));
    await expect(serverGetCategoryArticlePage("news", 2)).rejects.toThrow("DB failed");
  });
});
