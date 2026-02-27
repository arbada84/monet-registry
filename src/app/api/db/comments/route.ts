import { NextRequest, NextResponse } from "next/server";
import type { Comment } from "@/types/article";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";

// GET /api/db/comments?articleId=xxx  → 승인된 댓글 목록 (공개)
// GET /api/db/comments                → 전체 (어드민 인증 필요, 미인증 시 승인된 것만)
export async function GET(request: NextRequest) {
  try {
    const articleId = request.nextUrl.searchParams.get("articleId");
    const all = await serverGetSetting<Comment[]>("cp-comments", []);

    if (articleId) {
      const comments = all.filter((c) => c.articleId === articleId && c.status === "approved");
      return NextResponse.json({ success: true, comments });
    }

    // 전체 조회: 관리자만 미승인 포함, 일반 요청은 승인된 것만
    const cookie = request.cookies.get("cp-admin-auth");
    const isAdmin = await verifyAuthToken(cookie?.value ?? "");
    const comments = isAdmin ? all : all.filter((c) => c.status === "approved");
    return NextResponse.json({ success: true, comments });
  } catch (e) {
    console.error("[DB] GET comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/comments { articleId, author, content }  → 댓글 등록 (pending)
export async function POST(request: NextRequest) {
  try {
    const { articleId, author, content } = await request.json();

    if (!articleId || !author?.trim() || !content?.trim()) {
      return NextResponse.json({ success: false, error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }
    if (author.trim().length > 20) {
      return NextResponse.json({ success: false, error: "닉네임은 20자 이하여야 합니다." }, { status: 400 });
    }
    if (content.trim().length > 500) {
      return NextResponse.json({ success: false, error: "댓글은 500자 이하여야 합니다." }, { status: 400 });
    }

    const newComment: Comment = {
      id: crypto.randomUUID(),
      articleId,
      author: author.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
      status: "pending",
    };

    const all = await serverGetSetting<Comment[]>("cp-comments", []);
    all.push(newComment);
    await serverSaveSetting("cp-comments", all);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PATCH /api/db/comments { id, status }  → 어드민 승인/거절
export async function PATCH(request: NextRequest) {
  try {
    const { id, status } = await request.json();
    if (!id || !["approved", "pending"].includes(status)) {
      return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
    }
    const all = await serverGetSetting<Comment[]>("cp-comments", []);
    const updated = all.map((c) => (c.id === id ? { ...c, status } : c));
    await serverSaveSetting("cp-comments", updated);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PATCH comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/comments?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    const all = await serverGetSetting<Comment[]>("cp-comments", []);
    await serverSaveSetting("cp-comments", all.filter((c) => c.id !== id));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
