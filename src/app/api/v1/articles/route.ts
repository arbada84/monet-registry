/**
 * 외부 기사 API v1
 * GET  /api/v1/articles  → 기사 목록 (페이지네이션)
 * POST /api/v1/articles  → 기사 생성
 *
 * 인증: Authorization: Bearer <api_key>
 */
import { NextRequest, NextResponse } from "next/server";
import type { Article } from "@/types/article";
import { serverGetArticles, serverCreateArticle, serverGetArticleById, serverGetSetting } from "@/lib/db-server";
import { verifyApiKey } from "@/lib/api-key";
import { verifyAuthToken } from "@/lib/cookie-auth";

async function authenticate(req: NextRequest): Promise<boolean> {
  if (await verifyApiKey(req.headers.get("authorization"))) return true;
  // 관리자 쿠키도 허용 (어드민 직접 테스트용)
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

/** cp-admin-accounts에서 기자명으로 이메일 조회 */
async function findReporterEmail(name: string): Promise<string> {
  try {
    const reporters = await serverGetSetting<{ name: string; email: string; active?: boolean }[]>("cp-admin-accounts", []);
    const match = reporters.find((r) => r.name === name && r.active !== false);
    return match?.email ?? "";
  } catch {
    return "";
  }
}

// ──────────────────────────────────────────────
// GET /api/v1/articles
// Query: page, limit, category, status, q
// ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "API 키가 필요합니다. Authorization: Bearer <key>" }, { status: 401 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    let articles = await serverGetArticles();

    const q        = sp.get("q")?.trim().toLowerCase();
    const category = sp.get("category");
    const status   = sp.get("status");

    if (q)        articles = articles.filter((a) => a.title.toLowerCase().includes(q) || (a.body ?? "").toLowerCase().includes(q) || (a.tags ?? "").toLowerCase().includes(q));
    if (category) articles = articles.filter((a) => a.category === category);
    if (status)   articles = articles.filter((a) => a.status === status);

    const total   = articles.length;
    const page    = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const limit   = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10)));
    const lastPage = Math.ceil(total / limit) || 1;
    const paged   = articles.slice((page - 1) * limit, page * limit);

    return NextResponse.json({ success: true, articles: paged, total, page, limit, lastPage });
  } catch (e) {
    console.error("[v1/articles] GET error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────
// POST /api/v1/articles
// Body: {
//   title*, category*,
//   body, status (게시|임시저장|예약),
//   scheduledPublishAt (ISO 8601, status=예약 시 필수),
//   author, authorEmail (author만 있으면 DB에서 자동 조회),
//   thumbnail, thumbnailAlt, tags, summary,
//   slug, metaDescription, sourceUrl, date, id
// }
// ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "API 키가 필요합니다. Authorization: Bearer <key>" }, { status: 401 });
  }

  try {
    const data = await req.json();

    if (!data.title?.trim())    return NextResponse.json({ success: false, error: "title은 필수입니다." }, { status: 400 });
    if (!data.category?.trim()) return NextResponse.json({ success: false, error: "category는 필수입니다." }, { status: 400 });

    const VALID_STATUSES = ["게시", "임시저장", "예약"] as const;
    const status = VALID_STATUSES.includes(data.status) ? data.status : "임시저장";

    // 예약 상태이면 scheduledPublishAt 필수 검증
    if (status === "예약") {
      if (!data.scheduledPublishAt) {
        return NextResponse.json({ success: false, error: "status가 '예약'이면 scheduledPublishAt (ISO 8601)이 필요합니다." }, { status: 400 });
      }
      if (isNaN(Date.parse(data.scheduledPublishAt))) {
        return NextResponse.json({ success: false, error: "scheduledPublishAt 형식이 올바르지 않습니다. (예: 2026-03-10T09:00:00)" }, { status: 400 });
      }
    }

    // 기자명으로 이메일 자동 조회 (authorEmail이 없을 때)
    const authorName = (data.author ?? "").trim();
    let authorEmail = (data.authorEmail ?? "").trim();
    if (authorName && !authorEmail) {
      authorEmail = await findReporterEmail(authorName);
    }

    const article: Article = {
      id:              data.id        || `api_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title:           data.title.trim(),
      category:        data.category.trim(),
      date:            data.date      || new Date().toISOString(),
      status,
      views:           0,
      body:            data.body           ?? "",
      thumbnail:       data.thumbnail      ?? "",
      thumbnailAlt:    data.thumbnailAlt   ?? "",
      tags:            data.tags           ?? "",
      author:          authorName,
      authorEmail,
      summary:         data.summary        ?? "",
      slug:            data.slug           ?? "",
      metaDescription: data.metaDescription ?? "",
      sourceUrl:       data.sourceUrl      ?? "",
      scheduledPublishAt: status === "예약" ? data.scheduledPublishAt : undefined,
      updatedAt:       new Date().toISOString(),
    };

    await serverCreateArticle(article);

    // 생성 후 DB에서 다시 읽어 no(일련번호)를 포함한 최신 데이터 반환
    const saved = await serverGetArticleById(article.id);

    return NextResponse.json(
      { success: true, id: article.id, no: saved?.no ?? null, article: saved ?? article },
      { status: 201 },
    );
  } catch (e) {
    console.error("[v1/articles] POST error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
