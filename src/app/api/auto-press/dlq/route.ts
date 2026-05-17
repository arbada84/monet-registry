import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { getAutoPressDeadLetterSummary, listAutoPressDeadLetterItems } from "@/lib/auto-press-observability";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const searchParams = new URL(req.url).searchParams;
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 100), 500));
    const reasonCode = searchParams.get("reasonCode") || undefined;
    const includeRetryable = searchParams.get("includeRetryable") === "true";

    const [items, summary] = await Promise.all([
      listAutoPressDeadLetterItems({ limit, reasonCode, includeRetryable }),
      getAutoPressDeadLetterSummary(),
    ]);

    return NextResponse.json({ success: true, items, summary });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "보도자료 실패함을 불러오지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
