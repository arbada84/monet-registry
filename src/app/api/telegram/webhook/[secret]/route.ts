import { NextRequest, NextResponse } from "next/server";
import { buildTelegramCommandResponse } from "@/lib/telegram-commands";
import { isAllowedTelegramChatId, sendTelegramMessage } from "@/lib/telegram-notify";

interface TelegramWebhookUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
  };
}

interface RouteContext {
  params: Promise<{ secret: string }>;
}

async function getSecret(context: RouteContext): Promise<string> {
  const params = await context.params;
  return params.secret;
}

function isValidWebhookSecret(request: NextRequest, secret: string): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || secret !== expected) return false;

  const expectedHeader = process.env.TELEGRAM_WEBHOOK_HEADER_SECRET;
  if (!expectedHeader) return true;
  return request.headers.get("x-telegram-bot-api-secret-token") === expectedHeader;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const secret = await getSecret(context);
  if (!isValidWebhookSecret(request, secret)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const update = await request.json().catch(() => null) as TelegramWebhookUpdate | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text || "";

  if (!chatId || !text.trim()) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!isAllowedTelegramChatId(chatId)) {
    console.warn(`[telegram] rejected unauthorized chat id: ${String(chatId).slice(0, 4)}***`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const responseText = await buildTelegramCommandResponse(text, String(chatId));
  const sent = await sendTelegramMessage({
    text: responseText,
    chatIds: [String(chatId)],
    disableWebPagePreview: true,
  });

  return NextResponse.json({ ok: true, sent });
}
