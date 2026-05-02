/**
 * AI 편집 실패 기사 자동 재편집 크론 핸들러
 * POST /api/cron/retry-ai-edit
 * GET  /api/cron/retry-ai-edit
 *
 * D1 auto_press_retry_queue를 우선 처리한다.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { processAutoPressRetryQueue } from "@/lib/auto-press-retry-queue";

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

async function handleRetry(req: NextRequest): Promise<NextResponse> {
  if (!(await authenticate(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    const limit = Number(body.limit ?? url.searchParams.get("limit") ?? 3);
    const queueId = typeof body.queueId === "string" ? body.queueId : url.searchParams.get("queueId") || undefined;
    const force = Boolean(body.force ?? (url.searchParams.get("force") === "true"));
    const result = await processAutoPressRetryQueue({ limit, queueId, force });
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
