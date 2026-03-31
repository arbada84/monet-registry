import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serverGetScheduledArticles, serverUpdateArticle, serverGetArticleById, serverGetDeletedArticles, serverPurgeArticle, serverGetSetting } from "@/lib/db-server";
import { notifyNewsletterOnPublish } from "@/lib/newsletter-notify";
import { serverMigrateBodyImages, serverUploadImageUrl } from "@/lib/server-upload-image";
import { isAuthenticated, timingSafeEqual } from "@/lib/cookie-auth";
import { notifyIndexNow } from "@/lib/notify-search";

async function runPublish() {
  const toPublish = await serverGetScheduledArticles();

  for (const article of toPublish) {
    // 예약 발행 시 외부 이미지 Supabase 이관
    const full = await serverGetArticleById(article.id);
    let migratedBody = full?.body || article.body;
    let migratedThumb = full?.thumbnail || article.thumbnail;
    try {
      if (migratedBody) migratedBody = await serverMigrateBodyImages(migratedBody);
      if (migratedThumb && !/supabase|culturepeople\.co\.kr/.test(migratedThumb)) {
        migratedThumb = (await serverUploadImageUrl(migratedThumb)) ?? migratedThumb;
      }
    } catch (imgErr) {
      console.warn(`[Cron] 기사 ${article.id} 이미지 이관 실패 (발행은 계속):`, imgErr instanceof Error ? imgErr.message : imgErr);
    }

    await serverUpdateArticle(article.id, {
      status: "게시",
      body: migratedBody,
      thumbnail: migratedThumb,
      updatedAt: new Date().toISOString(),
    });
    // 발행 후 검색엔진 색인 요청 (기사번호 우선)
    void notifyIndexNow(article.no ?? article.id);
    // 발행 후 뉴스레터 발송 (autoSendOnPublish 설정 시)
    void notifyNewsletterOnPublish({ ...article, status: "게시" });
  }

  // ISR 캐시 무효화: 예약 발행 후 홈/카테고리/태그 페이지 갱신
  if (toPublish.length > 0) {
    revalidateTag("articles");
  }

  // 휴지통 자동 영구 삭제 (보관일 초과 기사 제거)
  let purged = 0;
  try {
    const trashSettings = await serverGetSetting<{ retentionDays?: number }>("cp-trash-settings", { retentionDays: 30 });
    const retentionDays = trashSettings.retentionDays ?? 30;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const deletedArticles = await serverGetDeletedArticles();
    for (const article of deletedArticles) {
      if (article.deletedAt && article.deletedAt < cutoff) {
        await serverPurgeArticle(article.id);
        purged++;
      }
    }
    if (purged > 0) revalidateTag("articles");
  } catch (e) {
    console.warn("[Cron] trash purge error:", e);
  }

  return {
    success: true,
    published: toPublish.length,
    purged,
    articles: toPublish.map((a) => ({ id: a.id, title: a.title })),
  };
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPublish();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[Cron] publish error:", e);
    return NextResponse.json({ success: false, error: "예약 발행 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// GET: CRON_SECRET 인증된 요청만 실행, 그 외 상태만 반환
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;

  // Vercel Cron 또는 외부 cron 서비스 (Bearer 토큰)
  if (cronSecret && authHeader.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), cronSecret)) {
    try {
      const result = await runPublish();
      return NextResponse.json(result);
    } catch (e) {
      console.error("[Cron] publish error:", e);
      return NextResponse.json({ success: false, error: "예약 발행 처리 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  // URL 파라미터로도 CRON_SECRET 전달 가능 (cron-job.org 등)
  const url = new URL(req.url);
  if (cronSecret && timingSafeEqual(url.searchParams.get("secret") ?? "", cronSecret)) {
    try {
      const result = await runPublish();
      return NextResponse.json(result);
    } catch (e) {
      console.error("[Cron] publish error:", e);
      return NextResponse.json({ success: false, error: "예약 발행 처리 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  // CRON_SECRET 없으면 상태만 반환
  return NextResponse.json({
    status: "ok",
    message: "Use POST to execute manually",
    enabled: true,
  });
}
