import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverGetViewLogs, serverAddViewLog } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";

// GET /api/db/view-logs
export async function GET() {
  try {
    const logs = await serverGetViewLogs();
    return NextResponse.json({ success: true, logs });
  } catch (e) {
    console.error("[DB] GET view-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/view-logs { articleId, path }
export async function POST(request: NextRequest) {
  try {
    const { articleId, path } = await request.json();
    if (!articleId || typeof articleId !== "string" || articleId.length > 100) {
      return NextResponse.json({ success: false, error: "articleId required" }, { status: 400 });
    }

    // 관리자 쿠키 확인 → isAdmin 자동 판별
    let isAdmin = false;
    try {
      const cookie = request.cookies.get("cp-admin-auth");
      if (cookie?.value) {
        const result = await verifyAuthToken(cookie.value);
        isAdmin = result.valid;
      }
    } catch { /* 인증 실패는 외부 조회로 처리 */ }

    await serverAddViewLog({ articleId, path: path || "/", isAdmin });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST view-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
