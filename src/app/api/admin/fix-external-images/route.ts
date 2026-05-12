/**
 * 기사 외부 이미지 Supabase 재업로드 수정 API
 * POST /api/admin/fix-external-images
 * Body: { since?: "YYYY-MM-DD" }   (기본: 전체 기사)
 *
 * - 기사 본문 및 썸네일의 외부(비 Supabase) 이미지 URL을 Supabase Storage에 업로드
 * - HTML 페이지 URL → og:image 자동 추출
 * - 직접 fetch 실패 → weserv.nl 프록시 폴백
 * - 한 번에 최대 200개 기사 처리
 */
import { NextRequest, NextResponse } from "next/server";
import { serverGetMaintenanceArticles, serverUpdateArticle } from "@/lib/db-server";
import { serverUploadImageUrl, isOwnUrl, isSafeExternalUrl, serverMigrateBodyImages } from "@/lib/server-upload-image";
import { isAuthenticated } from "@/lib/cookie-auth";

/** HTML에서 외부 img src 수집 */
function extractExternalImgUrls(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/gi)) {
    if (!isOwnUrl(m[1]) && isSafeExternalUrl(m[1])) set.add(m[1]);
  }
  return [...set];
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const since: string | undefined = body.since; // "YYYY-MM-DD"
    const page = Math.max(1, Number.parseInt(String(body.page ?? "1"), 10) || 1);
    const limit = Math.max(1, Math.min(Number.parseInt(String(body.limit ?? "200"), 10) || 200, 200));

    const all = await serverGetMaintenanceArticles({ since, page, limit, includeBody: true });

    // 대상 필터: DB에서 since/page/limit으로 먼저 작업 범위를 제한한다.
    const targets = all.filter((a) => {
      const hasExtBody = extractExternalImgUrls(a.body ?? "").length > 0;
      const hasExtThumb = a.thumbnail && !isOwnUrl(a.thumbnail) && isSafeExternalUrl(a.thumbnail);
      return hasExtBody || hasExtThumb;
    });

    const results: {
      id: string; title: string;
      bodyFixed: number; thumbFixed: boolean; skipped?: boolean;
    }[] = [];

    let totalImgFixed = 0;

    for (const article of targets) {
      let bodyHtml = article.body ?? "";
      let thumbnail = article.thumbnail ?? "";
      let bodyChanged = false;
      let thumbChanged = false;

      // ── 본문 이미지 처리 (공유 유틸 사용: og:image 추출 + 프록시 폴백) ──
      const extUrlsBefore = extractExternalImgUrls(bodyHtml);
      if (extUrlsBefore.length > 0) {
        const newBody = await serverMigrateBodyImages(bodyHtml);
        if (newBody !== bodyHtml) {
          bodyHtml = newBody;
          bodyChanged = true;
          const extUrlsAfter = extractExternalImgUrls(bodyHtml);
          totalImgFixed += extUrlsBefore.length - extUrlsAfter.length;
        }
      }

      // ── 썸네일 처리 (og:image 추출 + 프록시 폴백) ──
      if (thumbnail && !isOwnUrl(thumbnail) && isSafeExternalUrl(thumbnail)) {
        const newThumb = await serverUploadImageUrl(thumbnail);
        if (newThumb && newThumb !== thumbnail) {
          thumbnail = newThumb;
          thumbChanged = true;
        }
      }

      if (bodyChanged || thumbChanged) {
        await serverUpdateArticle(article.id, {
          ...(bodyChanged ? { body: bodyHtml } : {}),
          ...(thumbChanged ? { thumbnail } : {}),
        });
        results.push({
          id: article.id,
          title: article.title,
          bodyFixed: extUrlsBefore.length,
          thumbFixed: thumbChanged,
        });
      } else {
        results.push({
          id: article.id,
          title: article.title,
          bodyFixed: 0,
          thumbFixed: false,
          skipped: true,
        });
      }
    }

    return NextResponse.json({
      success: true,
      scanned: all.length,
      total: targets.length,
      articlesFixed: results.filter((r) => !r.skipped).length,
      imagesMigrated: totalImgFixed,
      page,
      limit,
      hasMore: all.length === limit,
      results,
    });
  } catch (e) {
    console.error("[fix-external-images]", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
