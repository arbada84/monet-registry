import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { processAutoPressRetryQueue } from "@/lib/auto-press-retry-queue";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const limit = Math.max(1, Math.min(Number(body.limit || 3), 10));
    const result = await processAutoPressRetryQueue({ limit });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "AI 대기열 처리에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
