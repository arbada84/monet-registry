import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { cancelAutoPressObservedRun } from "@/lib/auto-press-observability";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "운영자가 보도자료 자동등록 실행을 중단 표시했습니다.";
    const run = await cancelAutoPressObservedRun(id, reason);
    if (!run) {
      return NextResponse.json({ success: false, error: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true, run, message: "실행이 중단 표시되었습니다." });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 실행 중단 표시에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
