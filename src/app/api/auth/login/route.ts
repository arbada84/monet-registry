import { NextRequest, NextResponse } from "next/server";
import { generateAuthToken } from "@/lib/cookie-auth";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { Redis } from "@upstash/redis";

const COOKIE_NAME = "cp-admin-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24시간

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_S = 15 * 60; // 15분

// ── Redis 기반 Rate Limiting (Upstash) ────────────────────
// Redis가 없으면 인메모리 폴백 (로컬 개발용)
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// 인메모리 폴백 (로컬 개발 / Redis 없을 때)
const memAttempts = new Map<string, { count: number; lockedUntil: number }>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remainingMs?: number }> {
  if (redis) {
    const lockKey = `cp:login:lock:${ip}`;
    const ttl = await redis.ttl(lockKey);
    if (ttl > 0) return { allowed: false, remainingMs: ttl * 1000 };
    return { allowed: true };
  }
  // 인메모리 폴백
  const now = Date.now();
  const entry = memAttempts.get(ip);
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    return { allowed: false, remainingMs: entry.lockedUntil - now };
  }
  return { allowed: true };
}

async function recordFailure(ip: string): Promise<void> {
  if (redis) {
    const countKey = `cp:login:attempts:${ip}`;
    const lockKey  = `cp:login:lock:${ip}`;
    const count = await redis.incr(countKey);
    await redis.expire(countKey, LOCK_DURATION_S);
    if (count >= MAX_ATTEMPTS) {
      await redis.set(lockKey, 1, { ex: LOCK_DURATION_S });
    }
    return;
  }
  // 인메모리 폴백
  const now = Date.now();
  const entry = memAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  const newCount = entry.count + 1;
  memAttempts.set(ip, {
    count: newCount,
    lockedUntil: newCount >= MAX_ATTEMPTS ? now + LOCK_DURATION_S * 1000 : 0,
  });
}

async function clearAttempts(ip: string): Promise<void> {
  if (redis) {
    await redis.del(`cp:login:attempts:${ip}`, `cp:login:lock:${ip}`);
    return;
  }
  memAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(ip);
    if (!rateCheck.allowed) {
      const minutes = Math.max(1, Math.ceil((rateCheck.remainingMs ?? 0) / 60000));
      return NextResponse.json(
        { success: false, error: `로그인 시도 횟수를 초과했습니다. ${minutes}분 후 다시 시도하세요.` },
        { status: 429 }
      );
    }

    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    // settings DB에서 계정 조회 (PHP API → Supabase → MySQL → file-db)
    type Account = { id: string; username: string; password?: string; passwordHash?: string; name: string; role: string };
    let accounts: Account[] = [];
    let saveAccountsFn: (data: Account[]) => Promise<void> = async () => {};

    if (process.env.PHP_API_URL) {
      try {
        const { dbGetSetting, dbSaveSetting } = await import("@/lib/php-api-db");
        accounts = await dbGetSetting<Account[]>("cp-admin-accounts", []);
        saveAccountsFn = (data) => dbSaveSetting("cp-admin-accounts", data);
      } catch { /* 폴백 */ }
    }
    if (accounts.length === 0 && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
        accounts = await sbGetSetting<Account[]>("cp-admin-accounts", []);
        saveAccountsFn = (data) => sbSaveSetting("cp-admin-accounts", data);
      } catch { /* 폴백 */ }
    }
    if (accounts.length === 0 && process.env.MYSQL_DATABASE) {
      try {
        const { dbGetSetting, dbSaveSetting } = await import("@/lib/mysql-db");
        accounts = await dbGetSetting<Account[]>("cp-admin-accounts", []);
        saveAccountsFn = (data) => dbSaveSetting("cp-admin-accounts", data);
      } catch { /* 폴백 */ }
    }
    if (accounts.length === 0) {
      const { fileGetSetting, fileSaveSetting } = await import("@/lib/file-db");
      accounts = fileGetSetting<Account[]>("cp-admin-accounts", []);
      saveAccountsFn = async (data) => fileSaveSetting("cp-admin-accounts", data);
    }

    // 비상 관리자: DB 계정이 없을 때 환경변수로 로그인
    if (accounts.length === 0) {
      const envAdminId = process.env.ADMIN_USERNAME;
      const envAdminPw = process.env.ADMIN_PASSWORD;
      if (envAdminId && envAdminPw && username === envAdminId && password === envAdminPw) {
        await clearAttempts(ip);
        const tokenValue = await generateAuthToken("관리자", "superadmin");
        const response = NextResponse.json({ success: true, name: "관리자", role: "superadmin" });
        response.cookies.set(COOKIE_NAME, tokenValue, {
          httpOnly: true, secure: process.env.NODE_ENV === "production",
          sameSite: "lax", maxAge: COOKIE_MAX_AGE, path: "/",
        });
        return response;
      }
      return NextResponse.json({ success: false, error: "등록된 계정이 없습니다. 관리자 계정 관리 페이지에서 계정을 생성해주세요." }, { status: 401 });
    }

    const account = accounts.find((a) => a.username === username);
    if (!account) {
      await recordFailure(ip);
      return NextResponse.json({ success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    let matched = false;
    if (account.passwordHash) {
      matched = await verifyPassword(password, account.passwordHash);
    } else if (account.password) {
      matched = account.password === password;
      if (matched) {
        const hash = await hashPassword(password);
        const updated = accounts.map((a) =>
          a.id === account.id ? { ...a, password: undefined, passwordHash: hash } : a
        );
        await saveAccountsFn(updated);
      }
    }

    if (!matched) {
      await recordFailure(ip);
      return NextResponse.json({ success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    await clearAttempts(ip);

    // 마지막 로그인 시각 업데이트
    const updatedAccounts = accounts.map((a) =>
      a.id === account.id ? { ...a, lastLogin: new Date().toISOString() } : a
    );
    await saveAccountsFn(updatedAccounts);

    const displayName = account.name || account.username;
    const tokenValue = await generateAuthToken(displayName, account.role || "admin");
    const response = NextResponse.json({ success: true, name: displayName, role: account.role });
    response.cookies.set(COOKIE_NAME, tokenValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (e) {
    console.error("[Auth] Login error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
