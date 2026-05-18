import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import { formatSupabaseRecoveryReportSection, getSupabaseRecoveryStatus } from "@/lib/supabase-recovery-status";
import { getTelegramStatus, sendTelegramMessage } from "@/lib/telegram-notify";

async function handler(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const shouldSend = params.get("send") === "1" || params.get("send") === "true";
  const requireStorage = params.get("requireStorage") === "1" || params.get("requireStorage") === "true";
  const report = await getSupabaseRecoveryStatus({ requireStorage });
  const text = formatSupabaseRecoveryReportSection(report);
  const sent = shouldSend
    ? await sendTelegramMessage({
      text,
      level: report.classification.restricted || !report.ok ? "warning" : "info",
      disableWebPagePreview: true,
    })
    : false;

  return NextResponse.json({
    success: true,
    sent,
    telegram: await getTelegramStatus(),
    report,
  });
}

export const maxDuration = 30;
export const GET = handler;
export const POST = handler;
