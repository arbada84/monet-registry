import { NextRequest, NextResponse } from "next/server";
import { checkMediaStorageHealth, formatMediaStorageHealthSection } from "@/lib/media-storage-health";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import { getTelegramStatus, sendTelegramMessage } from "@/lib/telegram-notify";

async function handler(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const shouldSend = params.get("send") === "1" || params.get("send") === "true";
  const strict = params.get("strict") === "1" || params.get("strict") === "true";
  const remote = params.get("remote") !== "0" && params.get("remote") !== "false";
  const writeProbe = params.get("write") === "1" || params.get("write") === "true";
  const report = await checkMediaStorageHealth({ remote, writeProbe });
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
    telegram: await getTelegramStatus(),
    report,
  }, { status: strict && !report.ok ? 503 : 200 });
}

export const maxDuration = 45;
export const GET = handler;
export const POST = handler;
