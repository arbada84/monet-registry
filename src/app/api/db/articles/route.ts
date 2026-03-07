import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import type { Article } from "@/types/article";
import {
  serverGetArticles,
  serverGetArticleById,
  serverCreateArticle,
  serverUpdateArticle,
  serverDeleteArticle,
  serverGetSetting,
} from "@/lib/db-server";
import { notifyNewsletterOnPublish } from "@/lib/newsletter-notify";

// ─────────────────────────────────────────────
// 이미지 자동 이관 (외부 URL → Supabase Storage)
// 기사 게시 시 본문 <img src>를 Supabase Storage로 업로드 후 URL 교체
// ─────────────────────────────────────────────
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY       = process.env.SUPABASE_SERVICE_KEY!;
const STORAGE_BUCKET    = "images";
const ALLOWED_IMG_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function isExternalImageUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    // 이미 Supabase Storage → 이관 불필요
    if (h.endsWith("supabase.co")) return false;
    // IPv6 전체 차단
    if (h.startsWith("[") || h.includes(":")) return false;
    // localhost / 사설 IP 차단 (SSRF 방어)
    if (h === "localhost" || h === "127.0.0.1") return false;
    // 내부 DNS 접미사 차단 (.local, .internal, .localhost)
    if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return false;
    // AWS/GCP/Azure 메타데이터 서버 차단
    if (h === "metadata.google.internal" || h === "169.254.169.254") return false;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b, c, d] = ipv4.map(Number);
      // 유효 범위 체크 (999.999.999.999 같은 비표준 주소 차단)
      if (a > 255 || b > 255 || c > 255 || d > 255) return false;
      if (a === 0 || a === 10 || a === 127) return false;
      if (a === 100 && b >= 64 && b <= 127) return false; // Shared Address Space (RFC 6598)
      if (a === 169 && b === 254) return false; // Link-local
      if (a === 172 && b >= 16 && b <= 31) return false; // Private
      if (a === 192 && b === 168) return false; // Private
      if (a === 198 && (b === 18 || b === 19)) return false; // Benchmark
      if (a >= 224) return false; // Multicast + Reserved
    }
    return true;
  } catch { return false; }
}

async function uploadImageToSupabase(imgUrl: string): Promise<string | null> {
  try {
    const imgResp = await fetch(imgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": new URL(imgUrl).origin + "/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error", // SSRF: 리다이렉트 차단
    });
    if (!imgResp.ok) return null;

    const imgBuffer = await imgResp.arrayBuffer();
    if (imgBuffer.byteLength === 0 || imgBuffer.byteLength > 5 * 1024 * 1024) return null;

    let mimeType = imgResp.headers.get("content-type")?.split(";")[0].trim() || "";
    if (!ALLOWED_IMG_TYPES.includes(mimeType)) {
      const lower = imgUrl.toLowerCase();
      if (lower.includes(".png"))       mimeType = "image/png";
      else if (lower.includes(".gif"))  mimeType = "image/gif";
      else if (lower.includes(".webp")) mimeType = "image/webp";
      else                              mimeType = "image/jpeg";
    }
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    };
    const ext = extMap[mimeType] ?? "jpg";

    const now  = new Date();
    const yyyy = now.getFullYear();
    const mm   = String(now.getMonth() + 1).padStart(2, "0");
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `${yyyy}/${mm}/${Date.now()}_${rand}.${ext}`;

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body: imgBuffer,
      cache: "no-store",
    });
    if (!res.ok) return null;

    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  } catch { return null; }
}

/** 본문 HTML의 외부 이미지를 Supabase Storage로 이관하고 URL을 교체해 반환 */
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

  // 병렬 업로드 (최대 10개) + 전체 8초 타임아웃 (Vercel 함수 타임아웃 방지)
  const MIGRATION_TIMEOUT_MS = 8000;
  await Promise.race([
    Promise.all(
      externalUrls.slice(0, 10).map(async (imgUrl) => {
        const newUrl = await uploadImageToSupabase(imgUrl);
        if (newUrl) urlMap[imgUrl] = newUrl;
      })
    ),
    new Promise<void>((resolve) => setTimeout(resolve, MIGRATION_TIMEOUT_MS)),
  ]);

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
      process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "") ||
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

    // 휴지통 조회
    if (sp.get("trash") === "true") {
      const { serverGetDeletedArticles } = await import("@/lib/db-server");
      const deleted = await serverGetDeletedArticles();
      return NextResponse.json({ success: true, articles: deleted, total: deleted.length });
    }

    let articles = await serverGetArticles();

    // 필터링
    const q = sp.get("q")?.trim().toLowerCase().slice(0, 200); // 검색어 200자 제한
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
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!article.id || typeof article.id !== "string" || !UUID_REGEX.test(article.id)) {
      return NextResponse.json({ success: false, error: "올바르지 않은 id 형식입니다." }, { status: 400 });
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

    // 게시 시: 외부 이미지 → Supabase Storage 자동 이관
    if (article.status === "게시" && article.body) {
      try {
        const { body: migratedBody, urlMap } = await migrateBodyImages(article.body);
        article.body = migratedBody;
        // 썸네일도 같은 URL이면 함께 교체
        if (article.thumbnail && urlMap[article.thumbnail]) {
          article.thumbnail = urlMap[article.thumbnail];
        } else if (article.thumbnail && isExternalImageUrl(article.thumbnail)) {
          const newThumb = await uploadImageToSupabase(article.thumbnail);
          if (newThumb) article.thumbnail = newThumb;
        }
      } catch (err) {
        console.error("[article-publish] 이미지 이관 실패:", err);
      }
    }

    await serverCreateArticle(article);
    revalidateTag("articles");

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

    // 게시 상태로 변경 시: 외부 이미지 → Supabase Storage 자동 이관
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
            const newThumb = await uploadImageToSupabase(thumbSrc);
            if (newThumb) updates.thumbnail = newThumb;
          }
        }
      } catch (err) {
        console.error("[article-publish] 이미지 이관 실패:", err);
      }
    }

    await serverUpdateArticle(id, { ...updates, updatedAt: new Date().toISOString() });
    revalidateTag("articles");

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

// DELETE /api/db/articles?id=xxx → 소프트 삭제 (휴지통 이동)
// DELETE /api/db/articles?id=xxx&action=purge → 영구 삭제
// DELETE /api/db/articles?id=xxx&action=restore → 휴지통에서 복원
export async function DELETE(request: NextRequest) {
  try {
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
      const { serverPurgeArticle } = await import("@/lib/db-server");
      await serverPurgeArticle(id);
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
    await serverDeleteArticle(id);
    revalidateTag("articles");
    void notifyIndexNow(id, "URL_DELETED");
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE articles error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
