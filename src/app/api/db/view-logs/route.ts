import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function getDB() {
  if (process.env.PHP_API_URL) {
    const { dbGetViewLogs, dbAddViewLog } = await import("@/lib/php-api-db");
    return { dbGetViewLogs, dbAddViewLog };
  }
  if (process.env.MYSQL_DATABASE) {
    const { dbGetViewLogs, dbAddViewLog } = await import("@/lib/mysql-db");
    return { dbGetViewLogs, dbAddViewLog };
  }
  const { fileGetViewLogs, fileAddViewLog } = await import("@/lib/file-db");
  return { dbGetViewLogs: fileGetViewLogs, dbAddViewLog: fileAddViewLog };
}

// GET /api/db/view-logs
export async function GET() {
  try {
    const { dbGetViewLogs } = await getDB();
    const logs = await dbGetViewLogs();
    return NextResponse.json({ success: true, logs });
  } catch (e) {
    console.error("[DB] GET view-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/view-logs { articleId, path }
export async function POST(request: NextRequest) {
  try {
    const { dbAddViewLog } = await getDB();
    const { articleId, path } = await request.json();
    if (!articleId) return NextResponse.json({ success: false, error: "articleId required" }, { status: 400 });
    await dbAddViewLog({ articleId, path: path || "/" });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST view-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
