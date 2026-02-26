import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Article } from "@/types/article";

const isMySQLEnabled = () => Boolean(process.env.MYSQL_DATABASE);

async function getDB() {
  if (process.env.PHP_API_URL) return import("@/lib/php-api-db");
  if (isMySQLEnabled()) return import("@/lib/mysql-db");
  return import("@/lib/file-db").then((m) => ({
    dbGetArticles: m.fileGetArticles,
    dbGetArticleById: m.fileGetArticleById,
    dbCreateArticle: m.fileCreateArticle,
    dbUpdateArticle: m.fileUpdateArticle,
    dbDeleteArticle: m.fileDeleteArticle,
  }));
}

async function getSettingsDB() {
  if (process.env.PHP_API_URL) {
    const { dbGetSetting } = await import("@/lib/php-api-db");
    return { dbGetSetting };
  }
  if (isMySQLEnabled()) {
    const { dbGetSetting } = await import("@/lib/mysql-db");
    return { dbGetSetting };
  }
  const { fileGetSetting } = await import("@/lib/file-db");
  return { dbGetSetting: fileGetSetting };
}

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
    const { dbGetSetting } = await getSettingsDB();
    const newsletterSettings = await dbGetSetting<{ autoSendOnPublish?: boolean }>("cp-newsletter-settings", {});
    if (!newsletterSettings.autoSendOnPublish) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "https://culturepeople.co.kr";
    const articleUrl = `${baseUrl}/article/${article.id}`;
    const subject = article.title;
    const content = `${article.summary || article.title}\n\n기사 보기: ${articleUrl}`;

    // 구독자 및 SMTP 설정 로드
    const [subscribers, smtpSettings] = await Promise.all([
      dbGetSetting<unknown[]>("cp-newsletter-subscribers", []),
      dbGetSetting<Record<string, unknown>>("cp-newsletter-settings", {}),
    ]);

    await fetch(`${baseUrl}/api/newsletter/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        content,
        settings: smtpSettings,
        subscribers,
      }),
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
    const db = await getDB();
    const sp = request.nextUrl.searchParams;
    const id = sp.get("id");

    if (id) {
      const article = await db.dbGetArticleById(id);
      return NextResponse.json({ success: true, article });
    }

    let articles = await db.dbGetArticles();

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
    const db = await getDB();
    const article: Article = await request.json();
    await db.dbCreateArticle(article);

    // 게시 상태면 IndexNow 호출 및 뉴스레터 자동발송
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
    const db = await getDB();
    const { id, ...updates } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    // 기존 기사의 status를 확인하여 "게시" 전환 여부 감지
    let wasPublished = false;
    try {
      const existing = await db.dbGetArticleById(id);
      wasPublished = existing?.status === "게시";
    } catch {
      // 조회 실패 시 무시
    }

    await db.dbUpdateArticle(id, updates);

    // status가 "게시"로 변경된 경우 IndexNow 호출 및 뉴스레터 자동발송
    if (updates.status === "게시" && !wasPublished) {
      notifyIndexNow(id, "URL_UPDATED");
      // 뉴스레터 자동발송: 업데이트된 기사 정보로 호출
      const updatedArticle = { id, ...updates } as Article;
      notifyNewsletterOnPublish(updatedArticle);
    } else if (updates.status === "게시" && wasPublished) {
      // 이미 게시 상태에서 수정된 경우에도 IndexNow 업데이트
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
    const db = await getDB();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await db.dbDeleteArticle(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
