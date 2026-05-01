import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import {
  getTelegramAdminSettingsView,
  saveTelegramAdminSettings,
  type TelegramAdminSettingsInput,
} from "@/lib/telegram-settings";
import { getTelegramStatus } from "@/lib/telegram-notify";

export async function GET(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const [settings, telegram] = await Promise.all([
    getTelegramAdminSettingsView(),
    getTelegramStatus(),
  ]);
  return NextResponse.json({ success: true, settings, telegram });
}

export async function PUT(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as TelegramAdminSettingsInput;
  await saveTelegramAdminSettings(body);

  const [settings, telegram] = await Promise.all([
    getTelegramAdminSettingsView(),
    getTelegramStatus(),
  ]);
  return NextResponse.json({ success: true, settings, telegram });
}
