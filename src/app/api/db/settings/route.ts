import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function getDB() {
  if (process.env.PHP_API_URL) {
    const { dbGetSetting, dbSaveSetting } = await import("@/lib/php-api-db");
    return { dbGetSetting, dbSaveSetting };
  }
  if (process.env.MYSQL_DATABASE) {
    const { dbGetSetting, dbSaveSetting } = await import("@/lib/mysql-db");
    return { dbGetSetting, dbSaveSetting };
  }
  const { fileGetSetting, fileSaveSetting } = await import("@/lib/file-db");
  return { dbGetSetting: fileGetSetting, dbSaveSetting: fileSaveSetting };
}

// GET /api/db/settings?key=xxx&fallback=...
export async function GET(request: NextRequest) {
  try {
    const { dbGetSetting } = await getDB();
    const key = request.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ success: false, error: "key required" }, { status: 400 });
    const fallbackStr = request.nextUrl.searchParams.get("fallback");
    const fallback = fallbackStr !== null ? JSON.parse(fallbackStr) : null;
    const value = await dbGetSetting(key, fallback);
    return NextResponse.json({ success: true, value });
  } catch (e) {
    console.error("[DB] GET settings error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PUT /api/db/settings { key, value }
export async function PUT(request: NextRequest) {
  try {
    const { dbSaveSetting } = await getDB();
    const { key, value } = await request.json();
    if (!key) return NextResponse.json({ success: false, error: "key required" }, { status: 400 });
    await dbSaveSetting(key, value);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PUT settings error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
