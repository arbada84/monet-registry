import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";

// GET /api/db/settings?key=xxx&fallback=...
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ success: false, error: "key required" }, { status: 400 });
    const fallbackStr = request.nextUrl.searchParams.get("fallback");
    const fallback = fallbackStr !== null ? JSON.parse(fallbackStr) : null;
    const value = await serverGetSetting(key, fallback);
    return NextResponse.json({ success: true, value });
  } catch (e) {
    console.error("[DB] GET settings error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PUT /api/db/settings { key, value }
export async function PUT(request: NextRequest) {
  try {
    const { key, value } = await request.json();
    if (!key) return NextResponse.json({ success: false, error: "key required" }, { status: 400 });
    await serverSaveSetting(key, value);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PUT settings error:", e);
    const msg = e instanceof Error ? e.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
