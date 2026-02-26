import { NextRequest, NextResponse } from "next/server";
import type { Comment } from "@/types/article";

async function getDB() {
  if (process.env.PHP_API_URL) {
    const { dbGetSetting, dbSaveSetting } = await import("@/lib/php-api-db");
    return { dbGetSetting, dbSaveSetting };
  }
  if (process.env.MYSQL_DATABASE) {
    const { dbGetSetting, dbSaveSetting } = await import("@/lib/mysql-db");
    return { dbGetSetting, dbSaveSetting };
  }
  const { fileGetSetting, fileSaveSetting } = await import("@/lib/file-db");
  return { dbGetSetting: fileGetSetting, dbSaveSetting: fileSaveSetting };
}

// GET /api/db/comments?articleId=xxx  → 승인된 댓글 목록
// GET /api/db/comments                → 전체 (어드민용)
export async function GET(request: NextRequest) {
  try {
    const { dbGetSetting } = await getDB();
    const articleId = request.nextUrl.searchParams.get("articleId");
    const all = await dbGetSetting<Comment[]>("cp-comments", []);
    const comments = articleId
      ? all.filter((c) => c.articleId === articleId && c.status === "approved")
      : all;
    return NextResponse.json({ success: true, comments });
  } catch (e) {
    console.error("[DB] GET comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/comments { articleId, author, content }  → 댓글 등록 (pending)
export async function POST(request: NextRequest) {
  try {
    const { dbGetSetting, dbSaveSetting } = await getDB();
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

    const all = await dbGetSetting<Comment[]>("cp-comments", []);
    all.push(newComment);
    await dbSaveSetting("cp-comments", all);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] POST comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PATCH /api/db/comments { id, status }  → 어드민 승인/거절
export async function PATCH(request: NextRequest) {
  try {
    const { dbGetSetting, dbSaveSetting } = await getDB();
    const { id, status } = await request.json();
    if (!id || !["approved", "pending"].includes(status)) {
      return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
    }
    const all = await dbGetSetting<Comment[]>("cp-comments", []);
    const updated = all.map((c) => (c.id === id ? { ...c, status } : c));
    await dbSaveSetting("cp-comments", updated);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PATCH comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/db/comments?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const { dbGetSetting, dbSaveSetting } = await getDB();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
    const all = await dbGetSetting<Comment[]>("cp-comments", []);
    await dbSaveSetting("cp-comments", all.filter((c) => c.id !== id));
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
