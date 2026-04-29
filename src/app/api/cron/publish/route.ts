import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  serverGetArticleById,
  serverGetDeletedArticles,
  serverGetScheduledArticles,
  serverGetSetting,
  serverPurgeArticle,
  serverUpdateArticle,
} from "@/lib/db-server";
import { notifyNewsletterOnPublish } from "@/lib/newsletter-notify";
import { serverMigrateBodyImages, serverUploadImageUrl } from "@/lib/server-upload-image";
import { isAuthenticated, timingSafeEqual } from "@/lib/cookie-auth";
import { notifyIndexNow } from "@/lib/notify-search";

async function runPublish() {
  const toPublish = await serverGetScheduledArticles();

  for (const article of toPublish) {
    const full = await serverGetArticleById(article.id);
    let migratedBody = full?.body || article.body;
    let migratedThumb = full?.thumbnail || article.thumbnail;

    try {
      if (migratedBody) migratedBody = await serverMigrateBodyImages(migratedBody);
      if (migratedThumb && !/supabase|culturepeople\.co\.kr/.test(migratedThumb)) {
        migratedThumb = (await serverUploadImageUrl(migratedThumb)) ?? migratedThumb;
      }
    } catch (imgErr) {
      console.warn(
        `[Cron] 기사 ${article.id} 이미지 이관 실패 (발행은 계속):`,
        imgErr instanceof Error ? imgErr.message : imgErr
      );
    }

    await serverUpdateArticle(article.id, {
      status: "게시",
      body: migratedBody,
      thumbnail: migratedThumb,
      updatedAt: new Date().toISOString(),
    });

    void notifyIndexNow(article.no ?? article.id);
    void notifyNewsletterOnPublish({ ...article, status: "게시" });
  }

  if (toPublish.length > 0) {
    revalidateTag("articles");
  }

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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), cronSecret)) {
    try {
      const result = await runPublish();
      return NextResponse.json(result);
    } catch (e) {
      console.error("[Cron] publish error:", e);
      return NextResponse.json({ success: false, error: "예약 발행 처리 중 오류가 발생했습니다." }, { status: 500 });
    }
  }

  return NextResponse.json({
    status: "ok",
    message: "Use POST to execute manually",
    enabled: true,
  });
}
