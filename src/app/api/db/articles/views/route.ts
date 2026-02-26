import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function getIncrementFn() {
  if (process.env.PHP_API_URL) {
    const { dbIncrementViews } = await import("@/lib/php-api-db");
    return dbIncrementViews;
  }
  if (process.env.MYSQL_DATABASE) {
    const { dbIncrementViews } = await import("@/lib/mysql-db");
    return dbIncrementViews;
  }
  const { fileIncrementViews } = await import("@/lib/file-db");
  return fileIncrementViews;
}

// POST /api/db/articles/views { id }
export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    const fn = await getIncrementFn();
    await fn(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST views error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
