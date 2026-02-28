import { NextRequest, NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/password-hash";

// 간단한 인메모리 rate limiting (프로세스 재시작 시 초기화됨)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // 요청 수
const RATE_WINDOW = 60 * 1000; // 1분

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
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
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  const { action, password, hash } = await req.json();

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
