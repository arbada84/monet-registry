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
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const [info, telegram, configuredWebhookUrl] = await Promise.all([
    getTelegramWebhookInfo(),
    getTelegramStatus(),
    buildTelegramWebhookUrl(),
  ]);
  return NextResponse.json({
    success: info.ok,
    telegram,
    configuredWebhookUrl,
    webhook: info.result,
    error: info.error,
  });
}

export async function POST(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { dropPendingUpdates?: boolean };
  const result = await setTelegramWebhook({ dropPendingUpdates: body.dropPendingUpdates === true });
  return NextResponse.json({
    success: result.ok,
    telegram: await getTelegramStatus(),
    webhookUrl: result.url,
    result: result.result,
    error: result.error,
  }, { status: result.ok ? 200 : 502 });
}

export async function DELETE(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { dropPendingUpdates?: boolean };
  const result = await deleteTelegramWebhook({ dropPendingUpdates: body.dropPendingUpdates === true });
  return NextResponse.json({
    success: result.ok,
    telegram: await getTelegramStatus(),
    result: result.result,
    error: result.error,
  }, { status: result.ok ? 200 : 502 });
}
