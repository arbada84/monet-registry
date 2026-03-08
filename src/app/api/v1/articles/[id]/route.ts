/**
 * 외부 기사 API v1 — 단건 조회·수정·삭제
 * GET    /api/v1/articles/:id
 * PUT    /api/v1/articles/:id
 * DELETE /api/v1/articles/:id
 *
 * 인증: Authorization: Bearer <api_key>
 */
import { NextRequest, NextResponse } from "next/server";
import { serverGetArticleById, serverUpdateArticle, serverDeleteArticle, serverGetSetting } from "@/lib/db-server";
import { verifyApiKey } from "@/lib/api-key";
import { verifyAuthToken } from "@/lib/cookie-auth";

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

async function authenticate(req: NextRequest): Promise<boolean> {
  if (await verifyApiKey(req.headers.get("authorization"))) return true;
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/articles/:id
export async function GET(req: NextRequest, ctx: Ctx) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "API 키가 필요합니다." }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const article = await serverGetArticleById(id);
    if (!article) return NextResponse.json({ success: false, error: "기사를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ success: true, article });
  } catch (e) {
    console.error("[v1/articles/:id] GET error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}

// PUT /api/v1/articles/:id — 부분 업데이트
export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "API 키가 필요합니다." }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const existing = await serverGetArticleById(id);
    if (!existing) return NextResponse.json({ success: false, error: "기사를 찾을 수 없습니다." }, { status: 404 });

    const updates = await req.json();

    // status 유효성 검사
    if (updates.status) {
      const VALID = ["게시", "임시저장", "예약"];
      if (!VALID.includes(updates.status)) {
        return NextResponse.json({ success: false, error: "올바르지 않은 status 값입니다. (게시|임시저장|예약)" }, { status: 400 });
      }
    }

    // 예약 상태 전환 시 scheduledPublishAt 필수
    if (updates.status === "예약") {
      const scheduled = updates.scheduledPublishAt ?? existing.scheduledPublishAt;
      if (!scheduled || isNaN(Date.parse(scheduled))) {
        return NextResponse.json({ success: false, error: "status가 '예약'이면 scheduledPublishAt (ISO 8601)이 필요합니다." }, { status: 400 });
      }
    }

    // 기자명 변경 시 이메일 자동 갱신 (authorEmail이 함께 오지 않은 경우)
    if (updates.author !== undefined && !updates.authorEmail) {
      const name = (updates.author ?? "").trim();
      updates.authorEmail = name ? await findReporterEmail(name) : "";
    }

    // id, no, views 등 시스템 필드는 외부에서 변경 불가
    const { id: _id, no: _no, views: _views, ...safeUpdates } = updates;
    void _id; void _no; void _views;

    await serverUpdateArticle(id, { ...safeUpdates, updatedAt: new Date().toISOString() });
    const updated = await serverGetArticleById(id);
    return NextResponse.json({ success: true, no: updated?.no ?? null, article: updated });
  } catch (e) {
    console.error("[v1/articles/:id] PUT error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}

// DELETE /api/v1/articles/:id
export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "API 키가 필요합니다." }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const existing = await serverGetArticleById(id);
    if (!existing) return NextResponse.json({ success: false, error: "기사를 찾을 수 없습니다." }, { status: 404 });

    await serverDeleteArticle(id);
    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("[v1/articles/:id] DELETE error:", e);
    return NextResponse.json({ success: false, error: "서버 오류" }, { status: 500 });
  }
}
