/**
 * GET /api/admin/fix-categories
 * 슬러그(영문) 카테고리로 저장된 기사를 한글 카테고리명으로 일괄 수정
 */
import { NextRequest, NextResponse } from "next/server";
import { serverGetMaintenanceArticles, serverUpdateArticle } from "@/lib/db-server";
import { normalizeCategory } from "@/lib/constants";
import { isAuthenticated } from "@/lib/cookie-auth";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.max(1, Math.min(Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "300", 10) || 300, 500));
    const articles = await serverGetMaintenanceArticles({ page, limit });
    const results: { id: string; title: string; from: string; to: string }[] = [];

    for (const article of articles) {
      const normalized = normalizeCategory(article.category);
      if (normalized !== article.category) {
        await serverUpdateArticle(article.id, { category: normalized });
        results.push({ id: article.id, title: article.title, from: article.category, to: normalized });
      }
    }

    return NextResponse.json({
      success: true,
      changed: results.length,
      processed: articles.length,
      page,
      limit,
      hasMore: articles.length === limit,
      results,
    });
  } catch (e) {
    console.error("[fix-categories]", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
