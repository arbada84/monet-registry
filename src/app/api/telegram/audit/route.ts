import { NextRequest, NextResponse } from "next/server";
import { serverGetSetting } from "@/lib/db-server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";

interface TelegramAuditEntry {
  id: string;
  action: string;
  chatId: string;
  status: string;
  summary: string;
  at: string;
  error?: string;
}

interface PendingTelegramAction {
  id: string;
  action: string;
  chatId: string;
  requestedAt: string;
  expiresAt: string;
  summary: string;
  payload?: Record<string, unknown>;
}

function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return "****";
  return `${chatId.slice(0, 2)}***${chatId.slice(-2)}`;
}

export async function GET(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 50), 1), 100);
  const [audit, pending] = await Promise.all([
    serverGetSetting<TelegramAuditEntry[]>("cp-telegram-command-audit", []),
    serverGetSetting<PendingTelegramAction[]>("cp-telegram-command-pending", []),
  ]);

  return NextResponse.json({
    success: true,
    audit: audit.slice(0, limit),
    pending: pending.slice(0, 20).map((item) => ({
      id: item.id,
      action: item.action,
      chatId: maskChatId(String(item.chatId || "")),
      requestedAt: item.requestedAt,
      expiresAt: item.expiresAt,
      summary: item.summary,
    })),
  });
}
