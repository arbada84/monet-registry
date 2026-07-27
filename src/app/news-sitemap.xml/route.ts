import { NextResponse } from "next/server";
import { serverGetFeedArticles, serverGetSetting } from "@/lib/db-server";
import { getCanonicalUrl } from "@/lib/get-base-url";

export const dynamic = "force-dynamic";

interface SeoSettings {
  canonicalUrl?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export async function GET() {
  const seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
  const baseUrl = getCanonicalUrl(seoSettings.canonicalUrl);
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const articles = await serverGetFeedArticles({ limit: 1000, includeBody: false });

  const entries = articles
    .filter((article) => {
      const publishedAt = new Date(article.date).getTime();
      return Number.isFinite(publishedAt) && publishedAt >= cutoff;
    })
    .slice(0, 1000)
    .map((article) => {
      const loc = `${baseUrl}/article/${article.no ?? article.id}`;
      const publishedAt = toIsoDate(article.date) || new Date().toISOString();
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>컬처피플</news:name>
        <news:language>ko</news:language>
      </news:publication>
      <news:publication_date>${publishedAt}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
    },
  });
}
