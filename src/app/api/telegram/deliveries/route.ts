import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import { getTelegramDeliveryLogs } from "@/lib/telegram-notify";

export async function GET(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 50), 1), 200);
  const deliveries = await getTelegramDeliveryLogs(limit);

  return NextResponse.json({
    success: true,
    deliveries,
  });
}
