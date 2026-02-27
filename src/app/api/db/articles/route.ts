import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Article } from "@/types/article";
import {
  serverGetArticles,
  serverGetArticleById,
  serverCreateArticle,
  serverUpdateArticle,
  serverDeleteArticle,
  serverGetSetting,
} from "@/lib/db-server";

/** 기사 발행 시 IndexNow 호출 (실패해도 무시) */
async function notifyIndexNow(articleId: string, action: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED") {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "https://culturepeople.co.kr";
    const url = `${baseUrl}/article/${articleId}`;
    await fetch(`${baseUrl}/api/seo/index-now`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, action }),
    });
  } catch {
    // IndexNow 실패는 무시
  }
}

/** 기사 발행 시 뉴스레터 자동발송 (실패해도 무시) */
async function notifyNewsletterOnPublish(article: Article) {
  try {
    const newsletterSettings = await serverGetSetting<{ autoSendOnPublish?: boolean }>("cp-newsletter-settings", {});
    if (!newsletterSettings.autoSendOnPublish) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "https://culturepeople.co.kr";
    const articleUrl = `${baseUrl}/article/${article.id}`;
    const subject = article.title;
    const content = `${article.summary || article.title}\n\n기사 보기: ${articleUrl}`;

    const [subscribers, smtpSettings] = await Promise.all([
      serverGetSetting<unknown[]>("cp-newsletter-subscribers", []),
      serverGetSetting<Record<string, unknown>>("cp-newsletter-settings", {}),
    ]);

    await fetch(`${baseUrl}/api/newsletter/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, content, settings: smtpSettings, subscribers }),
    });
  } catch {
    // 뉴스레터 자동발송 실패는 무시
  }
}

// GET /api/db/articles              → 전체 목록 (페이지네이션 지원)
// GET /api/db/articles?id=xxx       → 단건 조회
// GET /api/db/articles?page=1&limit=20&q=검색어&category=카테고리&status=게시
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const id = sp.get("id");

    if (id) {
      const article = await serverGetArticleById(id);
      return NextResponse.json({ success: true, article });
    }

    let articles = await serverGetArticles();

    // 필터링
    const q = sp.get("q")?.trim().toLowerCase();
    const category = sp.get("category");
    const status = sp.get("status");

    if (q) {
      articles = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.author?.toLowerCase().includes(q) ||
          a.tags?.toLowerCase().includes(q)
      );
    }
    if (category) {
      articles = articles.filter((a) => a.category === category);
    }
    if (status) {
      articles = articles.filter((a) => a.status === status);
    }

    const total = articles.length;

    // 페이지네이션
    const pageParam = sp.get("page");
    const limitParam = sp.get("limit");
    if (pageParam || limitParam) {
      const page = Math.max(1, parseInt(pageParam ?? "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? "20", 10)));
      const offset = (page - 1) * limit;
      articles = articles.slice(offset, offset + limit);
      return NextResponse.json({ success: true, articles, total, page, limit });
    }

    return NextResponse.json({ success: true, articles, total });
  } catch (e) {
    console.error("[DB] GET articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/articles → 기사 생성
export async function POST(request: NextRequest) {
  try {
    const article: Article = await request.json();
    await serverCreateArticle(article);

    if (article.status === "게시") {
      notifyIndexNow(article.id, "URL_UPDATED");
      notifyNewsletterOnPublish(article);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PATCH /api/db/articles → 기사 수정 { id, ...updates }
export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    let wasPublished = false;
    try {
      const existing = await serverGetArticleById(id);
      wasPublished = existing?.status === "게시";
    } catch { /* 조회 실패 시 무시 */ }

    await serverUpdateArticle(id, updates);

    if (updates.status === "게시" && !wasPublished) {
      notifyIndexNow(id, "URL_UPDATED");
      notifyNewsletterOnPublish({ id, ...updates } as Article);
    } else if (updates.status === "게시" && wasPublished) {
      notifyIndexNow(id, "URL_UPDATED");
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PATCH articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/articles?id=xxx → 기사 삭제
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await serverDeleteArticle(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
