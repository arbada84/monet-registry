import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import {
  serverCountUnreadNotifications,
  serverCreateNotification,
  serverDeleteAllNotifications,
  serverGetNotifications,
  serverMarkNotificationsRead,
} from "@/lib/db-server";

async function checkAuth(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

// GET /api/db/notifications
export async function GET(req: NextRequest) {
  try {
    if (!(await checkAuth(req))) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get("unread") === "1") {
      const count = await serverCountUnreadNotifications();
      return NextResponse.json({ count });
    }

    const notifications = await serverGetNotifications(50);
    return NextResponse.json({ notifications });
  } catch (e) {
    console.error("[notifications] GET error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/notifications
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

    await serverCreateNotification({
      type,
      title,
      message: message || "",
      metadata: metadata || {},
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[notifications] POST error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PATCH /api/db/notifications
export async function PATCH(req: NextRequest) {
  try {
    if (!(await checkAuth(req))) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { ids, all } = body as { ids?: string[]; all?: boolean };

    if (all) {
      await serverMarkNotificationsRead({ all: true });
      return NextResponse.json({ success: true });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      await serverMarkNotificationsRead({ ids });
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

    await serverDeleteAllNotifications();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[notifications] DELETE error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
