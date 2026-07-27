import { NextRequest, NextResponse } from "next/server";
import { authorizePolicyRead, policyApiError } from "@/lib/auto-press-policy-api";
import { getPolicyDryAuditReport } from "@/lib/auto-press-policy-audit-service";

const REPORT_ID = /^report-[A-Za-z0-9-]{8,80}$/;

function csvCell(value: unknown): string {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ reportId: string }> }) {
  const authorized = await authorizePolicyRead(request, "dry-run");
  if (authorized.error) return authorized.error;
  try {
    const { reportId } = await context.params;
    if (!REPORT_ID.test(reportId)) {
      return NextResponse.json({ success: false, error: "잘못된 report ID입니다." }, { status: 400 });
    }
    const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
    const first = await getPolicyDryAuditReport(reportId, 100, 0);
    const results = [...first.results] as Array<Record<string, unknown>>;
    for (let offset = 100; offset < first.report.resultCount && offset < 500; offset += 100) {
      const page = await getPolicyDryAuditReport(reportId, 100, offset);
      results.push(...page.results as Array<Record<string, unknown>>);
    }
    const headers = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="auto-press-policy-${reportId}.${format}"`,
      "X-Content-Type-Options": "nosniff",
    };
    if (format === "json") {
      return new NextResponse(JSON.stringify({ report: first.report, results }, null, 2), {
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
      });
    }
    const columns = [
      "ordinal", "store", "record_id", "article_no", "title", "classification",
      "subject_id", "match_type", "matched_field", "snippet", "created_at",
    ];
    const csv = [
      columns.map(csvCell).join(","),
      ...results.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
    ].join("\r\n");
    return new NextResponse(`\uFEFF${csv}`, {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch (error) {
    return policyApiError(error);
  }
}
