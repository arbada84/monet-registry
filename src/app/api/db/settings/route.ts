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
  "cp-ads-global",
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

/** 상수 시간 문자열 비교 — 타이밍 공격 방어 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i % (a.length || 1)) ?? 0) ^ (b.charCodeAt(i % (b.length || 1)) ?? 0);
  }
  return diff === 0;
}

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
      return timingSafeEqual(authHeader.slice(7), cronSecret);
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
    let value = await serverGetSetting(key, fallback);

    // 민감 필드 필터링: 계정 목록에서 비밀번호 해시 제거 (관리자라도 클라이언트에 노출 불필요)
    if (key === "cp-admin-accounts" && Array.isArray(value)) {
      value = value.map((acc: Record<string, unknown>) => {
        const { password, passwordHash, ...safe } = acc;
        return safe;
      });
    }
    // 뉴스레터 SMTP 비밀번호 마스킹 (저장된 값이 있으면 placeholder 표시)
    if (key === "cp-newsletter-settings" && value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (v.smtpPass && typeof v.smtpPass === "string" && v.smtpPass.length > 0) {
        v.smtpPass = "••••••••";
      }
    }

    return NextResponse.json({ success: true, value });
  } catch (e) {
    console.error("[DB] GET settings error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PUT /api/db/settings { key, value } — middleware가 인증 보장
export async function PUT(request: NextRequest) {
  try {
    const { key, value: rawValue } = await request.json();
    if (!key) return NextResponse.json({ success: false, error: "key required" }, { status: 400 });

    // SMTP 비밀번호: 마스킹된 값("••••••••")이 전송되면 기존 값 유지
    let value = rawValue;
    if (key === "cp-newsletter-settings" && value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (v.smtpPass === "••••••••") {
        const existing = await serverGetSetting<Record<string, unknown>>(key, {});
        value = { ...v, smtpPass: existing.smtpPass ?? "" };
      }
    }

    await serverSaveSetting(key, value);
    // ISR 캐시 무효화: 해당 설정 키 태그
    revalidateTag(`setting:${key}`);
    // 사이트 표시에 영향 주는 설정 변경 시 전체 캐시 무효화
    const LAYOUT_KEYS = ["cp-seo-settings", "cp-site-settings", "cp-sns-settings", "cp-ads-global"];
    const PAGE_KEYS = ["cp-ads", "cp-ads-global", "cp-categories", "cp-menus", "cp-site-type", "cp-popups", "cp-headline-articles", "cp-comment-settings", "cp-banner-settings"];
    if (LAYOUT_KEYS.includes(key)) {
      revalidatePath("/", "layout");
    }
    if (PAGE_KEYS.includes(key)) {
      revalidatePath("/", "page");
    }
    // 댓글 설정 변경 시 기사 페이지도 무효화
    if (key === "cp-comment-settings" || key === "cp-comments") {
      revalidateTag("articles");
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PUT settings error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
