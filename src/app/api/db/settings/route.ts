import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";

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
  "cp-site-type",
]);

async function isAdmin(request: NextRequest): Promise<boolean> {
  try {
    // 쿠키 인증
    const cookie = request.cookies.get("cp-admin-auth");
    const result = await verifyAuthToken(cookie?.value ?? "");
    if (result.valid) return true;
    // Bearer CRON_SECRET 인증 (서버 간 내부 호출용)
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (cronSecret && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token.length === cronSecret.length && token === cronSecret) return true;
    }
    return false;
  } catch { return false; }
}

// GET /api/db/settings?key=xxx&fallback=...
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ success: false, error: "key required" }, { status: 400 });

    // 공개 읽기가 가능한 키면 바로 반환
    if (!PUBLIC_READABLE_KEYS.has(key)) {
      // 비공개 키는 관리자 인증 필요
      if (!await isAdmin(request)) {
        return NextResponse.json({ success: false, error: "접근이 거부되었습니다." }, { status: 403 });
      }
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

// PUT /api/db/settings { key, value } — middleware가 인증 보장
export async function PUT(request: NextRequest) {
  try {
    const { key, value } = await request.json();
    if (!key) return NextResponse.json({ success: false, error: "key required" }, { status: 400 });
    await serverSaveSetting(key, value);
    // ISR 캐시 무효화: 해당 설정 키 및 전체 settings 태그
    revalidateTag("settings");
    revalidateTag(`setting:${key}`);
    // SEO/사이트 설정 변경 시 전체 레이아웃 캐시 무효화
    if (key === "cp-seo-settings" || key === "cp-site-settings" || key === "cp-sns-settings") {
      revalidatePath("/", "layout");
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PUT settings error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
