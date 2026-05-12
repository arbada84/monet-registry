import { NextRequest, NextResponse } from "next/server";
import { serverGetFeedArticles, serverGetHomeArticles, serverGetTopArticles } from "@/lib/db-server";
import { parseTags } from "@/lib/html-utils";

// GET /api/db/articles/sidebar?category=X&excludeId=X&tags=tag1,tag2
// Returns top articles plus a bounded related-article list.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const category = sp.get("category") || "";
    const excludeId = sp.get("excludeId") || "";
    const tagsParam = sp.get("tags") || "";

    const topArticles = await serverGetTopArticles(10);
    const top10 = topArticles.map((a) => ({ id: a.id, no: a.no, title: a.title, views: a.views || 0 }));

    let related: { id: string; no?: number; title: string; category: string }[] = [];
    if (category || tagsParam) {
      const currentTags = tagsParam ? parseTags(tagsParam).map((t) => t.toLowerCase()) : [];
      const candidates = category
        ? await serverGetFeedArticles({ category, limit: 80 })
        : await serverGetHomeArticles(100);

      const scored = candidates
        .filter((a) => a.id !== excludeId)
        .map((a) => {
          let score = 0;
          if (category && a.category === category) score += 2;
          if (currentTags.length > 0 && a.tags) {
            const articleTags = parseTags(a.tags).map((t) => t.toLowerCase());
            score += currentTags.filter((t) => articleTags.includes(t)).length;
          }
          return { a, score };
        })
        .filter(({ score }) => score > 0)
        .sort((x, y) => y.score - x.score)
        .slice(0, 5);

      related = scored.map(({ a }) => ({ id: a.id, no: a.no, title: a.title, category: a.category }));
    }

    return NextResponse.json(
      { success: true, top10, related },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (e) {
    console.error("[sidebar] error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
