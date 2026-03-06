import { NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";

export const dynamic = "force-dynamic";

interface SeoSettings {
  robotsNoIndex?: boolean;
}

export async function GET() {
  // 개행 오염 완전 차단: 절대 하드코딩
  const baseUrl = "https://culturepeople.co.kr";

  let seoSettings: SeoSettings = {};
  try {
    seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
  } catch { /* 기본값 사용 */ }

  let txt: string;
  if (seoSettings.robotsNoIndex) {
    txt = "User-agent: *\nDisallow: /\n";
  } else {
    txt = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nUser-agent: Googlebot\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
  }

  return new NextResponse(txt, {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
