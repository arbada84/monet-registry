import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";

const ADMIN_COOKIE = "cp-admin-auth";

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

/** 쿠키 값이 유효한지 확인 (HMAC 서명 검증) */
async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get(ADMIN_COOKIE);
  return verifyAuthToken(cookie?.value ?? "");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const httpMethod = request.method;

  // 완전 공개 경로 허용
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // GET만 공개 허용
  if (PUBLIC_GET_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (httpMethod === "GET") return NextResponse.next();
    // GET 외 메서드는 인증 필요
    if (!await isAuthenticated(request)) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }
    return NextResponse.next();
  }

  // 댓글 POST(등록)는 로그인 없이 허용 (pending 상태로 저장됨)
  if (pathname === "/api/db/comments" && httpMethod === "POST") {
    return NextResponse.next();
  }

  // 뉴스레터 구독 POST는 공개
  if (pathname === "/api/db/newsletter" && httpMethod === "POST") {
    return NextResponse.next();
  }

  // 뉴스레터 구독 해제 GET은 공개 (token 기반)
  if (pathname === "/api/newsletter/unsubscribe" && httpMethod === "GET") {
    return NextResponse.next();
  }

  // cron API: CRON_SECRET Bearer 또는 어드민 쿠키 허용
  if (pathname.startsWith("/api/cron")) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) return NextResponse.next();
    if (await isAuthenticated(request)) return NextResponse.next();
    if (!cronSecret && process.env.NODE_ENV !== "production") return NextResponse.next(); // 개발환경에서만 허용
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // 기사 조회수 증가는 공개 (익명 방문자도 조회수 기록 가능)
  if (pathname === "/api/db/articles/views" && httpMethod === "POST") {
    return NextResponse.next();
  }

  // 내부 DB API 보호
  if (pathname.startsWith("/api/db") || pathname.startsWith("/api/netpro") || pathname.startsWith("/api/ai") || pathname.startsWith("/api/upload") || pathname.startsWith("/api/newsletter")) {
    if (!await isAuthenticated(request)) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다." },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }


  // 어드민 페이지 보호
  if (pathname.startsWith("/admin")) {
    if (!await isAuthenticated(request)) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
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
      const [u, p] = atob(authHeader.slice(6)).split(":");
      if (u !== user || p !== password) throw new Error();
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/db/:path*", "/api/netpro/:path*", "/api/ai/:path*", "/api/upload/:path*", "/api/newsletter/:path*", "/api/cron/:path*", "/api/rss", "/api/v1/:path*", "/api/auth/:path*", "/admin/:path*"],
};
