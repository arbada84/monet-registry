import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serverGetArticles, serverUpdateArticle, serverGetArticleById, serverGetDeletedArticles, serverPurgeArticle, serverGetSetting } from "@/lib/db-server";
import { notifyNewsletterOnPublish } from "@/lib/newsletter-notify";
import { serverMigrateBodyImages, serverUploadImageUrl } from "@/lib/server-upload-image";

async function notifyIndexNow(articleId: string) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "") ||
      "https://culturepeople.co.kr";
    await fetch(`${baseUrl}/api/seo/index-now`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${baseUrl}/article/${articleId}`, action: "URL_UPDATED" }),
    });
  } catch { /* IndexNow 실패는 무시 */ }
}

async function runPublish() {
  const articles = await serverGetArticles();
  const now = new Date().toISOString();

  const toPublish = articles.filter(
    (a) =>
      a.status === "예약" &&
      a.scheduledPublishAt &&
      a.scheduledPublishAt <= now
  );

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
    } catch { /* 이관 실패해도 발행은 진행 */ }

    await serverUpdateArticle(article.id, {
      status: "게시",
      body: migratedBody,
      thumbnail: migratedThumb,
      updatedAt: new Date().toISOString(),
    });
    // 발행 후 검색엔진 색인 요청
    void notifyIndexNow(article.id);
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 환경변수 미설정 시 검사 생략 (개발 환경)
  const xSecret = req.headers.get("x-cron-secret") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return timingSafeEqual(xSecret, secret) || timingSafeEqual(bearer, secret);
}

export async function POST(req: Request) {
  if (!checkSecret(req)) {
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

// GET도 지원 (외부 cron 서비스에서 GET 호출 시)
export async function GET(req: Request) {
  if (!checkSecret(req)) {
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
