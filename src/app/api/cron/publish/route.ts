import { NextResponse } from "next/server";
import { serverGetArticles, serverUpdateArticle } from "@/lib/db-server";

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
    await serverUpdateArticle(article.id, {
      status: "게시",
      updatedAt: new Date().toISOString(),
    });
    // 발행 후 검색엔진에 색인 요청
    void notifyIndexNow(article.id);
  }

  return {
    success: true,
    published: toPublish.length,
    articles: toPublish.map((a) => ({ id: a.id, title: a.title })),
  };
}

export async function POST() {
  try {
    const result = await runPublish();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[Cron] publish error:", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// GET도 지원 (외부 cron 서비스에서 GET 호출 시)
export async function GET() {
  try {
    const result = await runPublish();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[Cron] publish error:", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
