import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import { getTelegramChatCandidates } from "@/lib/telegram-chat-candidates";
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

  const [result, candidates, telegram] = await Promise.all([
    getTelegramUpdatesForSetup(),
    getTelegramChatCandidates(),
    getTelegramStatus(),
  ]);

  const updates = result.ok ? (result.updates || []).map(compactUpdate) : [];
  const updateChatIds = updates.map((item) => item.chatId).filter(Boolean).map(String);
  const candidateChatIds = candidates.map((item) => item.chatId).filter(Boolean);
  const chatIds = [...new Set([...updateChatIds, ...candidateChatIds])];

  if (!result.ok && chatIds.length === 0) {
    return NextResponse.json({
      success: false,
      error: result.error,
      telegram,
      chatIds,
      updates,
      candidates,
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    telegram,
    chatIds,
    updates,
    candidates,
    warning: result.ok ? undefined : result.error,
  });
}
