import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import {
  buildTelegramWebhookUrl,
  deleteTelegramWebhook,
  getTelegramStatus,
  getTelegramWebhookInfo,
  setTelegramWebhook,
} from "@/lib/telegram-notify";

export async function GET(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const info = await getTelegramWebhookInfo();
  return NextResponse.json({
    success: info.ok,
    telegram: getTelegramStatus(),
    configuredWebhookUrl: buildTelegramWebhookUrl(),
    webhook: info.result,
    error: info.error,
  }, { status: info.ok ? 200 : 502 });
}

export async function POST(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { dropPendingUpdates?: boolean };
  const result = await setTelegramWebhook({ dropPendingUpdates: body.dropPendingUpdates === true });
  return NextResponse.json({
    success: result.ok,
    telegram: getTelegramStatus(),
    webhookUrl: result.url,
    result: result.result,
    error: result.error,
  }, { status: result.ok ? 200 : 502 });
}

export async function DELETE(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { dropPendingUpdates?: boolean };
  const result = await deleteTelegramWebhook({ dropPendingUpdates: body.dropPendingUpdates === true });
  return NextResponse.json({
    success: result.ok,
    telegram: getTelegramStatus(),
    result: result.result,
    error: result.error,
  }, { status: result.ok ? 200 : 502 });
}
