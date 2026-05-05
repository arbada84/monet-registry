import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { getAutoPressRetrySchedulerHealth, runAutoPressRetryScheduler } from "@/lib/auto-press-retry-scheduler";
import { notifyTelegramAutoPressRetryQueue } from "@/lib/telegram-notify";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const remote = new URL(req.url).searchParams.get("remote") === "1";
  const scheduler = await getAutoPressRetrySchedulerHealth({ remote });
  return NextResponse.json({ success: true, scheduler }, { status: scheduler.level === "error" ? 503 : 200 });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const parsedLimit = Number(body.limit ?? 3);
    const result = await runAutoPressRetryScheduler({
      limit: Number.isFinite(parsedLimit) ? Math.max(1, Math.min(Math.trunc(parsedLimit), 5)) : 3,
      preferWorker: body.preferWorker !== false,
    });

    if (result.mode === "direct" && result.summary && result.summary.processed > 0) {
      await notifyTelegramAutoPressRetryQueue(result.summary).catch((notifyError) => {
        console.warn("[auto-press] telegram retry scheduler summary failed:", notifyError instanceof Error ? notifyError.message : notifyError);
      });
    }

    return NextResponse.json({ success: result.ok, ...result }, { status: result.ok ? 200 : result.status || 500 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "AI 재시도 스케줄러 실행에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
