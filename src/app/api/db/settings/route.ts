import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";

// 인증 없이 공개 읽기가 허용되는 설정 키 목록
// SMTP 자격증명, API 키, 계정 정보 등 민감 키는 포함하지 않음
const PUBLIC_READABLE_KEYS = new Set([
  "cp-site-settings",
  "cp-menus",
  "cp-categories",
  "cp-ads",
  "cp-seo-settings",
  "cp-about",
  "cp-terms",
  "cp-sns-settings",
  "cp-rss-settings",
  "cp-headline-articles",
  "cp-popups",
  "cp-banner-settings",
  "cp-comment-settings",
]);

// GET /api/db/settings?key=xxx&fallback=...
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ success: false, error: "key required" }, { status: 400 });

    // 민감 설정 키는 공개 접근 차단
    if (!PUBLIC_READABLE_KEYS.has(key)) {
      return NextResponse.json({ success: false, error: "접근이 거부되었습니다." }, { status: 403 });
    }

    const fallbackStr = request.nextUrl.searchParams.get("fallback");
    let fallback = null;
    if (fallbackStr !== null) {
      try { fallback = JSON.parse(fallbackStr); } catch { fallback = null; }
    }
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
