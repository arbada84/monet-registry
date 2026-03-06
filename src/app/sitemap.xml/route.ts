import { NextResponse } from "next/server";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";

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
    { loc: baseUrl, changefreq: "daily", priority: 1 },
    { loc: `${baseUrl}/search`, changefreq: "weekly", priority: 0.5 },
  ];

  try {
    const [articles, categories] = await Promise.all([
      serverGetArticles(),
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

    for (const a of Array.isArray(articles) ? articles : []) {
      if (a.status === "게시") {
        urls.push({
          loc: `${baseUrl}/article/${a.no ?? a.id}`,
          lastmod: new Date(a.date).toISOString(),
          changefreq: "weekly",
          priority: 0.8,
        });
      }
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
