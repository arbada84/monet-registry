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

/** 기사 발행 시 뉴스레터 자동발송 — 직접 nodemailer 호출로 SMTP 패스워드 네트워크 전송 방지 */
async function notifyNewsletterOnPublish(article: Article) {
  try {
    const newsletterSettings = await serverGetSetting<{
      autoSendOnPublish?: boolean;
      senderName?: string;
      senderEmail?: string;
      replyToEmail?: string;
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPass?: string;
      smtpSecure?: boolean;
      footerText?: string;
    }>("cp-newsletter-settings", {});
    if (!newsletterSettings.autoSendOnPublish) return;
    if (!newsletterSettings.smtpHost || !newsletterSettings.smtpUser || !newsletterSettings.smtpPass) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "https://culturepeople.co.kr";
    const articleUrl = `${baseUrl}/article/${article.id}`;

    const subscribers = await serverGetSetting<{ email: string; name: string; status: string; token?: string }[]>(
      "cp-newsletter-subscribers", []
    );
    const activeSubscribers = subscribers.filter((s) => s.status === "active");
    if (activeSubscribers.length === 0) return;

    // 서버 내부에서 직접 nodemailer 사용 (SMTP 설정을 HTTP body로 전달하지 않음)
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: newsletterSettings.smtpHost,
      port: newsletterSettings.smtpPort || 587,
      secure: newsletterSettings.smtpSecure ?? false,
      auth: { user: newsletterSettings.smtpUser, pass: newsletterSettings.smtpPass },
    });

    const subject = article.title;
    const bodyText = article.summary || article.title;

    const BATCH = 10;
    for (let i = 0; i < activeSubscribers.length; i += BATCH) {
      await Promise.allSettled(
        activeSubscribers.slice(i, i + BATCH).map((s) => {
          const unsubLink = s.token ? `${baseUrl}/api/newsletter/unsubscribe?token=${s.token}` : null;
          return transporter.sendMail({
            from: `"${newsletterSettings.senderName || "컬처피플"}" <${newsletterSettings.senderEmail}>`,
            replyTo: newsletterSettings.replyToEmail || newsletterSettings.senderEmail,
            to: `<${s.email}>`,
            subject,
            html: `<p>${bodyText}</p><p><a href="${articleUrl}">기사 보기</a></p>${unsubLink ? `<p style="font-size:12px;color:#999"><a href="${unsubLink}">구독 해제</a></p>` : ""}`,
          });
        })
      );
    }
  } catch (err) {
    console.error("[newsletter] 자동발송 실패:", err);
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

    // 입력 검증
    if (!article.id || typeof article.id !== "string") {
      return NextResponse.json({ success: false, error: "id가 필요합니다." }, { status: 400 });
    }
    if (!article.title?.trim()) {
      return NextResponse.json({ success: false, error: "제목이 필요합니다." }, { status: 400 });
    }
    if (article.title.length > 500) {
      return NextResponse.json({ success: false, error: "제목이 너무 깁니다. (최대 500자)" }, { status: 400 });
    }
    if (!article.category?.trim()) {
      return NextResponse.json({ success: false, error: "카테고리가 필요합니다." }, { status: 400 });
    }
    const validStatuses = ["게시", "임시저장", "예약"];
    if (!validStatuses.includes(article.status)) {
      return NextResponse.json({ success: false, error: "올바르지 않은 상태값입니다." }, { status: 400 });
    }
    if (article.body && article.body.length > 2_000_000) {
      return NextResponse.json({ success: false, error: "본문이 너무 큽니다. (최대 2MB)" }, { status: 400 });
    }

    await serverCreateArticle(article);

    if (article.status === "게시") {
      void notifyIndexNow(article.id, "URL_UPDATED");
      void notifyNewsletterOnPublish(article);
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
    let existingArticle: Article | null = null;
    try {
      existingArticle = await serverGetArticleById(id);
      wasPublished = existingArticle?.status === "게시";
    } catch { /* 조회 실패 시 무시 */ }

    await serverUpdateArticle(id, { ...updates, updatedAt: new Date().toISOString() });

    if (updates.status === "게시" && !wasPublished) {
      void notifyIndexNow(id, "URL_UPDATED");
      // existing 데이터와 updates 병합하여 완전한 Article 전달
      if (existingArticle) void notifyNewsletterOnPublish({ ...existingArticle, ...updates } as Article);
    } else if (updates.status === "게시" && wasPublished) {
      void notifyIndexNow(id, "URL_UPDATED");
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PATCH articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/articles?id=xxx → 기사 삭제 (관련 댓글/뷰로그 cascade)
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    await serverDeleteArticle(id);

    // 관련 댓글 정리 (고아 데이터 방지)
    try {
      const { serverGetSetting: getSetting, serverSaveSetting: saveSetting } = await import("@/lib/db-server");
      const comments = await getSetting<{ articleId: string }[]>("cp-comments", []);
      const filtered = comments.filter((c) => c.articleId !== id);
      if (filtered.length !== comments.length) {
        await saveSetting("cp-comments", filtered);
      }
    } catch { /* 댓글 정리 실패는 무시 */ }

    void notifyIndexNow(id, "URL_DELETED");
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
