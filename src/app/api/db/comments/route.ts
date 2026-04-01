import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { Comment } from "@/types/article";
import { serverGetSetting } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { getBaseUrl } from "@/lib/get-base-url";
import { redis, checkRateLimit as redisCheckRateLimit } from "@/lib/redis";
import {
  sbGetComments,
  sbCreateComment,
  sbUpdateCommentStatus,
  sbDeleteComment,
} from "@/lib/supabase-server-db";

// XSS 방어: HTML 태그 제거 + 엔티티 디코드 후 재제거 + 특수문자 이스케이프
function sanitizeText(raw: string): string {
  let text = raw.replace(/<[^>]*>/g, "");
  text = text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  text = text.replace(/<[^>]*>/g, "");
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  return text.trim();
}

// 댓글 Rate Limiting: IP당 10분에 5개
const COMMENT_LIMIT = 5;
const COMMENT_WINDOW_MS = 10 * 60 * 1000;
const commentRateMap = new Map<string, number[]>();
let lastRateCleanup = Date.now();

async function checkCommentRateLimit(ip: string): Promise<boolean> {
  // Redis 기반 Rate Limiting (서버리스 콜드스타트 후에도 유지)
  if (redis) {
    const allowed = await redisCheckRateLimit(ip, "cp:comment:rate:", COMMENT_LIMIT, 600);
    if (!allowed) {
      console.warn(`[security] 댓글 Rate Limit 초과: ip=${ip.slice(0, 8)}***`);
    }
    return allowed;
  }
  // 인메모리 폴백 (개발환경용)
  const now = Date.now();
  const timestamps = (commentRateMap.get(ip) ?? []).filter((t) => now - t < COMMENT_WINDOW_MS);
  if (timestamps.length >= COMMENT_LIMIT) {
    console.warn(`[security] 댓글 Rate Limit 초과: ip=${ip.slice(0, 8)}***, count=${timestamps.length}`);
    return false;
  }
  timestamps.push(now);
  commentRateMap.set(ip, timestamps);
  if (now - lastRateCleanup > 120_000 || commentRateMap.size > 200) {
    lastRateCleanup = now;
    for (const [k, ts] of commentRateMap) {
      const fresh = ts.filter((t) => now - t < COMMENT_WINDOW_MS);
      if (fresh.length === 0) commentRateMap.delete(k);
      else commentRateMap.set(k, fresh);
    }
    if (commentRateMap.size > 500) {
      const entries = [...commentRateMap.entries()]
        .map(([k, ts]) => [k, Math.max(...ts)] as [string, number])
        .sort((a, b) => a[1] - b[1]);
      const toRemove = entries.slice(0, entries.length - 500);
      for (const [k] of toRemove) commentRateMap.delete(k);
    }
  }
  return true;
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

    const comments = await sbGetComments({
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

    await sbCreateComment({
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

    await sbUpdateCommentStatus(id, status);
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

    await sbDeleteComment(id);
    revalidateTag("comments");
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
