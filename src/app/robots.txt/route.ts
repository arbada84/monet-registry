import { NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";
import { resolveRobotsTxt, type RobotsSettings } from "@/lib/seo-robots";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = "https://culturepeople.co.kr";

  let seoSettings: RobotsSettings = {};
  try {
    seoSettings = await serverGetSetting<RobotsSettings>("cp-seo-settings", {});
  } catch {
    // Keep robots.txt available even when the settings store is temporarily unavailable.
  }

  return new NextResponse(resolveRobotsTxt(seoSettings, baseUrl), {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
