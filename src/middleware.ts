import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";

const ADMIN_COOKIE = "cp-admin-auth";

// ── CRON_SECRET Bearer 인증 Rate Limit (분당 30회) ──
const cronRateLimitMap = new Map<string, { count: number; ts: number }>();
function checkCronRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = cronRateLimitMap.get(ip);
  if (!entry || now - entry.ts > 60000) {
    cronRateLimitMap.set(ip, { count: 1, ts: now });
    // 메모리 누수 방지: 오래된 엔트리 정리
    if (cronRateLimitMap.size > 1000) {
      for (const [key, val] of cronRateLimitMap) {
        if (now - val.ts > 120000) cronRateLimitMap.delete(key);
      }
    }
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

// 완전 공개 경로
const PUBLIC_PATHS = [
  "/cam/login",
  "/api/health",
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

/** verifyAuthToken을 1회만 호출하여 인증 상태 + 역할을 동시에 반환 */
async function getAuthState(request: NextRequest): Promise<{ valid: boolean; role: string }> {
  try {
    const cookie = request.cookies.get(ADMIN_COOKIE);
    const result = await verifyAuthToken(cookie?.value ?? "");
    return { valid: result.valid, role: result.valid ? ((result as { role?: string }).role || "admin") : "" };
  } catch {
    return { valid: false, role: "" };
  }
}

// 기자(reporter)가 접근 가능한 /cam 경로
const REPORTER_ALLOWED_PATHS = ["/cam/login", "/cam/dashboard", "/cam/articles"];

function withPathname(pathname: string): NextResponse {
  const res = NextResponse.next();
  res.headers.set("x-pathname", pathname);
  return res;
}

// 차단 대상 크롤러 봇 (AI 학습, 무단 스크래핑)
// AI 학습용 + 스크래퍼 차단 (AI 검색 답변용 ChatGPT-User, PerplexityBot은 허용 → 유입 효과)
const BLOCKED_BOTS = /GPTBot|Google-Extended|CCBot|anthropic-ai|ClaudeBot|Claude-Web|cohere-ai|Bytespider|Applebot-Extended|Meta-ExternalAgent|SemrushBot|AhrefsBot|MJ12bot|DotBot|PetalBot|DataForSeoBot/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const httpMethod = request.method;

  // ── 악성 크롤러 차단 (robots.txt 무시하는 봇 대응) ──
  const ua = request.headers.get("user-agent") || "";
  if (BLOCKED_BOTS.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

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
    // GET 외 메서드는 인증 필요 (Bearer CRON_SECRET도 허용) + Rate Limit
    const cronSecret2 = process.env.CRON_SECRET;
    const authHeader2 = request.headers.get("authorization");
    if (cronSecret2 && authHeader2?.startsWith("Bearer ")) {
      const clientIp2 = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
      if (!checkCronRateLimit(clientIp2)) {
        return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
      }
      if (timingSafeEqual(authHeader2.slice(7), cronSecret2)) return withPathname(pathname);
    }
    if (!(await getAuthState(request)).valid) {
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
    if (cronSecret && authHeader?.startsWith("Bearer ")) {
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
      if (!checkCronRateLimit(clientIp)) {
        return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
      }
      if (timingSafeEqual(authHeader.slice(7), cronSecret)) return withPathname(pathname);
    }
    if ((await getAuthState(request)).valid) return withPathname(pathname);
    if (!cronSecret && process.env.NODE_ENV !== "production") return withPathname(pathname); // 개발환경에서만 허용
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // 기사 조회수 증가는 공개 (익명 방문자도 조회수 기록 가능)
  if (pathname === "/api/db/articles/views" && httpMethod === "POST") {
    return withPathname(pathname);
  }

  // 쿠팡 상품 검색은 공개 (클라이언트 컴포넌트에서 호출)
  if (pathname.startsWith("/api/coupang") && httpMethod === "GET") {
    return withPathname(pathname);
  }

  // 내부 DB API 보호
  if (pathname.startsWith("/api/db") || pathname.startsWith("/api/netpro") || pathname.startsWith("/api/ai") || pathname.startsWith("/api/upload") || pathname.startsWith("/api/newsletter") || pathname.startsWith("/api/cam") || pathname.startsWith("/api/seo") || pathname.startsWith("/api/admin") || pathname.startsWith("/api/mail")) {
    // Bearer CRON_SECRET도 허용 (서버간 내부 호출) + Rate Limit
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (cronSecret && authHeader?.startsWith("Bearer ")) {
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
      if (!checkCronRateLimit(clientIp)) {
        return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
      }
      if (timingSafeEqual(authHeader.slice(7), cronSecret)) return withPathname(pathname);
    }
    if (!(await getAuthState(request)).valid) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다." },
        { status: 401 }
      );
    }
    return withPathname(pathname);
  }

  // 어드민 페이지 보호
  if (pathname.startsWith("/cam")) {
    const authState = await getAuthState(request);
    if (!authState.valid) {
      const loginUrl = new URL("/cam/login", request.url);
      if (!pathname.startsWith("/cam/login")) {
        loginUrl.searchParams.set("redirect", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
    // 기자(reporter) 역할은 기사 관련 페이지만 접근 허용
    if (authState.role === "reporter") {
      const allowed = REPORTER_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
      if (!allowed && pathname !== "/cam") {
        return NextResponse.redirect(new URL("/cam/articles", request.url));
      }
    }
    return withPathname(pathname);
  }

  // API v1 Basic Auth (필수 — 환경변수 미설정 시 프로덕션에서 차단)
  if (pathname.startsWith("/api/v1")) {
    const user = process.env.API_BASIC_AUTH_USER;
    const password = process.env.API_BASIC_AUTH_PASSWORD;
    if (!user || !password) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ success: false, error: "API auth not configured" }, { status: 503 });
      }
      return withPathname(pathname); // 개발환경에서만 허용
    }
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
      // 타이밍 공격 방지: 공통 timingSafeEqual 사용
      if (!timingSafeEqual(u, user) || !timingSafeEqual(p, password)) throw new Error();
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
    "/api/auth/:path*", "/api/cam/:path*", "/api/seo/:path*", "/api/admin/:path*",
    "/api/coupang/:path*", "/api/mail/:path*", "/cam/:path*",
  ],
};
