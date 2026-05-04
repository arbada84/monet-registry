import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { appendAutoPressObservedEvent, getAutoPressObservedRunDetail } from "@/lib/auto-press-observability";
import { runAutoPress } from "@/app/api/cron/auto-press/route";
import { notifyTelegramAutoPublishRun } from "@/lib/telegram-notify";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function asPositiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.max(1, Math.trunc(number));
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(String).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function asPublishStatus(value: unknown): "게시" | "임시저장" | undefined {
  if (value === "게시" || value === "임시저장") return value;
  return undefined;
}

export async function POST(req: NextRequest, context: RouteContext) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const run = await getAutoPressObservedRunDetail(id);
    if (!run) {
      return NextResponse.json({ success: false, error: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const options = run.options || {};
    const excludeUrls = [
      ...(run.items || []).map((item) => item.sourceUrl).filter((url): url is string => Boolean(url)),
      ...(asStringArray(body.excludeUrls) || []),
    ];

    await appendAutoPressObservedEvent({
      runId: run.id,
      level: "info",
      code: "RUN_PROCESS_REQUESTED",
      message: "운영자가 이전 실행 기록 기준으로 이어 실행을 요청했습니다.",
      metadata: { previousStatus: run.status, excludeUrlCount: excludeUrls.length },
    }).catch(() => undefined);

    const continuedRun = await runAutoPress({
      source: "manual",
      triggeredBy: `관리자 이어 실행 (${run.id})`,
      countOverride: asPositiveNumber(body.count) || asPositiveNumber(options.count) || run.requestedCount || undefined,
      keywordsOverride: asStringArray(body.keywords) || asStringArray(options.keywords),
      categoryOverride: typeof body.category === "string" ? body.category : typeof options.category === "string" ? options.category : undefined,
      statusOverride: asPublishStatus(body.publishStatus) || asPublishStatus(options.publishStatus),
      preview: typeof body.preview === "boolean" ? body.preview : Boolean(options.preview),
      force: typeof body.force === "boolean" ? body.force : Boolean(options.force),
      dateRangeDays: asPositiveNumber(body.dateRangeDays) || asPositiveNumber(options.dateRangeDays),
      noAiEdit: typeof body.noAiEdit === "boolean" ? body.noAiEdit : Boolean(options.noAiEdit),
      wrIds: asStringArray(body.wrIds) || asStringArray(options.wrIds),
      excludeUrls: excludeUrls.length > 0 ? [...new Set(excludeUrls)] : undefined,
    });

    if (!continuedRun.preview) {
      await notifyTelegramAutoPublishRun("auto_press", continuedRun).catch((notifyError) => {
        console.warn("[auto-press] telegram continued run summary failed:", notifyError instanceof Error ? notifyError.message : notifyError);
      });
    }

    return NextResponse.json({
      success: true,
      message: "이전 실행 기록을 기준으로 이어 실행을 완료했습니다.",
      previousRun: run,
      run: continuedRun,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 자동등록 이어 실행에 실패했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
