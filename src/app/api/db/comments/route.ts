import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { Comment } from "@/types/article";
import {
  serverCreateComment,
  serverDeleteComment,
  serverGetComments,
  serverGetSetting,
  serverUpdateCommentStatus,
} from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { getBaseUrl } from "@/lib/get-base-url";
import { sanitizeCommentText } from "@/lib/comment-sanitize";
import { checkRateLimit as redisCheckRateLimit } from "@/lib/redis";

// XSS 방어: HTML 태그 제거 + 엔티티 디코드 후 재제거 + 특수문자 이스케이프
function sanitizeText(raw: string): string {
  return sanitizeCommentText(raw);
}

// 댓글 Rate Limiting: IP당 10분에 5개
const COMMENT_LIMIT = 5;

async function checkCommentRateLimit(ip: string): Promise<boolean> {
  const allowed = await redisCheckRateLimit(ip, "cp:comment:rate:", COMMENT_LIMIT, 600, {
    failClosedInProduction: true,
    context: "comments",
  });
  if (!allowed) {
    console.warn(`[security] 댓글 Rate Limit 초과: ip=${ip.slice(0, 8)}***`);
  }
  return allowed;
}

// ip 필드 제거 (비인증 사용자 개인정보 보호)
function stripIp(c: Comment) {
  const { ip, ...rest } = c as Comment & { ip?: string };
  return rest;
}

// ── GET ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const articleId = request.nextUrl.searchParams.get("articleId");
    const cookie = request.cookies.get("cp-admin-auth");
    const { valid: isAdmin } = await verifyAuthToken(cookie?.value ?? "");

    const comments = await serverGetComments({
      articleId: articleId || undefined,
      isAdmin,
    });
    return NextResponse.json({
      success: true,
      comments: isAdmin ? comments : comments.map(stripIp),
    });
  } catch (e) {
    console.error("[DB] GET comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // CSRF 방어
    const origin = request.headers.get("origin") || request.headers.get("referer");
    if (!origin) {
      return NextResponse.json({ success: false, error: "출처 정보가 필요합니다." }, { status: 403 });
    }
    const siteUrl = getBaseUrl();
    const allowedHosts = [
      siteUrl,
      ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:3001"] : []),
    ].filter(Boolean);
    if (!allowedHosts.some((h) => origin === h || origin.startsWith(h + "/"))) {
      return NextResponse.json({ success: false, error: "허용되지 않은 출처입니다." }, { status: 403 });
    }

    const { articleId, author, content, articleTitle, parentId } = await request.json();

    if (!articleId || typeof articleId !== "string" || !articleId.trim() || articleId.length > 200 || !author?.trim() || !content?.trim()) {
      return NextResponse.json({ success: false, error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }
    const sanitizedContent = sanitizeText(content);
    const sanitizedAuthor = sanitizeText(author);
    if (sanitizedAuthor.length > 20) {
      return NextResponse.json({ success: false, error: "닉네임은 20자 이하여야 합니다." }, { status: 400 });
    }
    if (sanitizedContent.length > 500) {
      return NextResponse.json({ success: false, error: "댓글은 500자 이하여야 합니다." }, { status: 400 });
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (parentId !== undefined && (typeof parentId !== "string" || !UUID_RE.test(parentId))) {
      return NextResponse.json({ success: false, error: "잘못된 parentId입니다." }, { status: 400 });
    }

    // 댓글 기능 활성화 여부
    const commentSettings = await serverGetSetting<{ enabled: boolean }>("cp-comment-settings", { enabled: true });
    if (!commentSettings.enabled) {
      return NextResponse.json({ success: false, error: "댓글 기능이 비활성화되었습니다." }, { status: 403 });
    }

    // IP 추출 + 차단 검사
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const blockedIps = await serverGetSetting<string[]>("cp-blocked-ips", []);
    if (blockedIps.includes(ip)) {
      console.warn(`[security] 차단 IP 댓글 시도: ip=${ip.slice(0, 8)}***`);
      return NextResponse.json({ success: false, error: "댓글 작성이 제한되었습니다." }, { status: 403 });
    }

    // Rate Limiting
    if (!await checkCommentRateLimit(ip)) {
      return NextResponse.json({ success: false, error: "댓글을 너무 많이 작성했습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
    }

    await serverCreateComment({
      articleId,
      articleTitle: typeof articleTitle === "string" ? articleTitle.trim().slice(0, 100) : undefined,
      author: sanitizedAuthor,
      content: sanitizedContent,
      status: "pending",
      ip,
      parentId: parentId || undefined,
    });
    revalidateTag("comments");
    return NextResponse.json({ success: true, message: "댓글이 등록되었습니다. 관리자 승인 후 게시됩니다." });
  } catch (e) {
    console.error("[DB] POST comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── PATCH (승인/거절) ────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const cookie = request.cookies.get("cp-admin-auth");
    const { valid: isAdmin } = await verifyAuthToken(cookie?.value ?? "");
    if (!isAdmin) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });

    const { id, status } = await request.json();
    if (!id || !["approved", "pending", "spam"].includes(status)) {
      return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
    }

    await serverUpdateCommentStatus(id, status);
    revalidateTag("comments");
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] PATCH comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── DELETE ───────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const cookie = request.cookies.get("cp-admin-auth");
    const { valid: isAdmin } = await verifyAuthToken(cookie?.value ?? "");
    if (!isAdmin) return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "댓글 ID가 필요합니다." }, { status: 400 });

    await serverDeleteComment(id);
    revalidateTag("comments");
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
