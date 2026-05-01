import { NextRequest, NextResponse } from "next/server";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";
import {
  buildCloudflareUsageSnapshotSql,
  formatCloudflareUsageReportSection,
  getCloudflareUsageReport,
} from "@/lib/cloudflare-usage-report";
import { getTelegramStatus, sendTelegramMessage } from "@/lib/telegram-notify";

async function handler(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const shouldSend = params.get("send") === "1" || params.get("send") === "true";
  const includeSql = params.get("sql") === "1" || params.get("sql") === "true";
  const report = await getCloudflareUsageReport(new Date(), { force: true });
  const text = formatCloudflareUsageReportSection(report);
  const sent = shouldSend
    ? await sendTelegramMessage({
      text,
      level: report.riskLevel === "critical" ? "critical" : report.riskLevel === "warning" ? "warning" : "info",
      disableWebPagePreview: true,
    })
    : false;

  return NextResponse.json({
    success: true,
    sent,
    telegram: await getTelegramStatus(),
    report,
    snapshotSql: includeSql ? buildCloudflareUsageSnapshotSql(report) : undefined,
  });
}

export const maxDuration = 30;
export const GET = handler;
export const POST = handler;
