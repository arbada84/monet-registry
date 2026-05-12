import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { enqueueAutoPressObservedItemRetry } from "@/lib/auto-press-observability";
import { processAutoPressRetryQueue } from "@/lib/auto-press-retry-queue";
import { notifyTelegramAutoPressRetryQueue } from "@/lib/telegram-notify";

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
    const processNow = body.processNow !== false;
    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : undefined;

    const queue = await enqueueAutoPressObservedItemRetry(id, { reason, nextAttemptAt: processNow ? null : new Date().toISOString() });
    if (!queue) {
      return NextResponse.json({ success: false, error: "기사별 처리 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!processNow) {
      return NextResponse.json({
        success: true,
        message: "AI 재편집 대기열에 등록했습니다.",
        queue,
      });
    }

    const result = await processAutoPressRetryQueue({ queueId: queue.id, force: true, limit: 1 });
    if (result.processed > 0) {
      await notifyTelegramAutoPressRetryQueue(result).catch((notifyError) => {
        console.warn("[auto-press] telegram observed item retry summary failed:", notifyError instanceof Error ? notifyError.message : notifyError);
      });
    }

    return NextResponse.json({
      ...result,
      success: true,
      succeeded: result.success,
      queue,
      message: result.message || "AI 재편집 재시도를 실행했습니다.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("기사 ID") ? 400 : 500;
    return NextResponse.json({
      success: false,
      error: status === 400 ? message : "기사별 AI 재시도 요청 처리에 실패했습니다.",
      detail: status === 400 ? undefined : message,
    }, { status });
  }
}
