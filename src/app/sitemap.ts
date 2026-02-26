import type { MetadataRoute } from "next";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";

export const dynamic = "force-dynamic";

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
  const [articles, seoSettings, categories] = await Promise.all([
    serverGetArticles(),
    serverGetSetting<SeoSettings>("cp-seo-settings", {}),
    serverGetSetting<Category[]>("cp-categories", []),
  ]);

  const baseUrl =
    seoSettings.canonicalUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://culturepeople.co.kr";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories
    .filter((c) => c.visible !== false && c.slug)
    .map((c) => ({
      url: `${baseUrl}/category/${encodeURIComponent(c.name)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  const articleRoutes: MetadataRoute.Sitemap = articles
    .filter((a) => a.status === "게시")
    .map((a) => ({
      url: `${baseUrl}/article/${a.id}`,
      lastModified: new Date(a.date),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  return [...staticRoutes, ...categoryRoutes, ...articleRoutes];
}
