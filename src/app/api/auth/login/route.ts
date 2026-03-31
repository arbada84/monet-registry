import { NextRequest, NextResponse } from "next/server";
import { generateAuthToken, invalidateToken } from "@/lib/cookie-auth";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { redis } from "@/lib/redis";

const COOKIE_NAME = "cp-admin-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24시간

/** 타이밍 공격 방지용 상수 시간 문자열 비교 */
function timingSafeCompare(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  const len = Math.max(lenA, lenB);
  let diff = lenA ^ lenB;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i % lenA) ?? 0) ^ (b.charCodeAt(i % lenB) ?? 0);
  }
  return diff === 0;
}

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_S = 15 * 60; // 15분


function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function checkLoginRateLimit(ip: string): Promise<{ allowed: boolean; remainingMs?: number }> {
  if (!redis) return { allowed: true };
  try {
    const lockKey = `cp:login:lock:${ip}`;
    const ttl = await redis.ttl(lockKey);
    if (ttl > 0) return { allowed: false, remainingMs: ttl * 1000 };
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

async function recordFailure(ip: string): Promise<void> {
  if (!redis) return;
  try {
    const countKey = `cp:login:attempts:${ip}`;
    const lockKey = `cp:login:lock:${ip}`;
    const count = await redis.incr(countKey);
    await redis.expire(countKey, LOCK_DURATION_S);
    if (count >= MAX_ATTEMPTS) {
      await redis.set(lockKey, 1, { ex: LOCK_DURATION_S });
    }
  } catch { /* Redis 실패 시 무시 — 가용성 우선 */ }
}

async function clearAttempts(ip: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(`cp:login:attempts:${ip}`, `cp:login:lock:${ip}`);
  } catch { /* Redis 실패 시 무시 */ }
}

interface AccessLog {
  id: string; username: string; name: string; role: string;
  ip: string; userAgent: string; timestamp: string;
}

async function recordAccessLog(username: string, name: string, role: string, ip: string, userAgent: string) {
  try {
    const logs = await serverGetSetting<AccessLog[]>("cp-access-logs", []);
    logs.unshift({
      id: crypto.randomUUID(), username, name, role, ip,
      userAgent: userAgent.slice(0, 200),
      timestamp: new Date().toISOString(),
    });
    if (logs.length > 500) logs.length = 500;
    await serverSaveSetting("cp-access-logs", logs);
  } catch { /* 접속 로그 실패는 로그인 차단하지 않음 */ }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      const minutes = Math.max(1, Math.ceil((rateCheck.remainingMs ?? 0) / 60000));
      console.warn(`[security] 로그인 Rate Limit: ip=${ip.slice(0, 8)}***, lockMinutes=${minutes}`);
      return NextResponse.json(
        { success: false, error: `로그인 시도 횟수를 초과했습니다. ${minutes}분 후 다시 시도하세요.` },
        { status: 429 }
      );
    }

    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    // settings DB에서 계정 조회 (Supabase → MySQL → file-db)
    type Account = { id: string; username: string; password?: string; passwordHash?: string; name: string; role: string };
    let accounts: Account[] = [];
    let saveAccountsFn: (data: Account[]) => Promise<void> = async () => {};

    if (accounts.length === 0 && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
        accounts = await sbGetSetting<Account[]>("cp-admin-accounts", [], true); // SERVICE_KEY로 RLS 우회
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
      // 타이밍 공격 방지: 상수 시간 비교
      const idMatch = envAdminId ? timingSafeCompare(username, envAdminId) : false;
      const pwMatch = envAdminPw ? timingSafeCompare(password, envAdminPw) : false;
      if (envAdminId && envAdminPw && idMatch && pwMatch) {
        await clearAttempts(ip);
        const ua = req.headers.get("user-agent") || "";
        void recordAccessLog(username, "관리자", "superadmin", ip, ua);
        const tokenValue = await generateAuthToken("관리자", "superadmin");
        const response = NextResponse.json({ success: true, name: "관리자", role: "superadmin" });
        response.cookies.set(COOKIE_NAME, tokenValue, {
          httpOnly: true, secure: process.env.NODE_ENV === "production",
          sameSite: "lax", maxAge: COOKIE_MAX_AGE, path: "/",
        });
        return response;
      }
      return NextResponse.json({ success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
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
      // 타이밍 공격 방지: 상수 시간 비교
      matched = timingSafeCompare(account.password, password);
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
    const ua = req.headers.get("user-agent") || "";
    void recordAccessLog(account.username, displayName, account.role || "admin", ip, ua);
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

export async function DELETE(req: NextRequest) {
  // 서버 측 토큰 무효화 (블랙리스트 등록)
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) await invalidateToken(token);

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
