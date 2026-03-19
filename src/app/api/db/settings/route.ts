import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";

// 인증 없이 공개 읽기가 허용되는 설정 키 목록
// SMTP 자격증명, API 키, 계정 정보 등 민감 키는 포함하지 않음
const PUBLIC_READABLE_KEYS = new Set([
  "cp-site-settings",
  "cp-menus",
  "cp-categories",
  "cp-ads",
  "cp-ads-global",       // 공개 읽기 허용하되, 민감 필드(쿠팡 키 등)는 마스킹 처리
  "cp-seo-settings",
  "cp-about",
  "cp-terms",
  "cp-sns-settings",
  "cp-rss-settings",
  "cp-headline-articles",
  "cp-popups",
  "cp-banner-settings",
  "cp-banners",
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
    // cp-ads-global: 비인증 사용자에게는 민감 API 키 마스킹, 인증 사용자에게는 마스킹 표시
    if (key === "cp-ads-global" && value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      const admin = await isAdmin(request);
      // 쿠팡 SecretKey: 비인증 시 제거, 인증 시 마스킹
      if (v.coupangSecretKey && typeof v.coupangSecretKey === "string" && v.coupangSecretKey.length > 0) {
        v.coupangSecretKey = admin ? "••••••••" : undefined;
      }
      // 쿠팡 AccessKey: 비인증 시 제거, 인증 시 마스킹
      if (v.coupangAccessKey && typeof v.coupangAccessKey === "string" && v.coupangAccessKey.length > 0) {
        v.coupangAccessKey = admin ? "••••••••" : undefined;
      }
    }

    // 메일 설정: 비밀번호 마스킹 (클라이언트에 평문/암호문 노출 방지)
    if (key === "cp-mail-settings" && value && typeof value === "object") {
      const v = value as { accounts?: { password?: string }[] };
      if (Array.isArray(v.accounts)) {
        v.accounts = v.accounts.map((acc) => ({
          ...acc,
          password: acc.password ? "••••••••" : "",
        }));
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

    // 민감 키 보호 — PUT으로 직접 수정 불가
    const PROTECTED_KEYS = ["cp-admin-accounts", "cp-api-keys", "cp-newsletter-settings"];
    if (PROTECTED_KEYS.includes(key)) {
      return NextResponse.json({ success: false, error: "이 설정은 직접 수정할 수 없습니다." }, { status: 403 });
    }

    // 마스킹된 값("••••••••")이 전송되면 기존 값 유지
    let value = rawValue;
    if (key === "cp-newsletter-settings" && value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (v.smtpPass === "••••••••") {
        const existing = await serverGetSetting<Record<string, unknown>>(key, {});
        value = { ...v, smtpPass: existing.smtpPass ?? "" };
      }
    }
    if (key === "cp-ads-global" && value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (v.coupangSecretKey === "••••••••" || v.coupangAccessKey === "••••••••") {
        const existing = await serverGetSetting<Record<string, unknown>>(key, {});
        if (v.coupangSecretKey === "••••••••") v.coupangSecretKey = existing.coupangSecretKey ?? "";
        if (v.coupangAccessKey === "••••••••") v.coupangAccessKey = existing.coupangAccessKey ?? "";
        value = v;
      }
    }

    // 메일 설정: 비밀번호 암호화 처리
    if (key === "cp-mail-settings" && value && typeof value === "object") {
      const v = value as { accounts?: { password?: string; id?: string }[] };
      if (Array.isArray(v.accounts)) {
        const { encrypt, isEncrypted } = await import("@/lib/encrypt");
        const existing = await serverGetSetting<{ accounts?: { id?: string; password?: string }[] }>(key, {});
        v.accounts = v.accounts.map((acc) => {
          if (!acc.password) return acc;
          // "••••••••" → 기존 암호화된 값 유지
          if (acc.password === "••••••••") {
            const existAcc = existing.accounts?.find((e) => e.id === acc.id);
            return { ...acc, password: existAcc?.password ?? "" };
          }
          // 이미 암호화된 경우 그대로 유지
          if (isEncrypted(acc.password)) return acc;
          // 평문 → 암호화
          return { ...acc, password: encrypt(acc.password) };
        });
        value = v;
      }
    }

    await serverSaveSetting(key, value);
    // ISR 캐시 무효화: 해당 설정 키 태그
    revalidateTag(`setting:${key}`);
    // 사이트 표시에 영향 주는 설정 변경 시 전체 캐시 무효화
    const LAYOUT_KEYS = ["cp-seo-settings", "cp-site-settings", "cp-sns-settings", "cp-ads-global"];
    const PAGE_KEYS = ["cp-ads", "cp-categories", "cp-menus", "cp-site-type", "cp-popups", "cp-headline-articles", "cp-comment-settings", "cp-banner-settings"];
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
