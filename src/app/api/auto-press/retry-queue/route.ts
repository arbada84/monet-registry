import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { listAutoPressRetryQueue } from "@/lib/auto-press-observability";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const searchParams = new URL(req.url).searchParams;
    const status = searchParams.get("status") || undefined;
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 50), 300));
    const queue = await listAutoPressRetryQueue({ status, limit });
    return NextResponse.json({ success: true, queue });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 AI 대기열을 불러오지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
