import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { listAutoPressSourceQuality } from "@/lib/auto-press-observability";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const searchParams = new URL(req.url).searchParams;
    const days = Math.max(0, Math.min(Number(searchParams.get("days") || 30), 3650));
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 30), 80));
    const includePreview = searchParams.get("includePreview") === "1";
    const sources = await listAutoPressSourceQuality({ days, limit, includePreview });
    return NextResponse.json({ success: true, days, includePreview, sources });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 수집 소스 품질 리포트를 불러오지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
