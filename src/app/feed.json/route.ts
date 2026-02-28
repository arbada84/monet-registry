import { NextResponse } from "next/server";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";

interface SeoSettings {
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
}

interface RssSettings {
  enabled?: boolean;
  jsonFeedEnabled?: boolean;
  feedTitle?: string;
  feedDescription?: string;
  itemCount?: number;
  fullContent?: boolean;
}

export async function GET() {
  const [articles, seoSettings, rssSettings] = await Promise.all([
    serverGetArticles(),
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
    serverGetSetting<RssSettings>("cp-rss-settings", {}),
  ]);

  if (rssSettings.enabled === false || rssSettings.jsonFeedEnabled === false) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const baseUrl =
    seoSettings.canonicalUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://culturepeople.co.kr";

  const siteTitle = rssSettings.feedTitle || seoSettings.ogTitle || "컬처피플";
  const siteDesc = rssSettings.feedDescription || seoSettings.ogDescription || "문화를 전하는 사람들";
  const itemCount = rssSettings.itemCount || 50;
  const fullContent = rssSettings.fullContent ?? false;

  const published = articles
    .filter((a) => a.status === "게시")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, itemCount);

  const items = published.map((a) => {
    const summary = a.summary || a.body.replace(/<[^>]*>/g, "").slice(0, 200);
    const imgMatch = a.thumbnail || a.body.match(/<img[^>]+src="([^"]+)"/)?.[1] || "";

    return {
      id: `${baseUrl}/article/${a.id}`,
      url: `${baseUrl}/article/${a.id}`,
      title: a.title,
      summary,
      ...(fullContent ? { content_html: a.body } : {}),
      date_published: new Date(a.date).toISOString(),
      ...(a.author ? { authors: [{ name: `${a.author} 기자` }] } : {}),
      ...(a.category ? { tags: [a.category] } : {}),
      ...(imgMatch ? { image: imgMatch } : {}),
    };
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: siteTitle,
    description: siteDesc,
    home_page_url: baseUrl,
    feed_url: `${baseUrl}/feed.json`,
    items,
  };

  return new NextResponse(JSON.stringify(feed, null, 2), {
    headers: {
      "Content-Type": "application/feed+json; charset=UTF-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
