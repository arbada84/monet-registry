import type { MetadataRoute } from "next";
import { serverGetSetting } from "@/lib/db-server";
import { getCanonicalUrl } from "@/lib/get-base-url";

export const revalidate = 3600; // 1시간마다 재생성

interface SeoSettings {
  canonicalUrl?: string;
  robotsNoIndex?: boolean;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  let seoSettings: SeoSettings = {};
  try {
    seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
  } catch { /* 설정 로드 실패 시 기본값 사용 */ }
  const baseUrl = getCanonicalUrl(seoSettings.canonicalUrl);

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
