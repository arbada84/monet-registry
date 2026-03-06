import type { MetadataRoute } from "next";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";

export const dynamic = "force-dynamic"; // 매 요청마다 새로 생성 (URL 개행 디버그용)

interface SeoSettings {
  canonicalUrl?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  visible?: boolean;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // NEXT_PUBLIC_SITE_URL 환경변수에 개행 문자가 포함될 수 있으므로 직접 처리
  const envUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").split(/[\s\r\n]+/)[0]?.replace(/\/$/, "") ?? "";
  const baseUrl = /^https?:\/\/[a-z]/.test(envUrl) ? envUrl : "https://culturepeople.co.kr";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
  ];

  try {
    const [articles, seoSettings, categories] = await Promise.all([
      serverGetArticles(),
      serverGetSetting<SeoSettings>("cp-seo-settings", {}),
      serverGetSetting<Category[]>("cp-categories", []),
    ]);

    // canonicalUrl도 sanitize (DB에 개행이 포함된 경우 대비)
    const rawCanonical = (seoSettings.canonicalUrl ?? "").split(/[\s\r\n]+/)[0]?.replace(/\/$/, "") ?? "";
    const resolvedBaseUrl = /^https?:\/\/[a-z]/.test(rawCanonical) ? rawCanonical : baseUrl;

    const categoryRoutes: MetadataRoute.Sitemap = (Array.isArray(categories) ? categories : [])
      .filter((c) => c.visible !== false && c.slug)
      .map((c) => ({
        url: `${resolvedBaseUrl}/category/${encodeURIComponent(c.name)}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));

    const articleRoutes: MetadataRoute.Sitemap = (Array.isArray(articles) ? articles : [])
      .filter((a) => a.status === "게시")
      .map((a) => ({
        url: `${resolvedBaseUrl}/article/${a.no ?? a.id}`,
        lastModified: new Date(a.date),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));

    return [
      { url: resolvedBaseUrl, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1 },
      { url: `${resolvedBaseUrl}/search`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.5 },
      ...categoryRoutes,
      ...articleRoutes,
    ];
  } catch (e) {
    console.error("[sitemap] 생성 실패:", e);
    return staticRoutes;
  }
}
