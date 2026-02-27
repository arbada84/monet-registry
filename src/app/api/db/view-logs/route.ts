import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverGetViewLogs, serverAddViewLog } from "@/lib/db-server";

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
    if (!articleId) return NextResponse.json({ success: false, error: "articleId required" }, { status: 400 });
    await serverAddViewLog({ articleId, path: path || "/" });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST view-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
