import { NextResponse } from "next/server";
import { serverGetArticles, serverUpdateArticle } from "@/lib/db-server";

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
    await serverUpdateArticle(article.id, { status: "게시" });
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
