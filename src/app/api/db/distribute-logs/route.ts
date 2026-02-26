import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { DistributeLog } from "@/types/article";

async function getDB() {
  if (process.env.PHP_API_URL) {
    const { dbGetDistributeLogs, dbAddDistributeLogs, dbClearDistributeLogs } = await import("@/lib/php-api-db");
    return { dbGetDistributeLogs, dbAddDistributeLogs, dbClearDistributeLogs };
  }
  if (process.env.MYSQL_DATABASE) {
    const { dbGetDistributeLogs, dbAddDistributeLogs, dbClearDistributeLogs } = await import("@/lib/mysql-db");
    return { dbGetDistributeLogs, dbAddDistributeLogs, dbClearDistributeLogs };
  }
  const { fileGetDistributeLogs, fileAddDistributeLogs, fileClearDistributeLogs } = await import("@/lib/file-db");
  return {
    dbGetDistributeLogs: fileGetDistributeLogs,
    dbAddDistributeLogs: fileAddDistributeLogs,
    dbClearDistributeLogs: fileClearDistributeLogs,
  };
}

// GET /api/db/distribute-logs
export async function GET() {
  try {
    const { dbGetDistributeLogs } = await getDB();
    const logs = await dbGetDistributeLogs();
    return NextResponse.json({ success: true, logs });
  } catch (e) {
    console.error("[DB] GET distribute-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/distribute-logs { logs: DistributeLog[] }
export async function POST(request: NextRequest) {
  try {
    const { dbAddDistributeLogs } = await getDB();
    const { logs }: { logs: DistributeLog[] } = await request.json();
    if (!Array.isArray(logs)) return NextResponse.json({ success: false, error: "logs array required" }, { status: 400 });
    await dbAddDistributeLogs(logs);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST distribute-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/distribute-logs → 전체 삭제
export async function DELETE() {
  try {
    const { dbClearDistributeLogs } = await getDB();
    await dbClearDistributeLogs();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE distribute-logs error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
