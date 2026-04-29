import { NextRequest, NextResponse } from "next/server";
import { buildD1ReadCompareReport } from "@/lib/d1-read-compare";
import { isCronOrAdminRequest } from "@/lib/server-request-auth";

function csv(value: string | null): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function handler(request: NextRequest) {
  if (!await isCronOrAdminRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const report = await buildD1ReadCompareReport({
    limit: Number(params.get("limit") || 20),
    searchQuery: params.get("q") || "",
    settingKeys: csv(params.get("settings")),
    checks: csv(params.get("checks")),
    recentTitleDays: Number(params.get("recentTitleDays") || params.get("days") || 7),
  });

  return NextResponse.json({
    success: report.ok,
    report,
  }, { status: report.ok ? 200 : 503 });
}

export const maxDuration = 60;
export const GET = handler;
export const POST = handler;
