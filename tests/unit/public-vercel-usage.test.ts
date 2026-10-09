import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isPublicSiteSetting } from "@/lib/public-site-settings";
import { toPublicArticlePreview } from "@/lib/public-article-preview";
import type { Article } from "@/types/article";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/db-server", () => ({ serverGetSetting: mocks.read }));

describe("cacheable anonymous presentation settings", () => {
  beforeEach(() => { mocks.read.mockReset(); });

  it("returns the same anonymous data with a bounded cache lifetime", async () => {
    mocks.read.mockResolvedValue({ siteName: "CulturePeople" });
    const { GET } = await import("@/app/api/public/site-settings/route");
    const res = await GET(new NextRequest("https://example.test/api/public/site-settings?key=cp-site-settings&fallback=secret", {
      headers: { cookie: "cp-admin-auth=not-an-auth-token" },
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
    expect(res.headers.has("set-cookie")).toBe(false);
    expect(await res.json()).toEqual({ success: true, value: { siteName: "CulturePeople" } });
    expect(mocks.read).toHaveBeenCalledWith("cp-site-settings", null);
  });

  it.each(["cp-api-keys", "cp-mail-settings", "cp-admin-accounts", "cp-ads-global", "cp-newsletter-settings", ""])("never reads private or auth-dependent setting %s", async (key) => {
    const { GET } = await import("@/app/api/public/site-settings/route");
    const res = await GET(new NextRequest(`https://example.test/api/public/site-settings?key=${key}`));
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(isPublicSiteSetting(key)).toBe(false);
  });

  it("never caches a provider outage", async () => {
    mocks.read.mockRejectedValue(new Error("upstream failed"));
    const { GET } = await import("@/app/api/public/site-settings/route");
    const res = await GET(new NextRequest("https://example.test/api/public/site-settings?key=cp-menus"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("public browser settings deduplication", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("shares concurrent requests and serves independent copies until TTL expires", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, value: [{ name: "Culture" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { getPublicSetting, clearPublicSettingCache } = await import("@/lib/public-settings-client");
    const [first, second] = await Promise.all([
      getPublicSetting("cp-categories", [] as { name: string }[]),
      getPublicSetting("cp-categories", [] as { name: string }[]),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/public/site-settings?key=cp-categories", { credentials: "omit", cache: "default" });
    first[0].name = "Changed";
    expect(second[0].name).toBe("Culture");
    await getPublicSetting("cp-categories", []);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await getPublicSetting("cp-categories", []);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    clearPublicSettingCache("cp-categories");
    await getPublicSetting("cp-categories", []);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not cache failures and keeps caller defaults separate for missing values", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, value: null }) });
    vi.stubGlobal("fetch", fetchMock);
    const { getPublicSetting } = await import("@/lib/public-settings-client");
    await expect(getPublicSetting("cp-about", {})).rejects.toThrow("offline");
    expect(await getPublicSetting("cp-about", { name: "A" })).toEqual({ name: "A" });
    expect(await getPublicSetting("cp-about", { name: "B" })).toEqual({ name: "B" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(getPublicSetting("cp-api-keys", {})).rejects.toThrow("Not a public");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("public-only Vercel request policy", () => {
  it("projects list payloads without changing search matching or article availability", () => {
    for (const file of ["src/app/category/[slug]/page.tsx", "src/app/tag/[name]/page.tsx", "src/app/search/page.tsx"]) {
      expect(readFileSync(file, "utf8")).toContain(".map(toPublicArticlePreview)");
    }
    expect(readFileSync("src/app/search/page.tsx", "utf8")).toContain("serverSearchArticles(q.trim())");
    expect(isPublicSiteSetting("cp-popups")).toBe(true);
    expect(readFileSync("src/components/ui/PopupRenderer.tsx", "utf8")).not.toContain("/api/db/settings");
  });
  it("does not serialize full article bodies or editorial history into home cards", () => {
    const article: Article = {
      id: "id", no: 4363, title: "Title", category: "Culture", date: "2026-10-10", status: "게시", views: 1,
      body: `<p>${"Preview ".repeat(100)}</p>`, summary: "Summary", thumbnail: "https://example.test/image.jpg",
      authorEmail: "internal@example.test", sourceUrl: "https://source.test", reviewNote: "internal",
      auditTrail: [{ action: "수정", by: "Editor", at: "2026-10-10" }],
    };
    const preview = toPublicArticlePreview(article);
    expect(preview.no).toBe(4363);
    expect(preview.summary).toBe("Summary");
    expect(preview.thumbnail).toBe(article.thumbnail);
    expect(preview.body).toHaveLength(240);
    expect(preview).not.toHaveProperty("auditTrail");
    expect(preview).not.toHaveProperty("authorEmail");
    expect(preview).not.toHaveProperty("reviewNote");
    expect(article.body).toContain("<p>");
  });
  it("disables automatic prefetch in every public theme without changing admin links", () => {
    const wrapper = readFileSync("src/components/ui/PublicLink.tsx", "utf8");
    expect(wrapper).toContain("<Link {...props} prefetch={false}");
    for (const theme of ["culturepeople/CulturePeople", "insightkorea/InsightKorea"]) {
      for (const page of ["Landing", "Header", "Footer", "CategoryPage", "ArticlePage"]) {
        expect(readFileSync(`src/components/themes/${theme}${page}.tsx`, "utf8")).toContain('@/components/ui/PublicLink');
      }
    }
    const db = readFileSync("src/lib/db.ts", "utf8");
    expect(db).toContain('!window.location.pathname.startsWith("/cam")');
    expect(db).toContain('cache: "no-store"');
    const middleware = readFileSync("src/middleware.ts", "utf8");
    expect(middleware).toContain("buildContentSecurityPolicy(nonce");
    expect(middleware).toContain("default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  });
});
