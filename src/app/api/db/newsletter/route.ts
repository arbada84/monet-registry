import { NextRequest, NextResponse } from "next/server";

interface Subscriber {
  id: string;
  email: string;
  name: string;
  subscribedAt: string;
  status: "active" | "unsubscribed";
  token?: string;
}

async function getDB() {
  if (process.env.PHP_API_URL) {
    const { dbGetSetting, dbSaveSetting } = await import("@/lib/php-api-db");
    return { dbGetSetting, dbSaveSetting };
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
    return { dbGetSetting: sbGetSetting, dbSaveSetting: sbSaveSetting };
  }
  if (process.env.MYSQL_DATABASE) {
    const { dbGetSetting, dbSaveSetting } = await import("@/lib/mysql-db");
    return { dbGetSetting, dbSaveSetting };
  }
  const { fileGetSetting, fileSaveSetting } = await import("@/lib/file-db");
  return { dbGetSetting: fileGetSetting, dbSaveSetting: fileSaveSetting };
}

// GET /api/db/newsletter → 구독자 목록 (어드민용) — token 없는 구독자는 자동 생성
export async function GET() {
  try {
    const { dbGetSetting, dbSaveSetting } = await getDB();
    const subscribers = await dbGetSetting<Subscriber[]>("cp-newsletter-subscribers", []);

    // token 없는 구독자에게 token 자동 생성
    let needsSave = false;
    const withTokens = subscribers.map((s) => {
      if (!s.token) {
        needsSave = true;
        return { ...s, token: crypto.randomUUID() };
      }
      return s;
    });

    if (needsSave) {
      await dbSaveSetting("cp-newsletter-subscribers", withTokens);
    }

    return NextResponse.json({ success: true, subscribers: withTokens });
  } catch (e) {
    console.error("[DB] GET newsletter error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/newsletter { email, name? } → 구독 등록
export async function POST(request: NextRequest) {
  try {
    const { dbGetSetting, dbSaveSetting } = await getDB();
    const { email, name = "" } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "올바른 이메일 주소를 입력하세요." }, { status: 400 });
    }

    const all = await dbGetSetting<Subscriber[]>("cp-newsletter-subscribers", []);

    // 구독자 수 제한
    if (all.length >= 10000) {
      return NextResponse.json({ success: false, error: "구독자 한도에 달했습니다." }, { status: 400 });
    }

    // 이미 활성 구독 중인 경우 성공으로 처리
    if (all.find((s) => s.email === email)) {
      if (all.some((s) => s.email === email && s.status === "active")) {
        return NextResponse.json({ success: true, message: "이미 구독 중입니다." });
      }
      // 기존에 unsubscribed였으면 재활성화
      const updated = all.map((s) => s.email === email ? { ...s, status: "active" as const } : s);
      await dbSaveSetting("cp-newsletter-subscribers", updated);
    } else {
      all.push({
        id: Date.now().toString(),
        email,
        name,
        subscribedAt: new Date().toISOString().slice(0, 10),
        status: "active",
        token: crypto.randomUUID(),
      });
      await dbSaveSetting("cp-newsletter-subscribers", all);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST newsletter error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/newsletter?email=xxx → 구독 취소
export async function DELETE(request: NextRequest) {
  try {
    const { dbGetSetting, dbSaveSetting } = await getDB();
    const email = request.nextUrl.searchParams.get("email");
    if (!email) return NextResponse.json({ success: false, error: "email required" }, { status: 400 });
    const subs = await dbGetSetting<Subscriber[]>("cp-newsletter-subscribers", []);
    const updated = subs.map((s) => s.email === email ? { ...s, status: "unsubscribed" as const } : s);
    await dbSaveSetting("cp-newsletter-subscribers", updated);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE newsletter error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
