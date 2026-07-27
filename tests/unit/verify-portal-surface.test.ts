import { afterEach, describe, expect, it, vi } from "vitest";

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}

describe("portal surface verifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks direct RSS routes, legacy redirects, sitemap, ads.txt, and IndexNow key", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/ads.txt") return response("google.com, pub-1, DIRECT, f08c47fec0942fa0", { status: 200 });
      if (pathname === "/rss.xml" && init?.method === "GET") return response("<rss><channel><item><description>body</description></item></channel></rss>", { status: 200 });
      if (pathname === "/sitemap.xml" && init?.method === "GET") {
        return response("<urlset><url><loc>https://culturepeople.co.kr/article/77</loc></url></urlset>", { status: 200 });
      }
      if (pathname === "/rss.xml" || pathname === "/feed.xml" || pathname === "/sitemap.xml" || pathname === "/news-sitemap.xml") return response("", { status: 200 });
      if (pathname === "/rss" || pathname === "/feed") return response("", { status: 308 });
      if (pathname === "/abc123.txt") return response("abc123", { status: 200 });
      return response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    // @ts-ignore - the verifier is a Node .mjs script imported directly for coverage.
    const { buildPortalSurfaceReport } = await import("../../scripts/verify-portal-surface.mjs");

    const report = await buildPortalSurfaceReport({
      baseUrl: "https://culturepeople.co.kr",
      indexNowKey: "abc123",
      timeoutMs: 1000,
    });

    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.name)).toContain("/rss.xml");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("fails when sitemap contains noindex-style utility paths", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/ads.txt") return response("google.com, pub-1, DIRECT, f08c47fec0942fa0", { status: 200 });
      if (pathname === "/rss.xml" && init?.method === "GET") return response("<rss><channel><item><description>body</description></item></channel></rss>", { status: 200 });
      if (pathname === "/sitemap.xml" && init?.method === "GET") {
        return response("<urlset><url><loc>https://culturepeople.co.kr/search</loc></url></urlset>", { status: 200 });
      }
      if (pathname === "/rss.xml" || pathname === "/feed.xml" || pathname === "/sitemap.xml" || pathname === "/news-sitemap.xml") return response("", { status: 200 });
      if (pathname === "/rss" || pathname === "/feed") return response("", { status: 308 });
      return response("not found", { status: 404 });
    }));
    // @ts-ignore - the verifier is a Node .mjs script imported directly for coverage.
    const { buildPortalSurfaceReport } = await import("../../scripts/verify-portal-surface.mjs");

    const report = await buildPortalSurfaceReport({ baseUrl: "https://culturepeople.co.kr", timeoutMs: 1000 });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "/sitemap.xml" && check.method === "GET")).toMatchObject({
      ok: false,
      forbiddenHits: ["<loc>https://culturepeople.co.kr/search</loc>"],
    });
  });
});
