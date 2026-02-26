import { NextResponse } from "next/server";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";

interface SeoSettings {
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const [articles, seoSettings] = await Promise.all([
    serverGetArticles(),
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
  ]);

  const baseUrl =
    seoSettings.canonicalUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://culturepeople.co.kr";

  const siteTitle = seoSettings.ogTitle || "컬처피플";
  const siteDesc = seoSettings.ogDescription || "문화를 전하는 사람들";

  const published = articles
    .filter((a) => a.status === "게시")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50);

  const items = published
    .map((a) => {
      const summary = a.summary || a.body.replace(/<[^>]*>/g, "").slice(0, 200);
      const pubDate = new Date(a.date).toUTCString();
      const imgMatch = a.thumbnail || a.body.match(/<img[^>]+src="([^"]+)"/)?.[1] || "";

      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${baseUrl}/article/${a.id}</link>
      <guid isPermaLink="true">${baseUrl}/article/${a.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(summary)}</description>
      ${a.category ? `<category>${escapeXml(a.category)}</category>` : ""}
      ${a.author ? `<author>${escapeXml(a.author)}</author>` : ""}
      ${imgMatch ? `<enclosure url="${escapeXml(imgMatch)}" type="image/jpeg" length="0" />` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${baseUrl}</link>
    <description>${escapeXml(siteDesc)}</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/api/rss" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=UTF-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
