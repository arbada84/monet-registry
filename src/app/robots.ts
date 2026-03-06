import type { MetadataRoute } from "next";
import { serverGetSetting } from "@/lib/db-server";
export const revalidate = 3600; // 1시간마다 재생성

interface SeoSettings {
  robotsNoIndex?: boolean;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  // 개행 오염 완전 차단: 하드코딩 사용
  const baseUrl = "https://culturepeople.co.kr";

  let seoSettings: SeoSettings = {};
  try {
    seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
  } catch { /* 설정 로드 실패 시 기본값 사용 */ }

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
