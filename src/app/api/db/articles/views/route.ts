import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { serverIncrementViews } from "@/lib/db-server";

// POST /api/db/articles/views { id }
export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await serverIncrementViews(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST views error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
