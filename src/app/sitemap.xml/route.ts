import { NextResponse } from "next/server";
import { serverGetArticleSitemapData, serverGetFeedArticles, serverGetSetting } from "@/lib/db-server";

// 완전한 동적 라우트 (메타데이터 라우트 캐싱 문제 우회)
export const dynamic = "force-dynamic";

interface Category {
  id: string;
  name: string;
  slug: string;
  visible?: boolean;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toIsoDate(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function toAbsoluteImageUrl(baseUrl: string, value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function GET() {
  // 개행 오염 완전 차단: 절대 하드코딩
  const baseUrl = "https://culturepeople.co.kr";

  const urls: { loc: string; lastmod?: string; changefreq?: string; priority?: number; image?: string }[] = [
    { loc: baseUrl, changefreq: "daily", priority: 1, lastmod: new Date().toISOString().split("T")[0] },
    { loc: `${baseUrl}/about`, changefreq: "monthly", priority: 0.3 },
    { loc: `${baseUrl}/terms`, changefreq: "monthly", priority: 0.2 },
    { loc: `${baseUrl}/privacy`, changefreq: "monthly", priority: 0.2 },
    { loc: `${baseUrl}/contact`, changefreq: "monthly", priority: 0.2 },
    { loc: `${baseUrl}/advertising`, changefreq: "monthly", priority: 0.2 },
    { loc: `${baseUrl}/youth-policy`, changefreq: "monthly", priority: 0.2 },
    { loc: `${baseUrl}/alidot`, changefreq: "monthly", priority: 0.4 },
    { loc: `${baseUrl}/alidot/terms`, changefreq: "monthly", priority: 0.2 },
    { loc: `${baseUrl}/alidot/privacy`, changefreq: "monthly", priority: 0.2 },
  ];

  try {
    const [cachedSitemap, latestArticles] = await Promise.all([
      serverGetArticleSitemapData(),
      serverGetFeedArticles({ limit: 1, includeBody: false }),
    ]);
    let sitemapData = cachedSitemap;
    const minArticleCount = Math.max(1, Number(process.env.SITEMAP_MIN_ARTICLE_COUNT || 100));
    if (!Array.isArray(sitemapData) || sitemapData.length < minArticleCount) {
      throw new Error(`article invariant failed: expected at least ${minArticleCount}, received ${Array.isArray(sitemapData) ? sitemapData.length : 0}`);
    }
    const latestNo = Number(latestArticles?.[0]?.no);
    if (Number.isFinite(latestNo) && !sitemapData.some((article) => Number(article.no) === latestNo)) {
      sitemapData = await serverGetArticleSitemapData({ fresh: true });
    }
    const articleNos = new Set(sitemapData.map((article) => Number(article.no)).filter(Number.isFinite));
    if (!Number.isFinite(latestNo) || !articleNos.has(latestNo)) {
      throw new Error(`latest article invariant failed: latest=${Number.isFinite(latestNo) ? latestNo : "missing"}`);
    }
    const categories = await serverGetSetting<Category[]>("cp-categories", []).catch((error) => {
      console.error("[sitemap.xml] category settings unavailable:", error);
      return [];
    });

    for (const c of Array.isArray(categories) ? categories : []) {
      if (c.visible !== false && c.slug) {
        urls.push({
          loc: `${baseUrl}/category/${encodeURIComponent(c.name)}`,
          changefreq: "weekly",
          priority: 0.7,
        });
      }
    }

    // 기자 페이지는 기사 데이터에서 수집한다. 태그 아카이브는 얇은 페이지가
    // 많아 검색엔진이 Soft 404로 판단할 수 있으므로 사이트맵에 제출하지 않는다.
    const authorSet = new Set<string>();

    for (const a of Array.isArray(sitemapData) ? sitemapData : []) {
      if (a.no) {
        const image = toAbsoluteImageUrl(baseUrl, a.thumbnail || a.ogImage);
        urls.push({
          loc: `${baseUrl}/article/${a.no}`,
          lastmod: toIsoDate(a.updatedAt) || toIsoDate(a.date),
          changefreq: "weekly",
          priority: 0.8,
          image,
        });
      }
      // 기자 수집
      if (a.author) authorSet.add(a.author);
    }

    // 기자 페이지
    for (const author of authorSet) {
      urls.push({
        loc: `${baseUrl}/reporter/${encodeURIComponent(author)}`,
        changefreq: "weekly",
        priority: 0.5,
      });
    }
  } catch (e) {
    console.error("[sitemap.xml] 생성 실패:", e);
    return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error>sitemap temporarily unavailable</error>\n", {
      status: 503,
      headers: {
        "Content-Type": "application/xml; charset=UTF-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
      },
    });
  }

  const urlEntries = urls
    .map((u) =>
      `  <url>\n    <loc>${escapeXml(u.loc)}</loc>${
        u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""
      }${u.changefreq ? `\n    <changefreq>${u.changefreq}</changefreq>` : ""}${
        u.priority !== undefined ? `\n    <priority>${u.priority}</priority>` : ""
      }${u.image ? `\n    <image:image>\n      <image:loc>${escapeXml(u.image)}</image:loc>\n    </image:image>` : ""}\n  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlEntries}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
