import { NextRequest, NextResponse } from "next/server";
import { serverGetMaintenanceArticles, serverUpdateArticle } from "@/lib/db-server";
import { isAuthenticated } from "@/lib/cookie-auth";

/** 본문 첫 번째 이미지 블록 제거 */
function removeFirstImage(html: string): { html: string; removed: string | null } {
  // <p><img ...></p> 패턴
  const pImgMatch = html.match(/<p>\s*(<img[^>]*>)\s*<\/p>/i);
  if (pImgMatch) {
    return {
      html: html.replace(pImgMatch[0], "").trim(),
      removed: pImgMatch[1],
    };
  }
  // <figure><img ...></figure> 패턴
  const figMatch = html.match(/<figure[^>]*>\s*<img[^>]*>[\s\S]*?<\/figure>/i);
  if (figMatch) {
    return {
      html: html.replace(figMatch[0], "").trim(),
      removed: figMatch[0],
    };
  }
  return { html, removed: null };
}

/** 썸네일 URL과 본문 첫 이미지 src가 같은지 비교 */
function firstImageMatchesThumbnail(html: string, thumbnail: string): boolean {
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  if (!match) return false;
  const src = match[1];
  // 완전 일치 또는 파일명 일치 (Supabase 재업로드 후 경로가 다를 수 있음)
  if (src === thumbnail) return true;
  const srcFile = src.split("/").pop()?.split("?")[0] ?? "";
  const thumbFile = thumbnail.split("/").pop()?.split("?")[0] ?? "";
  return srcFile.length > 8 && srcFile === thumbFile;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const today = new Date().toISOString().slice(0, 10); // 2026-03-06
    const page = Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.max(1, Math.min(Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10) || 200, 500));
    const articles = await serverGetMaintenanceArticles({ since: today, page, limit, includeBody: true });

    // 오늘 생성된 기사 중 썸네일 있는 것만
    const targets = articles.filter((a) => {
      const createdDate = (a.updatedAt ?? a.date ?? "").slice(0, 10);
      return createdDate === today && a.thumbnail && a.body;
    });

    const results: { id: string; title: string; status: "fixed" | "skipped" | "no_match" }[] = [];

    for (const article of targets) {
      const body = article.body ?? "";
      const thumbnail = article.thumbnail ?? "";

      // 본문 첫 이미지가 썸네일과 같으면 제거
      if (firstImageMatchesThumbnail(body, thumbnail)) {
        const { html: newBody } = removeFirstImage(body);
        if (newBody !== body) {
          await serverUpdateArticle(article.id, { body: newBody });
          results.push({ id: article.id, title: article.title, status: "fixed" });
          continue;
        }
      }

      // 썸네일 일치 여부 무관하게 첫 이미지가 있으면 제거 (오늘 MD 업로드 기사는 모두 해당)
      const { html: newBody, removed } = removeFirstImage(body);
      if (removed) {
        await serverUpdateArticle(article.id, { body: newBody });
        results.push({ id: article.id, title: article.title, status: "fixed" });
      } else {
        results.push({ id: article.id, title: article.title, status: "no_match" });
      }
    }

    return NextResponse.json({
      success: true,
      scanned: articles.length,
      total: targets.length,
      fixed: results.filter((r) => r.status === "fixed").length,
      page,
      limit,
      hasMore: articles.length === limit,
      results,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
