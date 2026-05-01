import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import { getTelegramStatus, getTelegramUpdatesForSetup } from "@/lib/telegram-notify";

function compactUpdate(update: unknown) {
  const data = update as {
    update_id?: number;
    message?: {
      date?: number;
      text?: string;
      chat?: { id?: number; type?: string; username?: string; first_name?: string; last_name?: string };
      from?: { id?: number; username?: string; first_name?: string; last_name?: string; is_bot?: boolean };
    };
  };
  const message = data.message;
  const chat = message?.chat;
  return {
    updateId: data.update_id,
    chatId: chat?.id,
    chatType: chat?.type,
    chatUsername: chat?.username,
    chatName: [chat?.first_name, chat?.last_name].filter(Boolean).join(" "),
    fromId: message?.from?.id,
    fromUsername: message?.from?.username,
    fromName: [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" "),
    fromIsBot: message?.from?.is_bot,
    textPreview: message?.text?.slice(0, 80),
    date: message?.date ? new Date(message.date * 1000).toISOString() : undefined,
  };
}

export async function GET(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const result = await getTelegramUpdatesForSetup();
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error, telegram: await getTelegramStatus() }, { status: 502 });
  }

  const updates = (result.updates || []).map(compactUpdate);
  const chatIds = [...new Set(updates.map((item) => item.chatId).filter(Boolean))];
  return NextResponse.json({
    success: true,
    telegram: await getTelegramStatus(),
    chatIds,
    updates,
  });
}
