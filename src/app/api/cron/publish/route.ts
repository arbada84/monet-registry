import { NextResponse } from "next/server";
import { serverGetArticles, serverUpdateArticle, serverGetArticleById } from "@/lib/db-server";
import { notifyNewsletterOnPublish } from "@/lib/newsletter-notify";
import { serverMigrateBodyImages, serverUploadImageUrl } from "@/lib/server-upload-image";

async function notifyIndexNow(articleId: string) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
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

  return {
    success: true,
    published: toPublish.length,
    articles: toPublish.map((a) => ({ id: a.id, title: a.title })),
  };
}

function checkSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 환경변수 미설정 시 검사 생략 (개발 환경)
  const header = req.headers.get("x-cron-secret");
  return header === secret;
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
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
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
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
