import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import type { Article } from "@/types/article";
import {
  serverGetArticleById,
  serverCreateArticle,
  serverUpdateArticle,
  serverDeleteArticle,
  serverGetSetting,
  serverGetFilteredArticles,
} from "@/lib/db-server";
import { notifyNewsletterOnPublish } from "@/lib/newsletter-notify";
import { serverMigrateBodyImages, serverUploadImageUrl } from "@/lib/server-upload-image";
import { notifyIndexNow, submitGooglePing } from "@/lib/notify-search";

// GET /api/db/articles              → 전체 목록 (페이지네이션 지원)
// GET /api/db/articles?id=xxx       → 단건 조회
// GET /api/db/articles?page=1&limit=20&q=검색어&category=카테고리&status=게시
export async function GET(request: NextRequest) {
  let requestWasAuthenticated = false;
  try {
    const sp = request.nextUrl.searchParams;
    const id = sp.get("id");

    if (id) {
      const article = await serverGetArticleById(id);
      return NextResponse.json({ success: true, article });
    }

    // 인증 확인 (관리자 여부)
    const { isAuthenticated } = await import("@/lib/cookie-auth");
    const authed = await isAuthenticated(request);
    requestWasAuthenticated = authed;

    const status = sp.get("status");
    const trash = sp.get("trash");

    // 미발행 기사 또는 휴지통 조회 시 인증 필수
    const needsAuth = status === "임시저장" || status === "상신" || status === "승인" || status === "반려" || trash === "true";
    if (needsAuth && !authed) {
      return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
    }

    // 휴지통 조회
    if (trash === "true") {
      const { serverGetDeletedArticles } = await import("@/lib/db-server");
      const deleted = await serverGetDeletedArticles();
      return NextResponse.json({ success: true, articles: deleted, total: deleted.length });
    }

    // DB 레벨 필터링 + 페이지네이션
    const q = sp.get("q")?.trim().slice(0, 200) || undefined;
    const category = sp.get("category") || undefined;
    const pageParam = sp.get("page");
    const limitParam = sp.get("limit");
    const maxLimit = authed ? 10000 : 200;
    const limit = Math.min(maxLimit, Math.max(1, parseInt(limitParam ?? "20", 10)));
    const page = Math.max(1, parseInt(pageParam ?? "1", 10));

    const { articles, total } = await serverGetFilteredArticles({
      q, category, status: status || undefined, page, limit, authed,
    });

    const cacheControl = authed
      ? "private, no-cache"
      : "public, s-maxage=60, stale-while-revalidate=300";

    if (pageParam || limitParam) {
      return NextResponse.json({ success: true, articles, total, page, limit }, {
        headers: { "Cache-Control": cacheControl },
      });
    }
    return NextResponse.json({ success: true, articles, total }, {
      headers: { "Cache-Control": cacheControl },
    });
  } catch (e) {
    console.error("[DB] GET articles error:", e);
    const message = e instanceof Error ? e.message : String(e);
    const quotaExceeded = /402|exceed_storage_size_quota|quota/i.test(message);
    const error = requestWasAuthenticated && quotaExceeded
      ? "Supabase 저장공간 한도 초과로 DB 서비스가 제한되어 기사 데이터를 불러올 수 없습니다. Supabase 프로젝트의 Storage 사용량을 정리하거나 플랜/쿼터를 확인해주세요."
      : "서버 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error, code: quotaExceeded ? "SUPABASE_QUOTA_EXCEEDED" : "DB_READ_FAILED" }, { status: quotaExceeded ? 503 : 500 });
  }
}

