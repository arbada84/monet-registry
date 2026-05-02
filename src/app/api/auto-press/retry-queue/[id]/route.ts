import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { cancelAutoPressRetryQueueItem, processAutoPressRetryQueue } from "@/lib/auto-press-retry-queue";
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
    const action = String(body.action || "retry");

    if (action === "cancel") {
      await cancelAutoPressRetryQueueItem(
        id,
        typeof body.reason === "string" ? body.reason : "운영자가 AI 재시도 대기열에서 취소했습니다.",
      );
      return NextResponse.json({ success: true, message: "AI 재시도 항목을 취소했습니다." });
    }

    if (action === "retry") {
      const result = await processAutoPressRetryQueue({ queueId: id, force: true, limit: 1 });
      if (result.processed > 0) {
        await notifyTelegramAutoPressRetryQueue(result).catch((notifyError) => {
          console.warn("[auto-press] telegram retry queue item summary failed:", notifyError instanceof Error ? notifyError.message : notifyError);
        });
      }
      return NextResponse.json({ ...result, succeeded: result.success, success: true });
    }

    return NextResponse.json({ success: false, error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "AI 대기열 항목 처리에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
