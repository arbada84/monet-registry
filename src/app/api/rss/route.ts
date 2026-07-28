import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverGetFeedArticles, serverGetSetting } from "@/lib/db-server";
import { getCanonicalUrl } from "@/lib/get-base-url";
import { getApprovedEditorialNoticesForArticleNos } from "@/lib/editorial/repository";

export const dynamic = "force-dynamic";

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

function cdata(str: string): string {
  return str.replaceAll("]]>", "]]]]><![CDATA[>");
}

function noticeHtml(notices: Array<{ type: "correction" | "retraction"; summary: string; approvedAt: string }>) {
  if (!notices.length) return "";
  const items = notices.map((notice) => {
    const label = notice.type === "retraction" ? "철회" : "정정";
    const date = notice.approvedAt ? ` (${escapeXml(notice.approvedAt.slice(0, 10))})` : "";
    return `<p><strong>${label} 안내${date}</strong>: ${escapeXml(notice.summary)}</p>`;
  }).join("");
  return `<aside data-editorial-notice="true">${items}</aside>`;
}

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const author = request.nextUrl.searchParams.get("author");

  // 카테고리/기자 필터가 있으면 전체 게시 기사 조회, 없으면 최신 N건만
  const [seoSettings, rssSettings] = await Promise.all([
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
    serverGetSetting<RssSettings>("cp-rss-settings", {}),
  ]);

  // RSS 비활성화 시 빈 피드 반환
  if (rssSettings.enabled === false) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>컬처피플</title>\n    <link>https://culturepeople.co.kr</link>\n    <description>피드가 비활성화되었습니다.</description>\n  </channel>\n</rss>`,
      { headers: { "Content-Type": "application/rss+xml; charset=UTF-8" } },
    );
  }

  // 카테고리별 피드가 비활성화된 상태에서 카테고리 요청 시 404
  if (category && rssSettings.categoryFeeds === false) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const baseUrl = getCanonicalUrl(seoSettings.canonicalUrl);

  const decodedCategory = category ? decodeURIComponent(category) : null;
  const decodedAuthor = author ? decodeURIComponent(author) : null;

  const siteTitle = decodedAuthor
    ? `${rssSettings.feedTitle || seoSettings.ogTitle || "컬처피플"} - ${decodedAuthor} 기자`
    : decodedCategory
    ? `${rssSettings.feedTitle || seoSettings.ogTitle || "컬처피플"} - ${decodedCategory}`
    : (rssSettings.feedTitle || seoSettings.ogTitle || "컬처피플");
  const siteDesc = rssSettings.feedDescription || seoSettings.ogDescription || "문화를 전하는 사람들";
  const lang = rssSettings.feedLanguage || "ko";
  const copyright = rssSettings.feedCopyright || "";
  const feedImageUrl = rssSettings.feedImageUrl || "";
  const itemCount = rssSettings.itemCount || 50;
  const fullContent = rssSettings.fullContent ?? true;

  let published = [] as Awaited<ReturnType<typeof serverGetFeedArticles>>;
  try {
    published = await serverGetFeedArticles({
      category: decodedCategory || undefined,
      author: decodedAuthor || undefined,
      limit: itemCount,
      includeBody: true,
    });
  } catch (error) {
    console.error("[RSS] 기사 조회 실패, 빈 피드로 응답:", error instanceof Error ? error.message : error);
  }

  // 카테고리 필터
  if (decodedCategory) {
    published = published.filter((a) => a.category === decodedCategory);
  }

  // 기자 필터
  if (decodedAuthor) {
    published = published.filter((a) => a.author === decodedAuthor);
  }

  published = published
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, itemCount);

  let noticesByArticleNo = new Map<number, Array<{
    id: string;
    type: "correction" | "retraction";
    summary: string;
    approvedAt: string;
  }>>();
  try {
    noticesByArticleNo = await getApprovedEditorialNoticesForArticleNos(
      published.map((article) => Number(article.no || 0)).filter(Boolean),
    );
  } catch (error) {
    console.error("[RSS] 편집 정정 고지 조회 실패:", error instanceof Error ? error.message : error);
  }

  const feedPath = request.nextUrl.pathname === "/rss.xml" ? "/rss.xml" : "/api/rss";
  const selfUrl = decodedAuthor
    ? `${baseUrl}${feedPath}?author=${encodeURIComponent(decodedAuthor)}`
    : decodedCategory
    ? `${baseUrl}${feedPath}?category=${encodeURIComponent(decodedCategory)}`
    : `${baseUrl}${feedPath}`;

  const items = published
    .map((a) => {
      const summary = a.summary || a.body.replace(/<[^>]*>/g, "").slice(0, 200);
      const notices = a.no ? noticesByArticleNo.get(a.no) || [] : [];
      const publicNotice = noticeHtml(notices);
      const content = fullContent ? `${publicNotice}${a.body}` : `${publicNotice}${summary}`;
      const pubDate = new Date(a.date).toUTCString();
      const imgMatch = a.thumbnail || a.body.match(/<img[^>]+src="([^"]+)"/)?.[1] || "";

      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${baseUrl}/article/${a.no ?? a.id}</link>
      <guid isPermaLink="true">${baseUrl}/article/${a.no ?? a.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(content)}</description>
      ${fullContent ? `<content:encoded><![CDATA[${cdata(content)}]]></content:encoded>` : ""}
      ${a.category ? `<category>${escapeXml(a.category)}</category>` : ""}
      ${a.author ? `<author>noreply@culturepeople.co.kr (${escapeXml(a.author)})</author>` : ""}
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
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${baseUrl}${decodedAuthor ? `/reporter/${encodeURIComponent(decodedAuthor)}` : decodedCategory ? `/category/${encodeURIComponent(decodedCategory)}` : ""}</link>
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
