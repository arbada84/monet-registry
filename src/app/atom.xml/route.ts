import { NextResponse } from "next/server";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";

interface SeoSettings {
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
}

interface RssSettings {
  enabled?: boolean;
  atomEnabled?: boolean;
  feedTitle?: string;
  feedDescription?: string;
  feedLanguage?: string;
  itemCount?: number;
  fullContent?: boolean;
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
  const [articles, seoSettings, rssSettings] = await Promise.all([
    serverGetArticles(),
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
    serverGetSetting<RssSettings>("cp-rss-settings", {}),
  ]);

  if (rssSettings.enabled === false || rssSettings.atomEnabled === false) {
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

  const updatedAt = published.length > 0
    ? new Date(published[0].date).toISOString()
    : new Date().toISOString();

  const entries = published
    .map((a) => {
      const summary = a.summary || a.body.replace(/<[^>]*>/g, "").slice(0, 200);
      const content = fullContent ? a.body : summary;
      const updated = new Date(a.date).toISOString();
      const imgMatch = a.thumbnail || a.body.match(/<img[^>]+src="([^"]+)"/)?.[1] || "";

      return `  <entry>
    <title>${escapeXml(a.title)}</title>
    <link href="${baseUrl}/article/${a.id}" />
    <id>${baseUrl}/article/${a.id}</id>
    <updated>${updated}</updated>
    <summary type="text">${escapeXml(summary)}</summary>
    ${fullContent ? `<content type="html">${escapeXml(content)}</content>` : ""}
    ${a.author ? `<author><name>${escapeXml(a.author)}</name></author>` : ""}
    ${a.category ? `<category term="${escapeXml(a.category)}" />` : ""}
    ${imgMatch ? `<link rel="enclosure" href="${escapeXml(imgMatch)}" type="image/jpeg" />` : ""}
  </entry>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(siteTitle)}</title>
  <subtitle>${escapeXml(siteDesc)}</subtitle>
  <link href="${baseUrl}" />
  <link rel="self" href="${baseUrl}/atom.xml" type="application/atom+xml" />
  <id>${baseUrl}/</id>
  <updated>${updatedAt}</updated>
${entries}
</feed>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=UTF-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
