import { NextRequest, NextResponse } from "next/server";
import { generateAuthToken } from "@/lib/cookie-auth";

const COOKIE_NAME = "cp-admin-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24시간

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (process.env.PASSWORD_SALT || "cp-salt-2024"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === storedHash;
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    // settings DB에서 계정 조회 (PHP API → MySQL → file-db 우선순위)
    const { serverGetSetting, serverSaveSetting } = await import("@/lib/db-server");
    const accounts = await serverGetSetting<
      { id: string; username: string; password?: string; passwordHash?: string; name: string; role: string }[]
    >("cp-admin-accounts", []);

    if (accounts.length === 0) {
      return NextResponse.json({ success: false, error: "등록된 계정이 없습니다. 관리자 계정 관리 페이지에서 계정을 생성해주세요." }, { status: 401 });
    }

    const account = accounts.find((a) => a.username === username);
    if (!account) {
      return NextResponse.json({ success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    let matched = false;
    if (account.passwordHash) {
      matched = await verifyPassword(password, account.passwordHash);
    } else if (account.password) {
      matched = account.password === password;
      // 평문 비밀번호를 해시로 자동 업그레이드
      if (matched) {
        const hash = await hashPassword(password);
        const updated = accounts.map((a) =>
          a.id === account.id ? { ...a, password: undefined, passwordHash: hash } : a
        );
        await serverSaveSetting("cp-admin-accounts", updated);
      }
    }

    if (!matched) {
      return NextResponse.json({ success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    // 마지막 로그인 시각 업데이트
    const updatedAccounts = accounts.map((a) =>
      a.id === account.id ? { ...a, lastLogin: new Date().toISOString() } : a
    );
    await serverSaveSetting("cp-admin-accounts", updatedAccounts);

    // HttpOnly 쿠키 설정
    const tokenValue = await generateAuthToken();
    const response = NextResponse.json({
      success: true,
      name: account.name || account.username,
      role: account.role,
    });
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
