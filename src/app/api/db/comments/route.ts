import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { Comment } from "@/types/article";
import { serverGetSetting, serverSaveSetting } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { getBaseUrl } from "@/lib/get-base-url";

// ── Supabase 직접 쿼리 헬퍼 ──
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders(write = false) {
  const key = write && SB_SERVICE ? SB_SERVICE : (SB_ANON ?? "");
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: write ? "return=representation" : "return=representation",
  };
}

// comments 테이블 사용 가능 여부 캐시 (한 번 확인 후 유지)
let useTable: boolean | null = null;
async function isTableMode(): Promise<boolean> {
  if (useTable !== null) return useTable;
  if (!SB_URL || !SB_SERVICE) { useTable = false; return false; }
  try {
    const res = await fetch(`${SB_URL}/rest/v1/comments?select=id&limit=0`, {
      headers: sbHeaders(true),
    });
    useTable = res.ok;
  } catch { useTable = false; }
  return useTable;
}

// DB row → Comment 타입 변환
function rowToComment(r: Record<string, unknown>): Comment {
  return {
    id: r.id as string,
    articleId: r.article_id as string,
    articleTitle: (r.article_title as string) || undefined,
    author: r.author as string,
    content: r.content as string,
    createdAt: r.created_at as string,
    status: r.status as Comment["status"],
    ip: (r.ip as string) || undefined,
    parentId: (r.parent_id as string) || undefined,
  };
}

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

function checkCommentRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (commentRateMap.get(ip) ?? []).filter((t) => now - t < COMMENT_WINDOW_MS);
  if (timestamps.length >= COMMENT_LIMIT) {
    console.warn(`[security] 댓글 Rate Limit 초과: ip=${ip.slice(0, 8)}***, count=${timestamps.length}`);
    return false;
  }
  timestamps.push(now);
  commentRateMap.set(ip, timestamps);
  // 주기적 만료 정리
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

    if (await isTableMode()) {
      // Supabase 테이블 직접 쿼리
      let url = `${SB_URL}/rest/v1/comments?order=created_at.desc`;
      if (articleId) {
        url += `&article_id=eq.${encodeURIComponent(articleId)}`;
        if (!isAdmin) url += `&status=eq.approved`;
      } else if (!isAdmin) {
        url += `&status=eq.approved`;
      }
      // 관리자는 service key (전체 조회), 일반은 anon key (RLS 적용)
      const res = await fetch(url, { headers: sbHeaders(isAdmin), next: { tags: ["comments"] } });
      if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
      const rows = (await res.json()) as Record<string, unknown>[];
      const comments = rows.map(rowToComment);
      return NextResponse.json({ success: true, comments: isAdmin ? comments : comments.map(stripIp) });
    }

    // JSON 폴백
    const all = await serverGetSetting<Comment[]>("cp-comments", []);
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

    if (!articleId || typeof articleId !== "string" || !author?.trim() || !content?.trim()) {
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
    if (!checkCommentRateLimit(ip)) {
      return NextResponse.json({ success: false, error: "댓글을 너무 많이 작성했습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
    }

    if (await isTableMode()) {
      // Supabase 테이블에 직접 삽입
      const row = {
        article_id: articleId,
        article_title: typeof articleTitle === "string" ? articleTitle.trim().slice(0, 100) : null,
        author: sanitizedAuthor,
        content: sanitizedContent,
        status: "pending",
        ip,
        parent_id: parentId || null,
      };
      const res = await fetch(`${SB_URL}/rest/v1/comments`, {
        method: "POST",
        headers: sbHeaders(true),
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        console.error("[DB] POST comment to table failed:", await res.text());
        throw new Error("댓글 저장 실패");
      }
      revalidateTag("comments");
      return NextResponse.json({ success: true, message: "댓글이 등록되었습니다. 관리자 승인 후 게시됩니다." });
    }

    // JSON 폴백
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
    const { sbGetSetting } = await import("@/lib/supabase-server-db");
    const all = await sbGetSetting<Comment[]>("cp-comments", []);
    await serverSaveSetting("cp-comments", [...all, newComment]);
    revalidateTag("setting:cp-comments");
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

    if (await isTableMode()) {
      const res = await fetch(`${SB_URL}/rest/v1/comments?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...sbHeaders(true), Prefer: "return=minimal" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("상태 변경 실패");
      revalidateTag("comments");
      return NextResponse.json({ success: true });
    }

    // JSON 폴백
    const { sbGetSetting } = await import("@/lib/supabase-server-db");
    const all = await sbGetSetting<Comment[]>("cp-comments", []);
    await serverSaveSetting("cp-comments", all.map((c) => (c.id === id ? { ...c, status } : c)));
    revalidateTag("setting:cp-comments");
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

    if (await isTableMode()) {
      const res = await fetch(`${SB_URL}/rest/v1/comments?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { ...sbHeaders(true), Prefer: "return=minimal" },
      });
      if (!res.ok) throw new Error("삭제 실패");
      revalidateTag("comments");
      return NextResponse.json({ success: true });
    }

    // JSON 폴백
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
