import { NextRequest } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";

interface Subscriber {
  id: string;
  email: string;
  name: string;
  subscribedAt: string;
  status: "active" | "unsubscribed";
  token?: string;
}

// 레이트 리미팅: IP당 분당 최대 10회
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// GET /api/newsletter/unsubscribe?token=xxx
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>요청 제한</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2>요청이 너무 많습니다</h2>
  <p>잠시 후 다시 시도해주세요.</p>
</body></html>`,
      { status: 429, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "60" } }
    );
  }

  const token = request.nextUrl.searchParams.get("token");

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !UUID_RE.test(token)) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>구독 해제</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2>잘못된 요청</h2>
  <p>유효하지 않은 구독 해제 링크입니다.</p>
</body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const subs = await serverGetSetting<Subscriber[]>("cp-newsletter-subscribers", []);
    const updated = subs.map((s) =>
      s.token === token ? { ...s, status: "unsubscribed" as const } : s
    );

    const found = subs.some((s) => s.token === token && s.status === "active");

    if (!found) {
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>구독 해제</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2>이미 처리된 요청</h2>
  <p>이미 구독 해제되었거나 잘못된 링크입니다.</p>
</body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    await serverSaveSetting("cp-newsletter-subscribers", updated);

    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>구독 해제 완료</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2 style="color:#E8192C;">구독이 해제되었습니다.</h2>
  <p>더 이상 뉴스레터를 받지 않습니다.</p>
  <a href="/" style="display:inline-block;margin-top:20px;padding:10px 24px;background:#E8192C;color:#FFF;text-decoration:none;border-radius:6px;">홈으로 돌아가기</a>
</body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (e) {
    console.error("[newsletter/unsubscribe]", e);
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>오류</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#333;">
  <h2>서버 오류</h2>
  <p>잠시 후 다시 시도해주세요.</p>
</body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
