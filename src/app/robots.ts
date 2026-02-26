import type { MetadataRoute } from "next";
import { serverGetSetting } from "@/lib/db-server";

export const dynamic = "force-dynamic";

interface SeoSettings {
  canonicalUrl?: string;
  robotsNoIndex?: boolean;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
  const baseUrl =
    seoSettings.canonicalUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://culturepeople.co.kr";

  if (seoSettings.robotsNoIndex) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] },
      { userAgent: "Googlebot", allow: "/" },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
