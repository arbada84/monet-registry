import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";

const SETTING_KEY = "cp-activity-logs";
const MAX_LOGS = 1000;

export interface ActivityLog {
  id: string;
  username: string;
  name: string;
  role: string;
  action: string;        // "기사 작성", "기사 수정", "기사 삭제", "설정 변경", "메뉴 접근" 등
  target?: string;        // 대상 (기사 제목, 설정 키 등)
  targetId?: string;      // 대상 ID
  detail?: string;        // 추가 설명
  ip: string;
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

// GET: 활동 로그 조회
export async function GET(request: NextRequest) {
  if (!await isAdmin(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }
  const logs = await serverGetSetting<ActivityLog[]>(SETTING_KEY, []);
  return NextResponse.json({ success: true, data: logs });
}

// POST: 활동 로그 기록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, name, role, action, target, targetId, detail } = body;
    if (!action) {
      return NextResponse.json({ success: false, error: "action required" }, { status: 400 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    const newLog: ActivityLog = {
      id: crypto.randomUUID(),
      username: username || "unknown",
      name: name || username || "unknown",
      role: role || "admin",
      action,
      target: target || undefined,
      targetId: targetId || undefined,
      detail: detail || undefined,
      ip,
      timestamp: new Date().toISOString(),
    };

    const logs = await serverGetSetting<ActivityLog[]>(SETTING_KEY, []);
    logs.unshift(newLog);
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
    await serverSaveSetting(SETTING_KEY, logs);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
