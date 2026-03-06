import type { MetadataRoute } from "next";
import { serverGetArticles, serverGetSetting } from "@/lib/db-server";

export const dynamic = "force-dynamic";

interface Category {
  id: string;
  name: string;
  slug: string;
  visible?: boolean;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 개행 오염 완전 차단: 하드코딩 사용 (DB/환경변수 canonicalUrl 무시)
  const baseUrl = "https://culturepeople.co.kr";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
  ];

  try {
    const [articles, categories] = await Promise.all([
      serverGetArticles(),
      serverGetSetting<Category[]>("cp-categories", []),
    ]);

    const categoryRoutes: MetadataRoute.Sitemap = (Array.isArray(categories) ? categories : [])
      .filter((c) => c.visible !== false && c.slug)
      .map((c) => ({
        url: `${baseUrl}/category/${encodeURIComponent(c.name)}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));

    const articleRoutes: MetadataRoute.Sitemap = (Array.isArray(articles) ? articles : [])
      .filter((a) => a.status === "게시")
      .map((a) => ({
        url: `${baseUrl}/article/${a.no ?? a.id}`,
        lastModified: new Date(a.date),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));

    return [
      { url: baseUrl, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1 },
      { url: `${baseUrl}/search`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.5 },
      ...categoryRoutes,
      ...articleRoutes,
    ];
  } catch (e) {
    console.error("[sitemap] 생성 실패:", e);
    return staticRoutes;
  }
}
