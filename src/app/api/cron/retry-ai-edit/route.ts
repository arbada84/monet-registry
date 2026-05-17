/**
 * AI 편집 실패 기사 자동 재편집 크론 핸들러
 * POST /api/cron/retry-ai-edit
 * GET  /api/cron/retry-ai-edit
 *
 * D1 auto_press_retry_queue를 우선 처리한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { notifyTelegramAutoPressRetryQueue } from "@/lib/telegram-notify";

async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    if (bearer && timingSafeEqual(bearer, secret)) return true;
  }
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

function envFlag(name: string, fallback = false): boolean {
  const raw = String(process.env[name] || "").trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on", "enabled"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

async function handleRetry(req: NextRequest): Promise<NextResponse> {
  if (!(await authenticate(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    const limit = Number(body.limit ?? url.searchParams.get("limit") ?? 1);
    const queueId = typeof body.queueId === "string" ? body.queueId : url.searchParams.get("queueId") || undefined;
    const force = Boolean(body.force ?? (url.searchParams.get("force") === "true"));
    const allowDirectProcessing = Boolean(body.allowDirectProcessing ?? (url.searchParams.get("allowDirectProcessing") === "true"));
    if (!envFlag("AUTO_PRESS_DIRECT_AI_RETRY_ENABLED", false) || !allowDirectProcessing) {
      return NextResponse.json({
        success: false,
        directProcessingBlocked: true,
        error: "Vercel CPU 보호를 위해 서버 직접 AI 재시도 처리를 차단했습니다. Cloudflare Worker 재시도 경로를 사용하거나, 긴급 복구 시에만 AUTO_PRESS_DIRECT_AI_RETRY_ENABLED=true와 allowDirectProcessing=true를 함께 사용하세요.",
      }, { status: 409 });
    }
    const { processAutoPressRetryQueue } = await import("@/lib/auto-press-retry-queue");
    const result = await processAutoPressRetryQueue({ limit, queueId, force });
    if (result.processed > 0) {
      await notifyTelegramAutoPressRetryQueue(result).catch((notifyError) => {
        console.warn("[auto-press] telegram retry cron summary failed:", notifyError instanceof Error ? notifyError.message : notifyError);
      });
    }
    return NextResponse.json({ ...result, succeeded: result.success, success: true });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "AI 재편집 처리 중 오류가 발생했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export const maxDuration = 60;
export async function GET(req: NextRequest) { return handleRetry(req); }
export async function POST(req: NextRequest) { return handleRetry(req); }
