import type { MetadataRoute } from "next";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";
import { getCanonicalUrl } from "@/lib/get-base-url";

export const revalidate = 3600; // 1시간마다 재생성

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
  const baseUrl = getCanonicalUrl();

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
    const resolvedBaseUrl = getCanonicalUrl(seoSettings.canonicalUrl);

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
