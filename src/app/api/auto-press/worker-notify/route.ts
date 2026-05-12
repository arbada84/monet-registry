import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/cookie-auth";
import {
  appendAutoPressObservedEvent,
  getAutoPressObservedRunDetail,
  listAutoPressObservedEvents,
} from "@/lib/auto-press-observability";
import { notifyTelegramAutoPublishRun } from "@/lib/telegram-notify";
import {
  buildAutoPressRunFromObservedRun,
  hasAutoPressTelegramResultSent,
  isAutoPressRunTerminalForTelegram,
  TELEGRAM_RESULT_SENT_CODE,
} from "@/lib/auto-press-worker-notify";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.AUTO_PRESS_WORKER_SECRET?.trim();
  if (!secret) return false;
  const authorization = req.headers.get("authorization") || "";
  const direct = req.headers.get("x-auto-press-worker-secret") || "";
  return (authorization.startsWith("Bearer ") && timingSafeEqual(authorization.slice(7), secret))
    || timingSafeEqual(direct, secret);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const runId = String(body.runId || "").trim();
    const itemId = String(body.itemId || "").trim();
    if (!runId) {
      return NextResponse.json({ success: false, error: "runId가 필요합니다." }, { status: 400 });
    }

    const run = await getAutoPressObservedRunDetail(runId);
    if (!run) {
      return NextResponse.json({ success: false, error: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!isAutoPressRunTerminalForTelegram(run)) {
      return NextResponse.json({
        success: true,
        notified: false,
        reason: "RUN_NOT_TERMINAL",
        runStatus: run.status,
        queuedCount: run.queuedCount,
      });
    }

    const events = await listAutoPressObservedEvents({ runId, limit: 200 });
    if (hasAutoPressTelegramResultSent(events)) {
      return NextResponse.json({ success: true, notified: false, reason: "ALREADY_SENT" });
    }

    const telegramRun = buildAutoPressRunFromObservedRun(run);
    const sent = await notifyTelegramAutoPublishRun("auto_press", telegramRun);
    await appendAutoPressObservedEvent({
      runId,
      itemId: itemId || undefined,
      level: sent ? "info" : "warn",
      code: sent ? TELEGRAM_RESULT_SENT_CODE : "TELEGRAM_RUN_RESULT_NOT_SENT",
      message: sent
        ? "보도자료 자동등록 최종 처리 결과를 텔레그램으로 전송했습니다."
        : "보도자료 자동등록 최종 처리 결과 텔레그램 전송이 비활성화되었거나 실패했습니다.",
      metadata: {
        publishedCount: run.publishedCount,
        skippedCount: run.skippedCount,
        failedCount: run.failedCount,
        itemCount: run.items?.length || 0,
      },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, notified: sent });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 Worker 처리 결과 알림에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
