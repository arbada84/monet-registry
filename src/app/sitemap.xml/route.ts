import { NextResponse } from "next/server";
import { serverGetArticleSitemapData, serverGetSetting } from "@/lib/db-server";
import { parseTags } from "@/lib/html-utils";

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

export async function GET() {
  // 개행 오염 완전 차단: 절대 하드코딩
  const baseUrl = "https://culturepeople.co.kr";

  const urls: { loc: string; lastmod?: string; changefreq?: string; priority?: number }[] = [
    { loc: baseUrl, changefreq: "daily", priority: 1, lastmod: new Date().toISOString().split("T")[0] },
    { loc: `${baseUrl}/search`, changefreq: "weekly", priority: 0.5 },
    { loc: `${baseUrl}/about`, changefreq: "monthly", priority: 0.3 },
    { loc: `${baseUrl}/terms`, changefreq: "monthly", priority: 0.2 },
    { loc: `${baseUrl}/privacy`, changefreq: "monthly", priority: 0.2 },
  ];

  try {
    const [sitemapData, categories] = await Promise.all([
      serverGetArticleSitemapData(),
      serverGetSetting<Category[]>("cp-categories", []),
    ]);

    for (const c of Array.isArray(categories) ? categories : []) {
      if (c.visible !== false && c.slug) {
        urls.push({
          loc: `${baseUrl}/category/${encodeURIComponent(c.name)}`,
          changefreq: "weekly",
          priority: 0.7,
        });
      }
    }

    // 태그 및 기자 수집
    const tagSet = new Set<string>();
    const authorSet = new Set<string>();

    for (const a of Array.isArray(sitemapData) ? sitemapData : []) {
      if (a.no) {
        urls.push({
          loc: `${baseUrl}/article/${a.no}`,
          lastmod: new Date(a.date).toISOString(),
          changefreq: "weekly",
          priority: 0.8,
        });
      }
      // 태그 수집
      if (a.tags) {
        parseTags(a.tags).forEach((tag) => tagSet.add(tag));
      }
      // 기자 수집
      if (a.author) authorSet.add(a.author);
    }

    // 태그 페이지
    for (const tag of tagSet) {
      urls.push({
        loc: `${baseUrl}/tag/${encodeURIComponent(tag)}`,
        changefreq: "weekly",
        priority: 0.5,
      });
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
  }

  const urlEntries = urls
    .map((u) =>
      `  <url>\n    <loc>${escapeXml(u.loc)}</loc>${
        u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""
      }${u.changefreq ? `\n    <changefreq>${u.changefreq}</changefreq>` : ""}${
        u.priority !== undefined ? `\n    <priority>${u.priority}</priority>` : ""
      }\n  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
