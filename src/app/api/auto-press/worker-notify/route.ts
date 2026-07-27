import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "@/lib/cookie-auth";
import { serverGetArticleById } from "@/lib/db-server";
import {
  appendAutoPressObservedEvent,
  getAutoPressObservedRunDetail,
  listAutoPressObservedEvents,
} from "@/lib/auto-press-observability";
import { notifyTelegramArticleRegistered, notifyTelegramAutoPublishRun } from "@/lib/telegram-notify";
import {
  buildAutoPressRunFromObservedRun,
  getAutoPressDailyLimitWaitingItems,
  hasAutoPressArticleRegisteredSent,
  hasAutoPressDailyLimitWaitingSent,
  hasAutoPressTelegramResultSent,
  isAutoPressRunTerminalForTelegram,
  isAutoPressRunWaitingForDailyLimit,
  TELEGRAM_ARTICLE_REGISTERED_SENT_CODE,
  TELEGRAM_DAILY_LIMIT_WAITING_SENT_CODE,
  TELEGRAM_RESULT_SENT_CODE,
} from "@/lib/auto-press-worker-notify";
import { publishArticleToPortals } from "@/lib/portal-publication";

function isAuthorized(req: NextRequest): boolean {
  const secrets = [
    process.env.AUTO_PRESS_WORKER_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((secret): secret is string => Boolean(secret));
  if (secrets.length === 0) return false;
  const authorization = req.headers.get("authorization") || "";
  const direct = req.headers.get("x-auto-press-worker-secret") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return secrets.some((secret) => (
    (bearer && timingSafeEqual(bearer, secret))
    || (direct && timingSafeEqual(direct, secret))
  ));
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

    const events = await listAutoPressObservedEvents({ runId, limit: 200 });
    const notifiedItem = itemId ? run.items?.find((item) => item.id === itemId) : undefined;
    let articleRegisteredNotified = false;

    if (
      notifiedItem
      && notifiedItem.status === "ok"
      && (notifiedItem.articleId || notifiedItem.articleNo)
      && !hasAutoPressArticleRegisteredSent(events, notifiedItem.id)
    ) {
      try { revalidateTag("articles"); } catch { /* Worker 등록 알림 실패 방지를 위해 캐시 무효화 오류는 무시 */ }
      const status = typeof run.options?.publishStatus === "string" ? run.options.publishStatus : undefined;
      let shouldPublishToPortals = status === "게시";
      if (notifiedItem.articleId) {
        try {
          const article = await serverGetArticleById(notifiedItem.articleId);
          if (article) shouldPublishToPortals = article.status === "게시";
        } catch {
          // Fall back to the worker run option when the read adapter is temporarily unavailable.
        }
      }
      if (shouldPublishToPortals) {
        await publishArticleToPortals({
          articleId: notifiedItem.articleId,
          articleNo: notifiedItem.articleNo,
          title: notifiedItem.title,
          status: "게시",
          source: "auto-press-worker",
        }).catch((error) => {
          console.warn("[auto-press worker-notify] portal publication failed:", error instanceof Error ? error.message : error);
        });
      }
      const sent = await notifyTelegramArticleRegistered({
        kind: "auto_press",
        title: notifiedItem.title || "(제목 없음)",
        source: notifiedItem.sourceName || notifiedItem.sourceId || "미확인",
        registeredAt: notifiedItem.completedAt || run.completedAt || new Date().toISOString(),
        status,
        articleId: notifiedItem.articleId,
        articleNo: notifiedItem.articleNo,
        sourceUrl: notifiedItem.sourceUrl,
        thumbnail: notifiedItem.imageUrl,
      });
      articleRegisteredNotified = sent;
      await appendAutoPressObservedEvent({
        runId,
        itemId: notifiedItem.id,
        level: sent ? "info" : "warn",
        code: sent ? TELEGRAM_ARTICLE_REGISTERED_SENT_CODE : "TELEGRAM_ARTICLE_REGISTERED_NOT_SENT",
        message: sent
          ? "보도자료 개별 등록 알림을 텔레그램으로 전송했습니다."
          : "보도자료 개별 등록 알림 텔레그램 전송이 비활성화되었거나 실패했습니다.",
        metadata: {
          articleId: notifiedItem.articleId,
          articleNo: notifiedItem.articleNo,
          title: notifiedItem.title,
          sourceUrl: notifiedItem.sourceUrl,
          imageUrl: notifiedItem.imageUrl,
        },
      }).catch(() => undefined);
    }

    if (!isAutoPressRunTerminalForTelegram(run)) {
      if (isAutoPressRunWaitingForDailyLimit(run) && !hasAutoPressDailyLimitWaitingSent(events)) {
        const telegramRun = buildAutoPressRunFromObservedRun(run);
        const dailyLimitItems = getAutoPressDailyLimitWaitingItems(run);
        const sent = await notifyTelegramAutoPublishRun("auto_press", {
          ...telegramRun,
          warnings: [
            `일일 처리 한도에 도달해 ${dailyLimitItems.length}건이 다음 실행 대기 상태입니다.`,
            ...(telegramRun.warnings || []),
          ],
        });
        await appendAutoPressObservedEvent({
          runId,
          itemId: itemId || undefined,
          level: sent ? "warn" : "error",
          code: sent ? TELEGRAM_DAILY_LIMIT_WAITING_SENT_CODE : "TELEGRAM_DAILY_LIMIT_WAITING_NOT_SENT",
          message: sent
            ? "보도자료 자동등록 일일 한도 대기 상태를 텔레그램으로 전송했습니다."
            : "보도자료 자동등록 일일 한도 대기 상태 텔레그램 전송이 비활성화되었거나 실패했습니다.",
          metadata: {
            dailyLimitWaitingCount: dailyLimitItems.length,
            queuedCount: run.queuedCount,
          },
        }).catch(() => undefined);

        return NextResponse.json({
          success: true,
          notified: sent,
          reason: sent ? "DAILY_LIMIT_WAITING_SENT" : "DAILY_LIMIT_WAITING_NOT_SENT",
          runStatus: run.status,
          queuedCount: run.queuedCount,
          dailyLimitWaitingCount: dailyLimitItems.length,
          articleRegisteredNotified,
        });
      }

      return NextResponse.json({
        success: true,
        notified: false,
        reason: "RUN_NOT_TERMINAL",
        runStatus: run.status,
        queuedCount: run.queuedCount,
        articleRegisteredNotified,
      });
    }

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

    return NextResponse.json({ success: true, notified: sent, articleRegisteredNotified });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 Worker 처리 결과 알림에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
