/**
 * 외부 기사 API v1
 * GET  /api/v1/articles  → 기사 목록 (페이지네이션)
 * POST /api/v1/articles  → 기사 생성
 *
 * 인증: Authorization: Bearer <api_key>
 */
import { NextRequest, NextResponse } from "next/server";
import type { Article } from "@/types/article";
import { serverGetArticles, serverCreateArticle } from "@/lib/db-server";
import { verifyApiKey } from "@/lib/api-key";
import { verifyAuthToken } from "@/lib/cookie-auth";

async function authenticate(req: NextRequest): Promise<boolean> {
  if (await verifyApiKey(req.headers.get("authorization"))) return true;
  // 관리자 쿠키도 허용 (어드민 직접 테스트용)
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
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
// Body: { title, category, body, status?, thumbnail?, tags?, author?, summary?, slug?, sourceUrl?, date? }
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

    const article: Article = {
      id:             data.id        || `api_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title:          data.title.trim(),
      category:       data.category.trim(),
      date:           data.date      || new Date().toISOString(),
      status,
      views:          0,
      body:           data.body           ?? "",
      thumbnail:      data.thumbnail      ?? "",
      thumbnailAlt:   data.thumbnailAlt   ?? "",
      tags:           data.tags           ?? "",
      author:         data.author         ?? "",
      authorEmail:    data.authorEmail    ?? "",
      summary:        data.summary        ?? "",
      slug:           data.slug           ?? "",
      metaDescription: data.metaDescription ?? "",
      sourceUrl:      data.sourceUrl      ?? "",
      updatedAt:      new Date().toISOString(),
    };

    await serverCreateArticle(article);
    return NextResponse.json({ success: true, id: article.id, article }, { status: 201 });
  } catch (e) {
    console.error("[v1/articles] POST error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
