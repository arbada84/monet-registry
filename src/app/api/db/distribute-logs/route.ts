import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { DistributeLog } from "@/types/article";
import { serverGetDistributeLogs, serverAddDistributeLogs, serverClearDistributeLogs } from "@/lib/db-server";

// GET /api/db/distribute-logs
export async function GET() {
  try {
    const logs = await serverGetDistributeLogs();
    return NextResponse.json({ success: true, logs });
  } catch (e) {
    console.error("[DB] GET distribute-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/distribute-logs { logs: DistributeLog[] }
export async function POST(request: NextRequest) {
  try {
    const { logs }: { logs: DistributeLog[] } = await request.json();
    if (!Array.isArray(logs)) return NextResponse.json({ success: false, error: "logs array required" }, { status: 400 });
    await serverAddDistributeLogs(logs);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST distribute-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/distribute-logs → 전체 삭제
export async function DELETE() {
  try {
    await serverClearDistributeLogs();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE distribute-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
