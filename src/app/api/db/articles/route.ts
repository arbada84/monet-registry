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

// ─────────────────────────────────────────────
// 이미지 자동 이관 (외부 URL → Cafe24 호스팅)
// 기사 게시 시 본문 <img src>를 우리 서버로 업로드 후 URL 교체
// ─────────────────────────────────────────────
const PHP_UPLOAD_URL    = process.env.PHP_UPLOAD_URL;
const PHP_UPLOAD_SECRET = process.env.PHP_UPLOAD_SECRET;
const FILES_BASE_URL    = process.env.FILES_BASE_URL || "https://files.culturepeople.co.kr";
const ALLOWED_IMG_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function isExternalImageUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    // 이미 우리 서버 → 이관 불필요
    if (h === "files.culturepeople.co.kr") return false;
    // IPv6 전체 차단
    if (h.startsWith("[") || h.includes(":")) return false;
    // localhost / 사설 IP 차단 (SSRF 방어)
    if (h === "localhost" || h === "127.0.0.1") return false;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 10 || a === 0 || a === 127) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
    }
    return true;
  } catch { return false; }
}

async function uploadImageToCafe24(imgUrl: string): Promise<string | null> {
  try {
    const imgResp = await fetch(imgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": new URL(imgUrl).origin + "/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!imgResp.ok) return null;

    const imgBuffer = await imgResp.arrayBuffer();
    if (imgBuffer.byteLength === 0 || imgBuffer.byteLength > 5 * 1024 * 1024) return null;

    let mimeType = imgResp.headers.get("content-type")?.split(";")[0].trim() || "";
    if (!ALLOWED_IMG_TYPES.includes(mimeType)) {
      const lower = imgUrl.toLowerCase();
      if (lower.includes(".png")) mimeType = "image/png";
      else if (lower.includes(".gif")) mimeType = "image/gif";
      else if (lower.includes(".webp")) mimeType = "image/webp";
      else mimeType = "image/jpeg";
    }
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    };
    const ext = extMap[mimeType] ?? "jpg";

    if (!PHP_UPLOAD_URL) return null;

    const uploadHeaders: Record<string, string> = { Authorization: `Bearer ${PHP_UPLOAD_SECRET ?? ""}` };

    const file = new File([imgBuffer], `image.${ext}`, { type: mimeType });
    const phpForm = new FormData();
    phpForm.append("file", file, `image.${ext}`);

    const res = await fetch(PHP_UPLOAD_URL, {
      method: "POST", headers: uploadHeaders, body: phpForm, cache: "no-store",
    });
    if (!res.ok) return null;

    const json = await res.json() as { success: boolean; url?: string };
    if (!json.success || !json.url) return null;

    return json.url.startsWith("http") ? json.url : `${FILES_BASE_URL}${json.url}`;
  } catch { return null; }
}

/** 본문 HTML의 외부 이미지를 Cafe24로 이관하고 URL을 교체해 반환 */
async function migrateBodyImages(body: string): Promise<{ body: string; urlMap: Record<string, string> }> {
  const urlMap: Record<string, string> = {};
  if (!body) return { body, urlMap };

  // 외부 이미지 URL 수집 (중복 제거)
  const externalUrls = [...new Set(
    [...body.matchAll(/<img[^>]+src="([^"]+)"/gi)]
      .map((m) => m[1])
      .filter((src) => isExternalImageUrl(src))
  )];
  if (externalUrls.length === 0) return { body, urlMap };

  // 병렬 업로드 (최대 10개)
  await Promise.all(
    externalUrls.slice(0, 10).map(async (imgUrl) => {
      const newUrl = await uploadImageToCafe24(imgUrl);
      if (newUrl) urlMap[imgUrl] = newUrl;
    })
  );

  let result = body;
  for (const [orig, newUrl] of Object.entries(urlMap)) {
    result = result.split(orig).join(newUrl);
  }
  return { body: result, urlMap };
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

    // 게시 시: 외부 이미지 → Cafe24 자동 이관
    if (article.status === "게시" && article.body) {
      try {
        const { body: migratedBody, urlMap } = await migrateBodyImages(article.body);
        article.body = migratedBody;
        // 썸네일도 같은 URL이면 함께 교체
        if (article.thumbnail && urlMap[article.thumbnail]) {
          article.thumbnail = urlMap[article.thumbnail];
        } else if (article.thumbnail && isExternalImageUrl(article.thumbnail)) {
          const newThumb = await uploadImageToCafe24(article.thumbnail);
          if (newThumb) article.thumbnail = newThumb;
        }
      } catch (err) {
        console.error("[article-publish] 이미지 이관 실패:", err);
      }
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

    // 게시 상태로 변경 시: 외부 이미지 → Cafe24 자동 이관
    if (updates.status === "게시") {
      try {
        const bodyToMigrate = updates.body ?? existingArticle?.body ?? "";
        if (bodyToMigrate) {
          const { body: migratedBody, urlMap } = await migrateBodyImages(bodyToMigrate);
          updates.body = migratedBody;
          // 썸네일 URL 교체
          const thumbSrc = updates.thumbnail ?? existingArticle?.thumbnail;
          if (thumbSrc && urlMap[thumbSrc]) {
            updates.thumbnail = urlMap[thumbSrc];
          } else if (thumbSrc && isExternalImageUrl(thumbSrc)) {
            const newThumb = await uploadImageToCafe24(thumbSrc);
            if (newThumb) updates.thumbnail = newThumb;
          }
        }
      } catch (err) {
        console.error("[article-publish] 이미지 이관 실패:", err);
      }
    }

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
