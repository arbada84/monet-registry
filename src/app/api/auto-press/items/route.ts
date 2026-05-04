import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { listAutoPressObservedItems } from "@/lib/auto-press-observability";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const searchParams = new URL(req.url).searchParams;
    const runId = searchParams.get("runId") || undefined;
    const status = searchParams.get("status") || undefined;
    const order = searchParams.get("order") === "desc" ? "desc" : "asc";
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 100), 500));
    const items = await listAutoPressObservedItems({ runId, status, limit, order });
    return NextResponse.json({ success: true, items });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 기사별 처리 결과를 불러오지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
