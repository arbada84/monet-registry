import { NextRequest, NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { redis, checkRateLimit as redisCheckRateLimit } from "@/lib/redis";

// 간단한 인메모리 rate limiting (프로세스 재시작 시 초기화됨)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // 요청 수
const RATE_WINDOW = 60 * 1000; // 1분

async function checkHashRateLimit(ip: string): Promise<boolean> {
  // Redis 기반 Rate Limiting (서버리스 콜드스타트 후에도 유지)
  if (redis || process.env.NODE_ENV === "production") {
    return redisCheckRateLimit(ip, "cp:hash:rate:", RATE_LIMIT, 60, {
      failClosedInProduction: true,
      context: "auth-hash",
    });
  }
  // 인메모리 폴백 (개발환경용)
  const now = Date.now();
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // 인증 필수: 관리자만 해시 생성/검증 가능 (공개 시 비밀번호 사전 공격에 악용 가능)
  const { verifyAuthToken } = await import("@/lib/cookie-auth");
  const cookie = req.cookies.get("cp-admin-auth");
  const { valid } = await verifyAuthToken(cookie?.value ?? "");
  if (!valid) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!await checkHashRateLimit(ip)) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  let action: string, password: string, hash: string;
  try {
    ({ action, password, hash } = await req.json());
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (action === "hash") {
    if (!password) {
      return NextResponse.json({ error: "password required" }, { status: 400 });
    }
    const hashed = await hashPassword(password);
    return NextResponse.json({ hash: hashed });
  }

  if (action === "verify") {
    if (!password || !hash) {
      return NextResponse.json({ error: "password and hash required" }, { status: 400 });
    }
    const valid = await verifyPassword(password, hash);
    return NextResponse.json({ valid });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
