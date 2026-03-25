import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { Comment } from "@/types/article";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { getBaseUrl } from "@/lib/get-base-url";

// XSS 방어: HTML 태그 제거 + 엔티티 디코드 후 재제거 + 특수문자 이스케이프
function sanitizeText(raw: string): string {
  // 1차: HTML 태그 제거
  let text = raw.replace(/<[^>]*>/g, "");
  // 2차: HTML 엔티티 디코드 후 다시 태그 제거 (이중 인코딩 방어)
  text = text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  text = text.replace(/<[^>]*>/g, "");
  // 3차: 출력용 이스케이프
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  return text.trim();
}

// 댓글 Rate Limiting: IP당 10분에 5개
const COMMENT_LIMIT = 5;
const COMMENT_WINDOW_MS = 10 * 60 * 1000;
const commentRateMap = new Map<string, number[]>(); // ip → timestamp[]
let lastRateCleanup = Date.now();

// GET /api/db/comments?articleId=xxx  → 승인된 댓글 목록 (공개)
// GET /api/db/comments                → 전체 (어드민 인증 필요, 미인증 시 승인된 것만)
export async function GET(request: NextRequest) {
  try {
    const articleId = request.nextUrl.searchParams.get("articleId");
    const all = await serverGetSetting<Comment[]>("cp-comments", []);

    // 전체 조회: 관리자만 미승인 포함, 일반 요청은 승인된 것만
    const cookie = request.cookies.get("cp-admin-auth");
    const { valid: isAdmin } = await verifyAuthToken(cookie?.value ?? "");

    // 비인증 사용자에게는 ip 필드 제거 (개인정보 보호)
    const stripIp = (c: Comment) => {
      const { ip, ...rest } = c as Comment & { ip?: string };
      return rest;
    };

    if (articleId) {
      const comments = all.filter((c) => c.articleId === articleId && c.status === "approved");
      return NextResponse.json({ success: true, comments: isAdmin ? comments : comments.map(stripIp) });
    }

    const comments = isAdmin ? all : all.filter((c) => c.status === "approved").map(stripIp);
    return NextResponse.json({ success: true, comments });
  } catch (e) {
    console.error("[DB] GET comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/db/comments { articleId, author, content }  → 댓글 등록 (pending)
export async function POST(request: NextRequest) {
  try {
    // CSRF 방어: Origin 또는 Referer 헤더로 자사 도메인 검증 (필수)
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

    if (!articleId || typeof articleId !== "string" || !author?.trim() || !content?.trim()) {
      return NextResponse.json({ success: false, error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }
    // XSS 방어: HTML 태그 제거 + 이중 인코딩 방어 + 이스케이프
    const sanitizedContent = sanitizeText(content);
    const sanitizedAuthor = sanitizeText(author);
    if (sanitizedAuthor.length > 20) {
      return NextResponse.json({ success: false, error: "닉네임은 20자 이하여야 합니다." }, { status: 400 });
    }
    if (sanitizedContent.length > 500) {
      return NextResponse.json({ success: false, error: "댓글은 500자 이하여야 합니다." }, { status: 400 });
    }
    // parentId 유효성 검사 (UUID 또는 undefined)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (parentId !== undefined && (typeof parentId !== "string" || !UUID_RE.test(parentId))) {
      return NextResponse.json({ success: false, error: "잘못된 parentId입니다." }, { status: 400 });
    }

    // 댓글 기능 활성화 여부 확인
    const commentSettings = await serverGetSetting<{ enabled: boolean }>("cp-comment-settings", { enabled: true });
    if (!commentSettings.enabled) {
      return NextResponse.json({ success: false, error: "댓글 기능이 비활성화되었습니다." }, { status: 403 });
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
    // 주기적 만료 정리 (2분 간격 또는 200개 초과 시)
    if (now - lastRateCleanup > 120_000 || commentRateMap.size > 200) {
      lastRateCleanup = now;
      for (const [k, ts] of commentRateMap) {
        const fresh = ts.filter((t) => now - t < COMMENT_WINDOW_MS);
        if (fresh.length === 0) commentRateMap.delete(k);
        else commentRateMap.set(k, fresh);
      }
      // 상한선 방어: TTL 정리 후에도 500개 초과 시 오래된 순 제거
      if (commentRateMap.size > 500) {
        const entries = [...commentRateMap.entries()]
          .map(([k, ts]) => [k, Math.max(...ts)] as [string, number])
          .sort((a, b) => a[1] - b[1]);
        const toRemove = entries.slice(0, entries.length - 500);
        for (const [k] of toRemove) commentRateMap.delete(k);
      }
    }

    const newComment: Comment = {
      id: crypto.randomUUID(),
      articleId,
      articleTitle: typeof articleTitle === "string" ? articleTitle.trim().slice(0, 100) : undefined,
      author: sanitizedAuthor,
      content: sanitizedContent,
      createdAt: new Date().toISOString(),
      status: "pending",
      ip,
      ...(parentId ? { parentId } : {}),
    };

    // 캐시 우회: 최신 데이터로 read-modify-write
    const { sbGetSetting } = await import("@/lib/supabase-server-db");
    const all = await sbGetSetting<Comment[]>("cp-comments", []);
    const updated = [...all, newComment];
    await serverSaveSetting("cp-comments", updated);
    revalidateTag("setting:cp-comments");

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
    // 캐시 우회: 최신 데이터로 read-modify-write
    const { sbGetSetting } = await import("@/lib/supabase-server-db");
    const all = await sbGetSetting<Comment[]>("cp-comments", []);
    const updated = all.map((c) => (c.id === id ? { ...c, status } : c));
    await serverSaveSetting("cp-comments", updated);
    revalidateTag("setting:cp-comments");
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
    // 캐시 우회: 최신 데이터로 read-modify-write
    const { sbGetSetting } = await import("@/lib/supabase-server-db");
    const all = await sbGetSetting<Comment[]>("cp-comments", []);
    await serverSaveSetting("cp-comments", all.filter((c) => c.id !== id));
    revalidateTag("setting:cp-comments");
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DB] DELETE comments error:", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
