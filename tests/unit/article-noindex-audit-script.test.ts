import { afterEach, describe, expect, it, vi } from "vitest";

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}

const indexableArticleHtml = `
<!doctype html>
<html>
  <head>
    <title>게시 기사</title>
    <link rel="canonical" href="https://culturepeople.co.kr/article/77" />
  </head>
  <body>
    <h1>게시 기사</h1>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"게시 기사"}</script>
  </body>
</html>`;

describe("article noindex audit script", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts robots/canonical/NewsArticle signals from HTML", async () => {
    // @ts-ignore - the audit script is a Node .mjs script imported directly for coverage.
    const { extractSeoSignals } = await import("../../scripts/audit-article-noindex.mjs");

    const signals = extractSeoSignals(`
      <html>
        <head>
          <meta name="robots" content="noindex, follow">
          <link rel="canonical" href="https://culturepeople.co.kr/article/1">
        </head>
        <body><script>{"@type":"NewsArticle"}</script></body>
      </html>
    `);

    expect(signals.metaRobotsNoindex).toBe(true);
    expect(signals.canonical).toBe("https://culturepeople.co.kr/article/1");
    expect(signals.hasNewsArticleJsonLd).toBe(true);
  });

  it("keeps article URLs allowed when robots.txt blocks internal paths only", async () => {
    // @ts-ignore - the audit script is a Node .mjs script imported directly for coverage.
    const { isRobotsBlocked } = await import("../../scripts/audit-article-noindex.mjs");
    const robotsTxt = [
      "User-agent: Googlebot",
      "Allow: /",
      "Disallow: /cam/",
      "Disallow: /api/",
      "",
      "User-agent: *",
      "Allow: /",
      "Disallow: /smoke/",
    ].join("\n");

    expect(isRobotsBlocked(robotsTxt, "https://culturepeople.co.kr/article/77", "Googlebot")).toBe(false);
    expect(isRobotsBlocked(robotsTxt, "https://culturepeople.co.kr/cam/articles", "Googlebot")).toBe(true);
  });

  it("classifies live noindex separately from Search Console stale candidates", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/sitemap.xml") {
        return response(
          "<urlset><url><loc>https://culturepeople.co.kr/article/77</loc></url><url><loc>https://culturepeople.co.kr/article/88</loc></url></urlset>",
          { status: 200, headers: { "content-type": "application/xml" } }
        );
      }
      if (pathname === "/news-sitemap.xml") {
        return response("<urlset></urlset>", { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (pathname === "/robots.txt") {
        return response("User-agent: Googlebot\nAllow: /\nDisallow: /cam/\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      if (pathname === "/article/77") {
        return response(indexableArticleHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (pathname === "/article/88") {
        return response(
          indexableArticleHtml.replace("</head>", '<meta name="googlebot" content="noindex"></head>'),
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }
      return response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);
    // @ts-ignore - the audit script is a Node .mjs script imported directly for coverage.
    const { buildArticleNoindexAuditReport } = await import("../../scripts/audit-article-noindex.mjs");

    const report = await buildArticleNoindexAuditReport({
      baseUrl: "https://culturepeople.co.kr",
      urls: ["https://culturepeople.co.kr/article/77", "https://culturepeople.co.kr/article/88"],
      timeoutMs: 1000,
      writeReports: false,
    });

    expect(report.ok).toBe(false);
    expect(report.rows.find((row: any) => row.url.endsWith("/article/77"))).toMatchObject({
      classification: "stale_search_console",
      sitemapPresent: true,
      metaNoindex: false,
      headerNoindex: false,
    });
    expect(report.rows.find((row: any) => row.url.endsWith("/article/88"))).toMatchObject({
      classification: "live_noindex_meta",
      metaNoindex: true,
    });
  });

  it("flags article URLs that were published in local backups but are missing live", async () => {
    // @ts-ignore - the audit script is a Node .mjs script imported directly for coverage.
    const { classifyUrlAudit } = await import("../../scripts/audit-article-noindex.mjs");

    expect(classifyUrlAudit({
      source: "search_console",
      url: "https://culturepeople.co.kr/article/23",
      primary: { status: 200, notFoundSignal: true },
      uaChecks: [],
      sitemapKnown: true,
      sitemapPresent: false,
      robotsKnown: true,
      robotsBlocked: false,
      canonicalUrl: "",
      expectedCanonicalUrl: "https://culturepeople.co.kr/article/23",
      backupHistory: { wasPublished: true, firstPublishedTitle: "앙상블블랭크 10, 10년의 궤적을 음악으로 선보인다" },
    })).toBe("historical_published_missing");
  });

  it("classifies streamed Next.js notFound fallbacks as not_found_or_unpublished", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/sitemap.xml") return response("<urlset></urlset>", { status: 200 });
      if (pathname === "/news-sitemap.xml") return response("<urlset></urlset>", { status: 200 });
      if (pathname === "/robots.txt") return response("User-agent: Googlebot\nAllow: /\n", { status: 200 });
      return response(
        '<html><head><title>기사를 찾을 수 없습니다 | 컬처피플</title><meta name="robots" content="noindex"></head><body>NEXT_HTTP_ERROR_FALLBACK;404</body></html>',
        { status: 200, headers: { "content-type": "text/html" } }
      );
    }));
    // @ts-ignore - the audit script is a Node .mjs script imported directly for coverage.
    const { buildArticleNoindexAuditReport } = await import("../../scripts/audit-article-noindex.mjs");

    const report = await buildArticleNoindexAuditReport({
      baseUrl: "https://culturepeople.co.kr",
      urls: ["https://culturepeople.co.kr/article/23"],
      timeoutMs: 1000,
      writeReports: false,
    });

    expect(report.rows[0]).toMatchObject({
      classification: "not_found_or_unpublished",
      notFoundSignal: true,
      metaNoindex: true,
    });
  });
});
