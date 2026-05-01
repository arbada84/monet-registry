import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import { escapeTelegramHtml, getTelegramStatus, sendTelegramMessage } from "@/lib/telegram-notify";

export async function GET(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json({ success: true, telegram: getTelegramStatus() });
}

export async function POST(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" && body.text.trim()
    ? body.text.trim().slice(0, 500)
    : "컬처피플 텔레그램 알림 테스트입니다.";

  const sent = await sendTelegramMessage({
    text: `<b>[TEST]</b> ${escapeTelegramHtml(text)}`,
    level: "info",
  });

  return NextResponse.json({ success: true, sent, telegram: getTelegramStatus() });
}
