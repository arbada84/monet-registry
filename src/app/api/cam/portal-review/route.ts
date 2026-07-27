import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/cookie-auth";
import { serverGetFilteredArticles, serverGetSetting } from "@/lib/db-server";
import { getCanonicalUrl } from "@/lib/get-base-url";
import { buildPortalReviewReport, portalReviewToCsv } from "@/lib/portal-review";

interface SeoSettings {
  canonicalUrl?: string;
}

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function safeDateParam(value: string | null): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? value : null;
}

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format") === "csv" ? "csv" : "json";
    const months = positiveInt(searchParams.get("months"), 6, 60);
    const limit = positiveInt(searchParams.get("limit"), 10_000, 10_000);
    const from = safeDateParam(searchParams.get("from"));
    const to = safeDateParam(searchParams.get("to"));
    const statusParam = searchParams.get("status") || "게시";
    const status = statusParam === "전체" ? undefined : statusParam;

    const [seoSettings, { articles, total }] = await Promise.all([
      serverGetSetting<SeoSettings>("cp-seo-settings", {}),
      serverGetFilteredArticles({
        status,
        page: 1,
        limit,
        authed: true,
      }),
    ]);

    const baseUrl = getCanonicalUrl(seoSettings.canonicalUrl || request.nextUrl.origin);
    const report = buildPortalReviewReport(articles, {
      baseUrl,
      from,
      to,
      months: from ? null : months,
    });

    if (format === "csv") {
      const csv = portalReviewToCsv(report);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=UTF-8",
          "Content-Disposition": `attachment; filename="culturepeople-portal-review-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    return NextResponse.json({
      success: true,
      total,
      returned: articles.length,
      report,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: "검색 유입 운영 리포트를 생성하지 못했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
