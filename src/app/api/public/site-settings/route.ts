import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";
import { isPublicSiteSetting, PUBLIC_SETTING_CACHE_SECONDS } from "@/lib/public-site-settings";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") || "";
  if (!isPublicSiteSetting(key)) {
    return NextResponse.json({ success: false, error: "Unknown public setting" }, {
      status: 400, headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const value = await serverGetSetting<unknown>(key, null);
    return NextResponse.json({ success: true, value }, {
      headers: {
        "Cache-Control": `public, max-age=${PUBLIC_SETTING_CACHE_SECONDS}, s-maxage=${PUBLIC_SETTING_CACHE_SECONDS}`,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Public setting unavailable" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
