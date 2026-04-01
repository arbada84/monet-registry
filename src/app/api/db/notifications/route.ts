import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

async function checkAuth(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

function headers(prefer?: string): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

// GET /api/db/notifications
// ?unread=1 → { count: number }
// 기본 → { notifications: Notification[] }
export async function GET(req: NextRequest) {
  try {
    if (!(await checkAuth(req))) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const unread = searchParams.get("unread");

    if (unread === "1") {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/notifications?read=eq.false&select=id`,
        { headers: headers(), cache: "no-store" },
      );
      if (!res.ok) {
        return NextResponse.json({ count: 0 });
      }
      const rows = (await res.json()) as unknown[];
      return NextResponse.json({ count: rows.length });
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?order=created_at.desc&limit=50`,
      { headers: headers(), cache: "no-store" },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({ success: false, error: errText || "조회 실패" }, { status: 500 });
    }
    const notifications = (await res.json()) as Notification[];
    return NextResponse.json({ notifications });
  } catch (e) {
    console.error("[notifications] GET error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/notifications
// body: { type, title, message?, metadata? }
export async function POST(req: NextRequest) {
  try {
    if (!(await checkAuth(req))) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { type, title, message, metadata } = body as {
      type: string;
      title: string;
      message?: string;
      metadata?: Record<string, unknown>;
    };

    if (!type || !title) {
      return NextResponse.json({ success: false, error: "type과 title은 필수입니다." }, { status: 400 });
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: headers("return=minimal"),
      body: JSON.stringify({
        type,
        title,
        message: message || "",
        metadata: metadata || {},
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({ success: false, error: errText || "생성 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[notifications] POST error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PATCH /api/db/notifications
// body: { ids: string[] } 또는 { all: true }
export async function PATCH(req: NextRequest) {
  try {
    if (!(await checkAuth(req))) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { ids, all } = body as { ids?: string[]; all?: boolean };

    if (all) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/notifications?read=eq.false`,
        {
          method: "PATCH",
          headers: headers("return=minimal"),
          body: JSON.stringify({ read: true }),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return NextResponse.json({ success: false, error: errText || "업데이트 실패" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      for (const id of ids) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: headers("return=minimal"),
            body: JSON.stringify({ read: true }),
          },
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "ids 또는 all 파라미터가 필요합니다." }, { status: 400 });
  } catch (e) {
    console.error("[notifications] PATCH error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/notifications
export async function DELETE(req: NextRequest) {
  try {
    if (!(await checkAuth(req))) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?id=not.is.null`,
      {
        method: "DELETE",
        headers: headers("return=minimal"),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({ success: false, error: errText || "삭제 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[notifications] DELETE error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
