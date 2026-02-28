import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";

interface SeoSettings {
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
}

interface RssSettings {
  enabled?: boolean;
  feedTitle?: string;
  feedDescription?: string;
  feedLanguage?: string;
  feedCopyright?: string;
  feedImageUrl?: string;
  itemCount?: number;
  fullContent?: boolean;
  categoryFeeds?: boolean;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");

  const [articles, seoSettings, rssSettings] = await Promise.all([
    serverGetArticles(),
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
    serverGetSetting<RssSettings>("cp-rss-settings", {}),
  ]);

  // RSS 비활성화 시 빈 피드 반환
  if (rssSettings.enabled === false) {
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel></channel></rss>`, {
      headers: { "Content-Type": "application/rss+xml; charset=UTF-8" },
    });
  }

  // 카테고리별 피드가 비활성화된 상태에서 카테고리 요청 시 404
  if (category && rssSettings.categoryFeeds === false) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const baseUrl =
    seoSettings.canonicalUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://culturepeople.co.kr";

  const decodedCategory = category ? decodeURIComponent(category) : null;

  const siteTitle = decodedCategory
    ? `${rssSettings.feedTitle || seoSettings.ogTitle || "컬처피플"} - ${decodedCategory}`
    : (rssSettings.feedTitle || seoSettings.ogTitle || "컬처피플");
  const siteDesc = rssSettings.feedDescription || seoSettings.ogDescription || "문화를 전하는 사람들";
  const lang = rssSettings.feedLanguage || "ko";
  const copyright = rssSettings.feedCopyright || "";
  const feedImageUrl = rssSettings.feedImageUrl || "";
  const itemCount = rssSettings.itemCount || 50;
  const fullContent = rssSettings.fullContent ?? false;

  let published = articles.filter((a) => a.status === "게시");

  // 카테고리 필터
  if (decodedCategory) {
    published = published.filter((a) => a.category === decodedCategory);
  }

  published = published
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, itemCount);

  const selfUrl = decodedCategory
    ? `${baseUrl}/api/rss?category=${encodeURIComponent(decodedCategory)}`
    : `${baseUrl}/api/rss`;

  const items = published
    .map((a) => {
      const summary = a.summary || a.body.replace(/<[^>]*>/g, "").slice(0, 200);
      const content = fullContent ? a.body : summary;
      const pubDate = new Date(a.date).toUTCString();
      const imgMatch = a.thumbnail || a.body.match(/<img[^>]+src="([^"]+)"/)?.[1] || "";

      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${baseUrl}/article/${a.id}</link>
      <guid isPermaLink="true">${baseUrl}/article/${a.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(content)}</description>
      ${a.category ? `<category>${escapeXml(a.category)}</category>` : ""}
      ${a.author ? `<author>${escapeXml(a.author)}</author>` : ""}
      ${imgMatch ? `<enclosure url="${escapeXml(imgMatch)}" type="image/jpeg" length="0" />` : ""}
    </item>`;
    })
    .join("\n");

  const feedImage = feedImageUrl
    ? `  <image>
    <url>${escapeXml(feedImageUrl)}</url>
    <title>${escapeXml(siteTitle)}</title>
    <link>${baseUrl}</link>
  </image>`
    : "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${baseUrl}${decodedCategory ? `/category/${encodeURIComponent(decodedCategory)}` : ""}</link>
    <description>${escapeXml(siteDesc)}</description>
    <language>${escapeXml(lang)}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${selfUrl}" rel="self" type="application/rss+xml" />
    ${copyright ? `<copyright>${escapeXml(copyright)}</copyright>` : ""}
    ${feedImage}
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
