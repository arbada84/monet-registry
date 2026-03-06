import { NextResponse } from "next/server";
import { registryService } from "@/app/api/_common/services";

export async function GET() {
  try {
    const componentCount = await registryService.getTotalCount();

    const rawUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "(not set)";
    const cleanUrl = rawUrl.split(/\s/)[0]?.replace(/\/$/, "") || "fallback";
    return NextResponse.json({
      status: "ok",
      version: "1.0.0",
      initialized: true,
      component_count: componentCount,
      _debug_site_url_raw_length: rawUrl.length,
      _debug_site_url_clean: cleanUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        version: "1.0.0",
        initialized: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
