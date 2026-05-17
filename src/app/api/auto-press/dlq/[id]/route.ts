import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import {
  discardAutoPressDeadLetterItem,
  requeueAutoPressDeadLetterItem,
} from "@/lib/auto-press-observability";
import { dispatchAutoPressWorker } from "@/lib/auto-press-worker-dispatch";

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
    const action = body.action === "discard" ? "discard" : "retry";
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : undefined;

    if (action === "discard") {
      const item = await discardAutoPressDeadLetterItem(id, { reason });
      if (!item) {
        return NextResponse.json({ success: false, error: "실패 항목을 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        action,
        item,
        message: "실패 항목을 운영 제외 처리했습니다.",
      });
    }

    const item = await requeueAutoPressDeadLetterItem(id, { reason });
    if (!item) {
      return NextResponse.json({ success: false, error: "실패 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const shouldDispatch = body.dispatch !== false;
    const dispatch = shouldDispatch
      ? await dispatchAutoPressWorker({ runId: item.runId, limit: Number(body.limit || 20) })
      : null;

    return NextResponse.json({
      success: true,
      action,
      item,
      dispatch,
      message: dispatch?.ok
        ? "실패 항목을 재처리 대기열에 넣고 Worker 실행을 요청했습니다."
        : "실패 항목을 재처리 대기열에 넣었습니다. Worker 예약 실행에서 이어서 처리됩니다.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("최종 실패 상태") ? 400 : 500;
    return NextResponse.json({
      success: false,
      error: status === 400 ? message : "보도자료 실패 항목 처리에 실패했습니다.",
      detail: status === 400 ? undefined : message,
    }, { status });
  }
}
