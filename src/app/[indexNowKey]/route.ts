import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";

interface RouteContext {
  params: Promise<{ indexNowKey: string }>;
}

interface SeoSettings {
  indexNowApiKey?: string;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { indexNowKey } = await context.params;
  if (!indexNowKey.endsWith(".txt")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const requestedKey = indexNowKey.slice(0, -4).trim();
  if (!requestedKey || !/^[A-Za-z0-9_-]{8,128}$/.test(requestedKey)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const seoSettings = await serverGetSetting<SeoSettings>("cp-seo-settings", {});
  const configuredKey = seoSettings.indexNowApiKey?.trim();
  if (!configuredKey || requestedKey !== configuredKey) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return new NextResponse(configuredKey, {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