// POST /api/db/articles → 기사 생성
export async function POST(request: NextRequest) {
  try {
    const { _distribute, ...articleData } = await request.json();
    const article: Article = articleData;
    const distribute = _distribute as { indexNow?: boolean; googlePing?: boolean } | undefined;

    // 입력 검증
    if (article.id && typeof article.id !== "string") {
      return NextResponse.json({ success: false, error: "올바르지 않은 id 형식입니다." }, { status: 400 });
    }
    // (사용자 요청: 숫자형 ID 지원을 위해 UUID 강제 검증 제거)
    if (!article.title?.trim()) {
      return NextResponse.json({ success: false, error: "제목이 필요합니다." }, { status: 400 });
    }
    if (article.title.length > 500) {
      return NextResponse.json({ success: false, error: "제목이 너무 깁니다. (최대 500자)" }, { status: 400 });
    }
    if (!article.category?.trim()) {
      return NextResponse.json({ success: false, error: "카테고리가 필요합니다." }, { status: 400 });
    }
    const validStatuses = ["게시", "임시저장", "예약", "상신"];
    if (!validStatuses.includes(article.status)) {
      return NextResponse.json({ success: false, error: "올바르지 않은 상태값입니다." }, { status: 400 });
    }

    // 기자(reporter)는 "상신"/"임시저장"만 허용 — "게시"/"예약" 차단 (승인 워크플로우 우회 방지)
    if (article.status === "게시" || article.status === "예약") {
      try {
        const { verifyAuthToken: vat } = await import("@/lib/cookie-auth");
        const cookie = request.cookies.get("cp-admin-auth");
        const { role } = await vat(cookie?.value ?? "");
        if (role === "reporter") {
          return NextResponse.json({ success: false, error: "기자는 '상신' 또는 '임시저장'만 선택할 수 있습니다." }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
      }
    }
    if (article.body && article.body.length > 2_000_000) {
      return NextResponse.json({ success: false, error: "본문이 너무 큽니다. (최대 2MB)" }, { status: 400 });
    }

    // 게시 시: 외부 이미지 → Supabase Storage 자동 이관 (server-upload-image.ts 공통 함수 사용)
    if (article.status === "게시" && article.body) {
      try {
        article.body = await serverMigrateBodyImages(article.body);
        if (article.thumbnail) {
          const newThumb = await serverUploadImageUrl(article.thumbnail);
          if (newThumb) article.thumbnail = newThumb;
        }
      } catch (err) {
        console.error("[article-publish] 이미지 이관 실패:", err);
      }
    }

    let assignedNo: number | undefined;
    try {
      assignedNo = await serverCreateArticle(article);
    } catch (createErr) {
      console.error("[DB] POST serverCreateArticle error:", createErr);
      const safeCreateErr = process.env.NODE_ENV === "production"
        ? "기사 생성 중 오류가 발생했습니다."
        : (createErr instanceof Error ? createErr.message : "기사 생성 실패");
      return NextResponse.json({ success: false, error: safeCreateErr }, { status: 500 });
    }
    revalidateTag("articles");

    if (article.status === "게시") {
      if (distribute?.indexNow !== false) notifyIndexNow(assignedNo ?? article.id, "URL_UPDATED").catch((e) => console.error("[indexnow]", e));
      if (distribute?.googlePing) submitGooglePing().catch((e) => console.error("[google-ping]", e));
      notifyNewsletterOnPublish({ ...article, no: assignedNo }).catch((e) => console.error("[newsletter]", e));
    }

    return NextResponse.json({ success: true, no: assignedNo });
  } catch (e) {
    console.error("[DB] POST articles error:", e);
    const safeError = process.env.NODE_ENV === "production"
      ? "서버 오류가 발생했습니다."
      : (e instanceof Error ? e.message : "알 수 없는 오류");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}

// PATCH /api/db/articles → 기사 수정 { id, ...updates }
export async function PATCH(request: NextRequest) {
  try {
    const { id, _distribute, ...updates } = await request.json();
    const distribute = _distribute as { indexNow?: boolean; googlePing?: boolean } | undefined;
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    // status 값 검증 (설정된 경우)
    if (updates.status) {
      const validStatuses = ["게시", "임시저장", "예약", "상신", "승인", "반려"];
      if (!validStatuses.includes(updates.status)) {
        return NextResponse.json({ success: false, error: "올바르지 않은 상태값입니다." }, { status: 400 });
      }
    }
    // title 길이 검증 (설정된 경우)
    if (updates.title !== undefined && updates.title.length > 500) {
      return NextResponse.json({ success: false, error: "제목이 너무 깁니다. (최대 500자)" }, { status: 400 });
    }

    // 승인/반려는 관리자 이상만 가능
    if (updates.status === "승인" || updates.status === "반려" || updates.status === "게시") {
      try {
        const { verifyAuthToken } = await import("@/lib/cookie-auth");
        const cookie = request.cookies.get("cp-admin-auth");
        const { role } = await verifyAuthToken(cookie?.value ?? "");
        if (role === "reporter") {
          return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
      }
    }

    let wasPublished = false;
    let existingArticle: Article | null = null;
    try {
      existingArticle = await serverGetArticleById(id);
      wasPublished = existingArticle?.status === "게시";
    } catch { /* 조회 실패 시 무시 */ }

    // 게시 상태로 변경 시: 외부 이미지 → Supabase Storage 자동 이관 (공통 함수)
    let imageMigrationWarning: string | undefined;
    if (updates.status === "게시") {
      try {
        const bodyToMigrate = updates.body ?? existingArticle?.body ?? "";
        if (bodyToMigrate) {
          updates.body = await serverMigrateBodyImages(bodyToMigrate);
        }
        const thumbSrc = updates.thumbnail ?? existingArticle?.thumbnail;
        if (thumbSrc) {
          const newThumb = await serverUploadImageUrl(thumbSrc);
          if (newThumb) updates.thumbnail = newThumb;
        }
      } catch (err) {
        console.error("[article-publish] 이미지 이관 실패:", err);
        imageMigrationWarning = "일부 이미지 이관에 실패했습니다. 기사는 저장되었습니다.";
      }
    }

    await serverUpdateArticle(id, { ...updates, updatedAt: new Date().toISOString() });
    revalidateTag("articles");

    const articleNo = existingArticle?.no;
    if (updates.status === "게시" && !wasPublished) {
      if (distribute?.indexNow !== false) notifyIndexNow(articleNo ?? id, "URL_UPDATED").catch((e) => console.error("[indexnow]", e));
      if (distribute?.googlePing) submitGooglePing().catch((e) => console.error("[google-ping]", e));
      if (existingArticle) notifyNewsletterOnPublish({ ...existingArticle, ...updates } as Article).catch((e) => console.error("[newsletter]", e));
    } else if (updates.status === "게시" && wasPublished) {
      if (distribute?.indexNow !== false) notifyIndexNow(articleNo ?? id, "URL_UPDATED").catch((e) => console.error("[indexnow]", e));
      if (distribute?.googlePing) submitGooglePing().catch((e) => console.error("[google-ping]", e));
    }

    return NextResponse.json({ success: true, ...(imageMigrationWarning ? { warning: imageMigrationWarning } : {}) });
  } catch (e) {
    console.error("[DB] PATCH articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

/** 기사 삭제 시 Supabase Storage 이미지 정리 (비동기, 실패해도 무시) */
async function cleanupArticleImages(article: { thumbnail?: string; body?: string }) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) return;

  const urls: string[] = [];
  if (article.thumbnail?.includes("supabase")) urls.push(article.thumbnail);
  const imgMatches = article.body?.matchAll(/<img[^>]+src=["'](https:\/\/[^"']*supabase[^"']+)["']/gi) ?? [];
  for (const m of imgMatches) urls.push(m[1]);

  for (const url of urls) {
    try {
      const pathPart = url.split("/storage/v1/object/public/")[1];
      if (!pathPart) continue;
      const [bucket, ...rest] = pathPart.split("/");
      await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${rest.join("/")}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch { /* 개별 이미지 삭제 실패는 무시 */ }
  }
}

// DELETE /api/db/articles?id=xxx → 소프트 삭제 (휴지통 이동)
// DELETE /api/db/articles?id=xxx&action=purge → 영구 삭제
// DELETE /api/db/articles?id=xxx&action=restore → 휴지통에서 복원
export async function DELETE(request: NextRequest) {
  try {
    // 역할 확인: 쿠키 인증 또는 CRON_SECRET (Bearer)
    const { verifyAuthToken, timingSafeEqual: tse } = await import("@/lib/cookie-auth");
    const cookie = request.cookies.get("cp-admin-auth");
    const tokenResult = await verifyAuthToken(cookie?.value ?? "");
    let role = tokenResult.valid ? (tokenResult.role || "admin") : "";

    // CRON_SECRET Bearer 인증 시 superadmin 권한 부여
    if (!role) {
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = request.headers.get("authorization");
      if (cronSecret && authHeader?.startsWith("Bearer ") && tse(authHeader.slice(7), cronSecret)) {
        role = "superadmin";
      }
    }

    // 기자(reporter)는 기사 삭제 불가
    if (role === "reporter") {
      return NextResponse.json({ success: false, error: "기사 삭제 권한이 없습니다." }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get("id");
    const action = request.nextUrl.searchParams.get("action"); // purge | restore
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

    if (action === "restore") {
      const { serverRestoreArticle } = await import("@/lib/db-server");
      await serverRestoreArticle(id);
      revalidateTag("articles");
      return NextResponse.json({ success: true });
    }

    if (action === "purge") {
      if (role !== "superadmin") {
        return NextResponse.json({ success: false, error: "영구 삭제는 최고 관리자만 가능합니다." }, { status: 403 });
      }
      // 영구 삭제 전 기사 데이터 조회 (이미지 정리용)
      let articleForCleanup: { thumbnail?: string; body?: string } | null = null;
      try {
        articleForCleanup = await serverGetArticleById(id);
      } catch { /* 조회 실패 시 이미지 정리 스킵 */ }

      const { serverPurgeArticle } = await import("@/lib/db-server");
      await serverPurgeArticle(id);

      // 비동기로 Storage 이미지 정리 (삭제 완료 후)
      if (articleForCleanup) {
        cleanupArticleImages(articleForCleanup).catch((e) => console.error("[cleanup-images]", e));
      }
      revalidateTag("articles");
      // 영구 삭제 시 관련 댓글 정리
      try {
        const { serverGetSetting: getSetting, serverSaveSetting: saveSetting } = await import("@/lib/db-server");
        const comments = await getSetting<{ articleId: string }[]>("cp-comments", []);
        const filtered = comments.filter((c) => c.articleId !== id);
        if (filtered.length !== comments.length) {
          await saveSetting("cp-comments", filtered);
        }
      } catch { /* 댓글 정리 실패는 무시 */ }
      return NextResponse.json({ success: true });
    }

    // 기본: 소프트 삭제 (휴지통 이동)
    try {
      await serverDeleteArticle(id);
    } catch (delErr) {
      console.error("[DB] DELETE serverDeleteArticle error:", delErr);
      const safeDelErr = process.env.NODE_ENV === "production"
        ? "기사 삭제 중 오류가 발생했습니다."
        : (delErr instanceof Error ? delErr.message : "기사 삭제 실패");
      return NextResponse.json({ success: false, error: safeDelErr }, { status: 500 });
    }
    revalidateTag("articles");
    notifyIndexNow(id, "URL_DELETED").catch((e) => console.error("[indexnow]", e));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE articles error:", e);
    const safeError = process.env.NODE_ENV === "production"
      ? "서버 오류가 발생했습니다."
      : (e instanceof Error ? e.message : "알 수 없는 오류");
    return NextResponse.json({ success: false, error: safeError }, { status: 500 });
  }
}
