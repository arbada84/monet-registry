import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";

const ADMIN_COOKIE = "cp-admin-auth";

/** 상수 시간 문자열 비교 — 타이밍 공격 방어 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 완전 공개 경로
const PUBLIC_PATHS = [
  "/admin/login",
  "/api/health",
  "/api/auth/hash",
  "/api/auth/me",
  "/api/auth/login",
  "/api/v1/badge",
  "/api/rss",          // RSS 피드 공개
];

// GET만 공개 허용하는 경로 (쓰기는 인증 필요)
const PUBLIC_GET_PATHS = [
  "/api/db/settings",   // 사이트 설정 읽기 (헤드라인, 메뉴 등 공개 데이터)
  "/api/db/comments",   // 승인된 댓글 목록 공개
];

/** 쿠키 값이 유효한지 확인 (HMAC 서명 검증) — 예외 시 반드시 false 반환 */
async function isAuthenticated(request: NextRequest): Promise<boolean> {
  try {
    const cookie = request.cookies.get(ADMIN_COOKIE);
    const result = await verifyAuthToken(cookie?.value ?? "");
    return result.valid;
  } catch {
    return false; // 검증 실패는 항상 미인증으로 처리
  }
}

function withPathname(pathname: string): NextResponse {
  const res = NextResponse.next();
  res.headers.set("x-pathname", pathname);
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const httpMethod = request.method;

  // 완전 공개 경로 허용
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return withPathname(pathname);
  }

  // 댓글 POST(등록)는 로그인 없이 허용 (pending 상태로 저장됨)
  // ※ PUBLIC_GET_PATHS 보다 먼저 확인해야 함 (/api/db/comments가 해당 경로이므로)
  if (pathname === "/api/db/comments" && httpMethod === "POST") {
    return withPathname(pathname);
  }

  // GET만 공개 허용
  if (PUBLIC_GET_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (httpMethod === "GET") return withPathname(pathname);
    // GET 외 메서드는 인증 필요
    if (!await isAuthenticated(request)) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    return withPathname(pathname);
  }

  // 뉴스레터 구독 POST는 공개
  if (pathname === "/api/db/newsletter" && httpMethod === "POST") {
    return withPathname(pathname);
  }

  // 뉴스레터 구독 해제 GET은 공개 (token 기반)
  if (pathname === "/api/newsletter/unsubscribe" && httpMethod === "GET") {
    return withPathname(pathname);
  }

  // cron API: CRON_SECRET Bearer 또는 어드민 쿠키 허용
  if (pathname.startsWith("/api/cron")) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (cronSecret && authHeader?.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), cronSecret)) return withPathname(pathname);
    if (await isAuthenticated(request)) return withPathname(pathname);
    if (!cronSecret && process.env.NODE_ENV !== "production") return withPathname(pathname); // 개발환경에서만 허용
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // 기사 조회수 증가는 공개 (익명 방문자도 조회수 기록 가능)
  if (pathname === "/api/db/articles/views" && httpMethod === "POST") {
    return withPathname(pathname);
  }

  // 내부 DB API 보호
  if (pathname.startsWith("/api/db") || pathname.startsWith("/api/netpro") || pathname.startsWith("/api/ai") || pathname.startsWith("/api/upload") || pathname.startsWith("/api/newsletter") || pathname.startsWith("/api/admin") || pathname.startsWith("/api/seo")) {
    // Bearer CRON_SECRET도 허용 (서버간 내부 호출)
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (cronSecret && authHeader?.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), cronSecret)) return withPathname(pathname);
    if (!await isAuthenticated(request)) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다." },
        { status: 401 }
      );
    }
    return withPathname(pathname);
  }

  // 어드민 페이지 보호
  if (pathname.startsWith("/admin")) {
    if (!await isAuthenticated(request)) {
      const loginUrl = new URL("/admin/login", request.url);
      // Open Redirect 방지: /admin/* 경로만 허용
      if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
        loginUrl.searchParams.set("redirect", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
    return withPathname(pathname);
  }

  // API v1 Basic Auth (선택적 — 환경변수 설정 시 활성화)
  const user = process.env.API_BASIC_AUTH_USER;
  const password = process.env.API_BASIC_AUTH_PASSWORD;
  if (user && password && pathname.startsWith("/api/v1")) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Basic ")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="API v1"' },
      });
    }
    try {
      const decoded = atob(authHeader.slice(6));
      const colonIdx = decoded.indexOf(":");
      if (colonIdx === -1) throw new Error();
      const u = decoded.slice(0, colonIdx);
      const p = decoded.slice(colonIdx + 1);
      // 타이밍 공격 방지: 상수 시간 비교
      let diff = u.length ^ user.length;
      for (let i = 0; i < Math.max(u.length, user.length); i++) {
        diff |= (u.charCodeAt(i % (u.length || 1)) ?? 0) ^ (user.charCodeAt(i % (user.length || 1)) ?? 0);
      }
      for (let i = 0; i < Math.max(p.length, password.length); i++) {
        diff |= (p.charCodeAt(i % (p.length || 1)) ?? 0) ^ (password.charCodeAt(i % (password.length || 1)) ?? 0);
      }
      if (diff !== 0) throw new Error();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  return withPathname(pathname);
}

export const config = {
  matcher: [
    "/api/db/:path*", "/api/netpro/:path*", "/api/ai/:path*", "/api/upload/:path*",
    "/api/newsletter/:path*", "/api/cron/:path*", "/api/rss", "/api/v1/:path*",
    "/api/auth/:path*", "/api/admin/:path*", "/api/seo/:path*", "/admin/:path*",
    // 공개 페이지도 포함 (x-pathname 헤더 설정용)
    "/", "/article/:path*", "/category/:path*", "/reporter/:path*",
    "/tag/:path*", "/search", "/about", "/terms", "/contact",
  ],
};
