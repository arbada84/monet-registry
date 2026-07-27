import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { runAutoPressRetryScheduler } from "@/lib/auto-press-retry-scheduler";
import { notifyTelegramAutoPressRetryQueue } from "@/lib/telegram-notify";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const limit = Math.max(1, Math.min(Number(body.limit || 3), 10));
    const result = await runAutoPressRetryScheduler({
      limit,
      preferWorker: body.preferWorker !== false,
      allowDirectFallback: body.allowDirectFallback === true,
    });
    if (result.mode === "direct" && result.summary && result.summary.processed > 0) {
      await notifyTelegramAutoPressRetryQueue(result.summary).catch((notifyError) => {
        console.warn("[auto-press] telegram retry queue summary failed:", notifyError instanceof Error ? notifyError.message : notifyError);
      });
    }
    return NextResponse.json({
      ...result,
      ...(result.summary || {}),
      succeeded: result.summary?.success,
      success: result.ok,
    }, { status: result.ok ? 200 : result.status || 500 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "AI 대기열 처리에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
