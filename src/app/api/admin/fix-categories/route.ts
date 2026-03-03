/**
 * GET /api/admin/fix-categories
 * 슬러그(영문) 카테고리로 저장된 기사를 한글 카테고리명으로 일괄 수정
 */
import { NextResponse } from "next/server";
import { serverGetArticles, serverUpdateArticle } from "@/lib/db-server";
import { normalizeCategory } from "@/lib/constants";

export async function GET() {
  try {
    const articles = await serverGetArticles();
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
      total: articles.length,
      results,
    });
  } catch (e) {
    console.error("[fix-categories]", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
