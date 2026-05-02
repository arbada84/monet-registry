import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { listAutoPressObservedEvents } from "@/lib/auto-press-observability";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const limit = Math.max(1, Math.min(Number(new URL(req.url).searchParams.get("limit") || 100), 500));
    const events = await listAutoPressObservedEvents({ runId: id, limit });
    return NextResponse.json({ success: true, events });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 실행 이벤트를 불러오지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
