import { NextRequest, NextResponse } from "next/server";
import { checkMediaStorageHealth, formatMediaStorageHealthSection } from "@/lib/media-storage-health";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import { getTelegramStatus, sendTelegramMessage } from "@/lib/telegram-notify";

async function handler(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const shouldSend = params.get("send") === "1" || params.get("send") === "true";
  const strict = params.get("strict") === "1" || params.get("strict") === "true";
  const remote = params.get("remote") !== "0" && params.get("remote") !== "false";
  const report = await checkMediaStorageHealth({ remote });
  const sent = shouldSend
    ? await sendTelegramMessage({
      text: formatMediaStorageHealthSection(report),
      level: report.ok ? "info" : "warning",
      disableWebPagePreview: true,
    })
    : false;

  return NextResponse.json({
    success: true,
    ok: report.ok,
    sent,
    telegram: getTelegramStatus(),
    report,
  }, { status: strict && !report.ok ? 503 : 200 });
}

export const maxDuration = 30;
export const GET = handler;
export const POST = handler;
