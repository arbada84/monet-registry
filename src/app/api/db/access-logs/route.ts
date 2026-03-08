import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";

const SETTING_KEY = "cp-access-logs";
const MAX_LOGS = 500;

export interface AccessLog {
  id: string;
  username: string;
  name: string;
  role: string;
  ip: string;
  userAgent: string;
  timestamp: string;
}

async function isAdmin(request: NextRequest): Promise<boolean> {
  try {
    const cookie = request.cookies.get("cp-admin-auth");
    const result = await verifyAuthToken(cookie?.value ?? "");
    if (result.valid) return true;
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (cronSecret && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token.length === cronSecret.length && token === cronSecret) return true;
    }
    return false;
  } catch { return false; }
}

// GET: 접속 로그 조회
export async function GET(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }
  const logs = await serverGetSetting<AccessLog[]>(SETTING_KEY, []);
  return NextResponse.json({ success: true, data: logs });
}

// POST: 접속 로그 기록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, name, role } = body;
    if (!username) {
      return NextResponse.json({ success: false, error: "username required" }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const newLog: AccessLog = {
      id: crypto.randomUUID(),
      username,
      name: name || username,
      role: role || "admin",
      ip,
      userAgent: userAgent.slice(0, 200),
      timestamp: new Date().toISOString(),
    };

    const logs = await serverGetSetting<AccessLog[]>(SETTING_KEY, []);
    logs.unshift(newLog);
    // 최대 500건 유지
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
    await serverSaveSetting(SETTING_KEY, logs);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
