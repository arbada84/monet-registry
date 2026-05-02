import "server-only";

import { readSiteSetting, writeSiteSetting } from "@/lib/site-settings-store";

const TELEGRAM_CHAT_CANDIDATES_KEY = "cp-telegram-chat-candidates";
const MAX_CANDIDATES = 30;

export interface TelegramChatCandidate {
  chatId: string;
  chatType?: string;
  chatUsername?: string;
  chatName?: string;
  fromId?: string;
  fromUsername?: string;
  fromName?: string;
  fromIsBot?: boolean;
  textPreview?: string;
  date?: string;
  seenAt: string;
}

interface TelegramCandidateUpdate {
  message?: {
    date?: number;
    text?: string;
    chat?: { id?: number | string; type?: string; username?: string; first_name?: string; last_name?: string; title?: string };
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string; is_bot?: boolean };
  };
}

function compactCandidate(update: unknown): TelegramChatCandidate | null {
  const data = update as TelegramCandidateUpdate;
  const message = data?.message;
  const chat = message?.chat;
  if (chat?.id === undefined || chat?.id === null) return null;

  return {
    chatId: String(chat.id),
    chatType: chat.type,
    chatUsername: chat.username,
    chatName: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" "),
    fromId: message?.from?.id === undefined || message?.from?.id === null ? undefined : String(message.from.id),
    fromUsername: message?.from?.username,
    fromName: [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" "),
    fromIsBot: message?.from?.is_bot,
    textPreview: message?.text?.slice(0, 80),
    date: message?.date ? new Date(message.date * 1000).toISOString() : undefined,
    seenAt: new Date().toISOString(),
  };
}

export async function getTelegramChatCandidates(limit = MAX_CANDIDATES): Promise<TelegramChatCandidate[]> {
  const stored = await readSiteSetting<TelegramChatCandidate[]>(TELEGRAM_CHAT_CANDIDATES_KEY, [], { useServiceKey: true });
  return Array.isArray(stored) ? stored.slice(0, limit) : [];
}

export async function recordTelegramChatCandidate(update: unknown): Promise<void> {
  const candidate = compactCandidate(update);
  if (!candidate) return;

  const current = await getTelegramChatCandidates(MAX_CANDIDATES);
  const next = [
    candidate,
    ...current.filter((item) => item.chatId !== candidate.chatId),
  ].slice(0, MAX_CANDIDATES);

  await writeSiteSetting(TELEGRAM_CHAT_CANDIDATES_KEY, next, { bestEffort: true });
}
