import { NextRequest, NextResponse } from "next/server";
import type { Comment } from "@/types/article";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";

// 댓글 Rate Limiting: IP당 10분에 5개
const COMMENT_LIMIT = 5;
const COMMENT_WINDOW_MS = 10 * 60 * 1000;
const commentRateMap = new Map<string, number[]>(); // ip → timestamp[]

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
    const { valid: isAdmin } = await verifyAuthToken(cookie?.value ?? "");
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
    // CSRF 방어: Origin 헤더가 있으면 자사 도메인인지 확인
    const origin = request.headers.get("origin");
    if (origin) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
      const allowedHosts = [
        siteUrl,
        // 로컬 개발: 프로덕션에서는 포함되지 않음
        ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:3001"] : []),
      ].filter(Boolean);
      if (!allowedHosts.some((h) => origin === h)) {
        return NextResponse.json({ success: false, error: "허용되지 않은 출처입니다." }, { status: 403 });
      }
    }

    const { articleId, author, content, articleTitle, parentId } = await request.json();

    if (!articleId || typeof articleId !== "string" || !author?.trim() || !content?.trim()) {
      return NextResponse.json({ success: false, error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }
    if (author.trim().length > 20) {
      return NextResponse.json({ success: false, error: "닉네임은 20자 이하여야 합니다." }, { status: 400 });
    }
    if (content.trim().length > 500) {
      return NextResponse.json({ success: false, error: "댓글은 500자 이하여야 합니다." }, { status: 400 });
    }
    // parentId 유효성 검사 (UUID 또는 undefined)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (parentId !== undefined && (typeof parentId !== "string" || !UUID_RE.test(parentId))) {
      return NextResponse.json({ success: false, error: "잘못된 parentId입니다." }, { status: 400 });
    }

    // 요청자 IP 추출 (Vercel: x-forwarded-for, 로컬: x-real-ip)
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // 차단된 IP 검사
    const blockedIps = await serverGetSetting<string[]>("cp-blocked-ips", []);
    if (blockedIps.includes(ip)) {
      return NextResponse.json({ success: false, error: "댓글 작성이 제한되었습니다." }, { status: 403 });
    }

    // Rate Limiting: IP당 10분에 최대 5개
    const now = Date.now();
    const timestamps = (commentRateMap.get(ip) ?? []).filter((t) => now - t < COMMENT_WINDOW_MS);
    if (timestamps.length >= COMMENT_LIMIT) {
      return NextResponse.json({ success: false, error: "댓글을 너무 많이 작성했습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
    }
    timestamps.push(now);
    commentRateMap.set(ip, timestamps);
    // Map 크기 관리: 5,000 초과 시 만료된 IP 정리
    if (commentRateMap.size > 5_000) {
      const oneHourAgo = now - 60 * 60 * 1000;
      for (const [k, ts] of commentRateMap.entries()) {
        if (!ts.some((t) => t > oneHourAgo)) commentRateMap.delete(k);
      }
      // 여전히 크면 가장 오래된 1,000개 강제 삭제
      if (commentRateMap.size > 5_000) {
        let removed = 0;
        for (const k of commentRateMap.keys()) {
          commentRateMap.delete(k);
          if (++removed >= 1_000) break;
        }
      }
    }

    const newComment: Comment = {
      id: crypto.randomUUID(),
      articleId,
      articleTitle: typeof articleTitle === "string" ? articleTitle.trim().slice(0, 100) : undefined,
      author: author.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
      status: "pending",
      ip,
      ...(parentId ? { parentId } : {}),
    };

    const all = await serverGetSetting<Comment[]>("cp-comments", []);
    all.push(newComment);
    await serverSaveSetting("cp-comments", all);

    return NextResponse.json({ success: true, message: "댓글이 등록되었습니다. 관리자 승인 후 게시됩니다." });
  } catch (e) {
    console.error("[DB] POST comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// PATCH /api/db/comments { id, status }  → 어드민 승인/거절
export async function PATCH(request: NextRequest) {
  try {
    const cookie = request.cookies.get("cp-admin-auth");
    const { valid: isAdmin } = await verifyAuthToken(cookie?.value ?? "");
    if (!isAdmin) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });

    const { id, status } = await request.json();
    if (!id || !["approved", "pending", "spam"].includes(status)) {
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
    const cookie = request.cookies.get("cp-admin-auth");
    const { valid: isAdmin } = await verifyAuthToken(cookie?.value ?? "");
    if (!isAdmin) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });

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
