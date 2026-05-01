import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import { sendTelegramDailyReport } from "@/lib/telegram-report";
import { getTelegramStatus } from "@/lib/telegram-notify";

async function handler(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const sent = await sendTelegramDailyReport();
  return NextResponse.json({
    success: true,
    sent,
    telegram: await getTelegramStatus(),
  });
}

export const maxDuration = 30;
export const GET = handler;
export const POST = handler;
