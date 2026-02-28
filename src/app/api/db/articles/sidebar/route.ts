import { NextRequest, NextResponse } from "next/server";
import { serverGetArticles } from "@/lib/db-server";

// GET /api/db/articles/sidebar?category=X&excludeId=X
// Returns top10 (by views) + related articles (same category) — lightweight
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const category = sp.get("category") || "";
    const excludeId = sp.get("excludeId") || "";

    const allArticles = await serverGetArticles();
    const published = allArticles.filter((a) => a.status === "게시");

    const top10 = [...published]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 10)
      .map((a) => ({ id: a.id, title: a.title, views: a.views || 0 }));

    const related = category
      ? published
          .filter((a) => a.category === category && a.id !== excludeId)
          .slice(0, 5)
          .map((a) => ({ id: a.id, title: a.title, category: a.category }))
      : [];

    return NextResponse.json({ success: true, top10, related });
  } catch (e) {
    console.error("[sidebar] error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
