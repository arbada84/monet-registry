/**
 * 서버 컴포넌트 전용 DB 접근 레이어
 * "use client" 파일에서는 import 불가 — 서버 컴포넌트/API 라우트 전용
 *
 * 우선순위:
 *   1. NEXT_PUBLIC_SUPABASE_URL → Supabase (Vercel 배포 기본)
 *   2. MYSQL_DATABASE → MySQL 직접 접속 (로컬 개발)
 *   3. 없으면 → data/ 폴더 JSON 파일 DB (로컬 개발 최후 폴백)
 */
import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { parseTags } from "./html-utils";
import type { Article, ViewLogEntry, DistributeLog } from "@/types/article";

// supabase-server-db.ts 에서도 동일 함수 export — 항상 동일 로직 유지
const isSupabaseEnabled = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const isMySQLEnabled   = () => Boolean(process.env.MYSQL_DATABASE);

// ── Articles ─────────────────────────────────────────────

export async function serverGetArticles(): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetArticles } = await import("@/lib/supabase-server-db");
      return await sbGetArticles();
    } catch { /* Supabase 실패 시 다음으로 */ }
  }
  if (isMySQLEnabled()) {
    const { dbGetArticles } = await import("@/lib/mysql-db");
    return dbGetArticles();
  }
  const { fileGetArticles } = await import("@/lib/file-db");
  return fileGetArticles();
}

export async function serverGetArticlesByCategory(category: string): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetArticlesByCategory } = await import("@/lib/supabase-server-db");
      return await sbGetArticlesByCategory(category);
    } catch { /* 폴백 */ }
  }
  const all = await serverGetArticles();
  return all.filter((a) => a.category === category && a.status === "게시");
}

export async function serverGetArticlesByTag(tag: string): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetArticlesByTag } = await import("@/lib/supabase-server-db");
      return await sbGetArticlesByTag(tag);
    } catch { /* 폴백 */ }
  }
  // MySQL/file-db 폴백: 전체 조회 후 메모리 필터링
  const all = await serverGetArticles();
  return all.filter(
    (a) =>
      a.status === "게시" &&
      parseTags(a.tags).includes(tag)
  );
}

export async function serverSearchArticles(query: string): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbSearchArticles } = await import("@/lib/supabase-server-db");
      return await sbSearchArticles(query);
    } catch { /* 폴백 */ }
  }
  // MySQL/file-db 폴백: body 포함 전체 조회 후 메모리 검색
  let all: Article[];
  if (isMySQLEnabled()) {
    const { dbGetArticles } = await import("@/lib/mysql-db");
    all = await dbGetArticles();
  } else {
    const { fileGetArticles } = await import("@/lib/file-db");
    all = await fileGetArticles();
  }
  const q = query.toLowerCase();
  return all.filter(
    (a) =>
      a.status === "게시" &&
      (a.title.toLowerCase().includes(q) ||
        (a.summary || "").toLowerCase().includes(q) ||
        (a.tags || "").toLowerCase().includes(q) ||
        (a.body || "").replace(/<[^>]*>/g, "").toLowerCase().includes(q))
  );
}

export async function serverGetArticleById(id: string): Promise<Article | null> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetArticleById } = await import("@/lib/supabase-server-db");
      return await sbGetArticleById(id);
    } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) {
    const { dbGetArticleById } = await import("@/lib/mysql-db");
    return dbGetArticleById(id);
  }
  const { fileGetArticleById } = await import("@/lib/file-db");
  return fileGetArticleById(id);
}

export async function serverGetArticleByNo(no: number): Promise<Article | null> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetArticleByNo } = await import("@/lib/supabase-server-db");
      return await sbGetArticleByNo(no);
    } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) {
    const { dbGetArticleByNo } = await import("@/lib/mysql-db");
    return dbGetArticleByNo(no);
  }
  const { fileGetArticleByNo } = await import("@/lib/file-db");
  return fileGetArticleByNo(no);
}

/** 게시 상태 기사만 (body 제외) — 홈/기자/외부API용 */
export async function serverGetPublishedArticles(): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetPublishedArticles } = await import("@/lib/supabase-server-db");
      return await sbGetPublishedArticles();
    } catch { /* 폴백 */ }
  }
  const all = await serverGetArticles();
  return all.filter(a => a.status === "게시");
}

/** 최신 N건 게시 기사 (body 제외) — 피드/사이드바용 */
export async function serverGetRecentArticles(limit: number): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetRecentArticles } = await import("@/lib/supabase-server-db");
      return await sbGetRecentArticles(limit);
    } catch { /* 폴백 */ }
  }
  const all = await serverGetArticles();
  return all
    .filter(a => a.status === "게시")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** sitemap 전용 — no/date/tags/author만 조회 */
export async function serverGetArticleSitemapData(): Promise<{ no: number; date: string; tags?: string; author?: string }[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetArticleSitemapData } = await import("@/lib/supabase-server-db");
      return await sbGetArticleSitemapData();
    } catch { /* 폴백 */ }
  }
  const all = await serverGetArticles();
  return all
    .filter(a => a.status === "게시")
    .map(a => ({ no: a.no ?? 0, date: a.date, tags: a.tags, author: a.author }));
}

/** 예약 발행 대상 기사 — status=예약, 발행 시간 경과 */
export async function serverGetScheduledArticles(): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetScheduledArticles } = await import("@/lib/supabase-server-db");
      return await sbGetScheduledArticles();
    } catch { /* 폴백 */ }
  }
  const all = await serverGetArticles();
  const now = new Date().toISOString();
  return all.filter(a => a.status === "예약" && a.scheduledPublishAt && a.scheduledPublishAt <= now);
}

/** 최근 N일 기사 제목+sourceUrl — 중복 확인용 */
export async function serverGetRecentTitles(days: number): Promise<{ title: string; sourceUrl?: string }[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetRecentTitles } = await import("@/lib/supabase-server-db");
      return await sbGetRecentTitles(days);
    } catch { /* 폴백 */ }
  }
  const all = await serverGetArticles();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return all
    .filter(a => a.status === "게시" && a.date >= cutoff)
    .map(a => ({ title: a.title, sourceUrl: a.sourceUrl }));
}

/** 많이 본 뉴스 Top N (views 기준 내림차순, 게시 상태만) */
export async function serverGetTopArticles(limit = 10): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetTopArticles } = await import("@/lib/supabase-server-db");
      return await sbGetTopArticles(limit);
    } catch { /* 폴백 */ }
  }
  // 폴백: 전체 조회 후 정렬
  const all = await serverGetArticles();
  return all.filter(a => a.status === "게시").sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, limit);
}

/**
 * DB 레벨 필터링 + 페이지네이션 + 총 개수 반환
 * /api/db/articles GET에서 전체 조회+JS 필터링 대신 사용
 */
export async function serverGetFilteredArticles(opts: {
  q?: string; category?: string; status?: string;
  page?: number; limit?: number;
  includeDeleted?: boolean; authed?: boolean;
}): Promise<{ articles: Article[]; total: number }> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetFilteredArticles } = await import("@/lib/supabase-server-db");
      return await sbGetFilteredArticles(opts);
    } catch { /* 폴백 */ }
  }
  // 폴백: 전체 조회 후 JS 필터링
  let articles = await serverGetArticles();
  if (!opts.authed) articles = articles.filter(a => a.status === "게시");
  else if (opts.status) articles = articles.filter(a => a.status === opts.status);
  if (opts.category) articles = articles.filter(a => a.category === opts.category);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    articles = articles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.author?.toLowerCase().includes(q) ||
      a.tags?.toLowerCase().includes(q)
    );
  }
  const total = articles.length;
  const limit = opts.limit || 20;
  const offset = ((opts.page || 1) - 1) * limit;
  return { articles: articles.slice(offset, offset + limit), total };
}

// ── Settings ─────────────────────────────────────────────

export async function serverGetSetting<T>(key: string, fallback: T): Promise<T> {
  const revalidate = key.includes("seo") || key.includes("categories") ? 3600 : 300;
  const cached = unstable_cache(
    async (): Promise<T> => {
      if (isSupabaseEnabled()) {
        try {
          const { sbGetSetting } = await import("@/lib/supabase-server-db");
          return await sbGetSetting(key, fallback);
        } catch { /* 폴백 */ }
      }
      if (isMySQLEnabled()) {
        try {
          const { dbGetSetting } = await import("@/lib/mysql-db");
          return await dbGetSetting(key, fallback);
        } catch { /* 폴백 */ }
      }
      const { fileGetSetting } = await import("@/lib/file-db");
      return fileGetSetting(key, fallback);
    },
    [key],
    { revalidate, tags: [`setting:${key}`] }
  );
  return cached();
}

export async function serverSaveSetting(key: string, value: unknown): Promise<void> {
  const errors: string[] = [];

  if (isSupabaseEnabled()) {
    try {
      const { sbSaveSetting } = await import("@/lib/supabase-server-db");
      await sbSaveSetting(key, value);
      revalidateTag(`setting:${key}`);
      return;
    } catch (e) {
      errors.push(`Supabase: ${e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120)}`);
    }
  }
  if (isMySQLEnabled()) {
    try {
      const { dbSaveSetting } = await import("@/lib/mysql-db");
      await dbSaveSetting(key, value);
      revalidateTag(`setting:${key}`);
      return;
    } catch (e) {
      errors.push(`MySQL: ${e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120)}`);
    }
  }
  // 로컬 개발 전용 — Vercel 읽기전용 파일시스템에서는 실패함
  try {
    const { fileSaveSetting } = await import("@/lib/file-db");
    fileSaveSetting(key, value);
    revalidateTag(`setting:${key}`);
    return;
  } catch (e) {
    errors.push(`File: ${e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80)}`);
  }

  // 모든 백엔드 실패 (내부 에러 세부사항은 서버 로그에만 기록)
  console.error(`[serverSaveSetting] 모든 백엔드 실패 (key=${key}):`, errors.join(" / "));
  throw new Error("설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
}

// ── Article CUD ───────────────────────────────────────────

/**
 * 기사 순서 번호를 증가하여 반환
 * 1순위: Supabase get_next_article_no() RPC (원자적 — PostgreSQL 시퀀스 + MAX(no) 검증)
 * 2순위: MAX(no)+1 직접 계산 (RPC 미설치 시)
 * 3순위: MySQL/File 설정값 카운터
 *
 * ※ RPC 함수(plpgsql)가 내부적으로 시퀀스 ↔ MAX(no) 동기화 보장
 * ※ articles.no에 UNIQUE 제약조건이 있어 DB 레벨에서도 중복 차단
 */
async function getNextArticleNo(): Promise<number> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetNextArticleNo, sbGetMaxArticleNo, sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
      const COUNTER_KEY = "cp-article-counter";
      const maxNo = await sbGetMaxArticleNo();

      // 1순위: Supabase RPC (원자적 카운터 + MAX(no) 자동 보정)
      const no = await sbGetNextArticleNo();
      if (no !== null && no > 0 && no > maxNo) {
        // 설정값 카운터도 동기화 (fire-and-forget)
        sbSaveSetting(COUNTER_KEY, no).catch(() => {});
        return no;
      }

      // 2순위: 설정값 카운터 + MAX(no) 비교 — 둘 중 큰 값 + 1
      const counter = await sbGetSetting<number>(COUNTER_KEY, 0, true);
      const nextNo = Math.max(counter, maxNo) + 1;
      await sbSaveSetting(COUNTER_KEY, nextNo);
      return nextNo;
    } catch { /* 다음 DB로 */ }
  }
  if (isMySQLEnabled()) {
    try {
      const COUNTER_KEY = "cp-article-counter";
      const { dbGetSetting, dbSaveSetting } = await import("@/lib/mysql-db");
      const current = await dbGetSetting<number>(COUNTER_KEY, 0);
      await dbSaveSetting(COUNTER_KEY, current + 1);
      revalidateTag(`setting:${COUNTER_KEY}`);
      return current + 1;
    } catch { /* 폴백 */ }
  }
  const COUNTER_KEY = "cp-article-counter";
  const { fileGetSetting, fileSaveSetting } = await import("@/lib/file-db");
  const current = fileGetSetting<number>(COUNTER_KEY, 0);
  fileSaveSetting(COUNTER_KEY, current + 1);
  return current + 1;
}

/** 본문에서 "참고 이미지 출처: URL" 및 바로 앞의 <hr> 제거 */
function stripImageSourceCredit(body: string): string {
  if (!body) return body;
  return body
    .replace(/<hr\s*\/?>\s*<p>\s*참고\s*이미지\s*출처\s*[:：]\s*https?:\/\/[^<]*<\/p>/gi, '')
    .replace(/<p>\s*참고\s*이미지\s*출처\s*[:：]\s*https?:\/\/[^<]*<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function serverCreateArticle(article: Article): Promise<number | undefined> {
  // 입력값 길이 제한 (DB 오버플로우 방지)
  if (article.title) article = { ...article, title: article.title.slice(0, 200) };
  if (article.tags) article = { ...article, tags: article.tags.slice(0, 500) };
  if (article.summary) article = { ...article, summary: article.summary.slice(0, 300) };
  // 본문에서 "참고 이미지 출처" 자동 제거
  if (article.body) article = { ...article, body: stripImageSourceCredit(article.body) };
  // base64 인코딩 이미지 자동 제거 (명함, 인라인 첨부 등 — DB 용량 절약)
  if (article.body) {
    article = {
      ...article,
      body: article.body
        .replace(/<img[^>]+src="data:image[^"]*"[^>]*>/gi, "")
        .replace(/<figure[^>]*>\s*<\/figure>/gi, "")
        .replace(/<p>\s*<\/p>/g, ""),
    };
  }
  // HTML 엔티티가 포함된 URL 디코딩 (예: &amp; → &)
  if (article.thumbnail) {
    article = { ...article, thumbnail: article.thumbnail.replace(/&amp;/g, "&") };
  }
  // thumbnail 없으면 본문 첫 이미지 자동 추출
  if (!article.thumbnail && article.body) {
    const imgMatch = article.body.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (imgMatch?.[1]) {
      article = { ...article, thumbnail: imgMatch[1] };
    }
  }
  // 썸네일이 외부 URL이면 Supabase 업로드 시도 (이미지 깨짐 방지)
  if (article.thumbnail && !article.thumbnail.includes("supabase")) {
    try {
      const { serverUploadImageUrl } = await import("@/lib/server-upload-image");
      const uploaded = await serverUploadImageUrl(article.thumbnail);
      if (uploaded) article = { ...article, thumbnail: uploaded };
    } catch { /* 업로드 실패 시 원본 URL 유지 */ }
  }
  // 썸네일 검증: 너무 작은 이미지(20KB 미만)는 명함/아이콘/추적픽셀이므로 제거
  if (article.thumbnail) {
    try {
      const headResp = await fetch(article.thumbnail, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      const size = parseInt(headResp.headers.get("content-length") || "0");
      if (size > 0 && size < 20_000) {
        console.warn(`[DB] 썸네일 크기 미달(${size}B), 제거:`, article.thumbnail.slice(0, 80));
        article = { ...article, thumbnail: "" };
      }
    } catch { /* HEAD 실패 시 무시 */ }
  }
  // author에서 "기자" 접미사 제거 ("박영래 기자" → "박영래")
  if (article.author) article = { ...article, author: article.author.replace(/\s*기자\s*$/, "").trim() };
  // 모든 기사에 순서 번호 자동 부여 (무조건)
  let assignedNo: number | undefined;
  try {
    const nextNo = await getNextArticleNo();
    article = { ...article, no: nextNo };
    assignedNo = nextNo;
  } catch (e) {
    console.warn("[DB] 기사 번호 부여 실패:", (e as Error).message?.slice(0, 80));
    // 번호 부여 실패해도 기사 자체는 저장 (no=null)
  }
  if (isSupabaseEnabled()) {
    try {
      const { sbCreateArticle } = await import("@/lib/supabase-server-db");
      await sbCreateArticle(article);
      return assignedNo;
    } catch (e) {
      console.error("[DB] Supabase create failed:", (e as Error).message?.slice(0, 200));
      // Supabase 실패 시 다른 백엔드로 폴백하지 않고 에러 전파
      // (file-db는 Vercel 읽기전용 파일시스템에서 동작하지 않음)
      throw e;
    }
  }
  if (isMySQLEnabled()) { const { dbCreateArticle } = await import("@/lib/mysql-db"); await dbCreateArticle(article); return assignedNo; }
  const { fileCreateArticle } = await import("@/lib/file-db"); await fileCreateArticle(article); return assignedNo;
}

export async function serverUpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  if (isSupabaseEnabled()) {
    // serverCreateArticle과 동일: Supabase 실패 시 에러 전파 (Vercel에서 다른 백엔드 사용 불가)
    const { sbUpdateArticle } = await import("@/lib/supabase-server-db");
    return await sbUpdateArticle(id, updates);
  }
  if (isMySQLEnabled()) { const { dbUpdateArticle } = await import("@/lib/mysql-db"); return dbUpdateArticle(id, updates); }
  const { fileUpdateArticle } = await import("@/lib/file-db"); return fileUpdateArticle(id, updates);
}

/** 소프트 삭제 (휴지통으로 이동) */
export async function serverDeleteArticle(id: string): Promise<void> {
  if (isSupabaseEnabled()) {
    try { const { sbDeleteArticle } = await import("@/lib/supabase-server-db"); return await sbDeleteArticle(id); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbDeleteArticle } = await import("@/lib/mysql-db"); return dbDeleteArticle(id); }
  const { fileDeleteArticle } = await import("@/lib/file-db"); return fileDeleteArticle(id);
}

/** 영구 삭제 (DB에서 완전 제거) */
export async function serverPurgeArticle(id: string): Promise<void> {
  if (isSupabaseEnabled()) {
    try { const { sbPurgeArticle } = await import("@/lib/supabase-server-db"); return await sbPurgeArticle(id); } catch { /* 폴백 */ }
  }
  // MySQL/file은 기존 delete로 영구 삭제
  if (isMySQLEnabled()) { const { dbDeleteArticle } = await import("@/lib/mysql-db"); return dbDeleteArticle(id); }
  const { fileDeleteArticle } = await import("@/lib/file-db"); return fileDeleteArticle(id);
}

/** 휴지통 복원 (deleted_at 제거) */
export async function serverRestoreArticle(id: string): Promise<void> {
  return serverUpdateArticle(id, { deletedAt: null } as unknown as Partial<Article>);
}

/** 휴지통 기사 목록 */
export async function serverGetDeletedArticles(): Promise<Article[]> {
  if (isSupabaseEnabled()) {
    try { const { sbGetDeletedArticles } = await import("@/lib/supabase-server-db"); return await sbGetDeletedArticles(); } catch { /* 폴백 */ }
  }
  return [];
}

export async function serverIncrementViews(id: string, botInfo?: { isBot?: boolean; botName?: string }): Promise<void> {
  // 봇 조회는 조회수에 카운트하지 않고 로그만 기록
  if (botInfo?.isBot) {
    try {
      await serverAddViewLog({ articleId: id, path: `/article/${id}`, isAdmin: false, isBot: true, botName: botInfo.botName });
    } catch { /* 로그 실패 무시 */ }
    return;
  }
  if (isSupabaseEnabled()) {
    try { const { sbIncrementViews } = await import("@/lib/supabase-server-db"); return await sbIncrementViews(id); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbIncrementViews } = await import("@/lib/mysql-db"); return dbIncrementViews(id); }
  const { fileIncrementViews } = await import("@/lib/file-db"); return fileIncrementViews(id);
}

// ── View Logs ─────────────────────────────────────────────

export async function serverGetViewLogs(): Promise<ViewLogEntry[]> {
  if (isSupabaseEnabled()) {
    try { const { sbGetSetting } = await import("@/lib/supabase-server-db"); return await sbGetSetting<ViewLogEntry[]>("cp-view-logs", []); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbGetViewLogs } = await import("@/lib/mysql-db"); return dbGetViewLogs(); }
  const { fileGetViewLogs } = await import("@/lib/file-db"); return fileGetViewLogs();
}

export async function serverAddViewLog(entry: { articleId: string; path: string; isAdmin?: boolean; isBot?: boolean; botName?: string }): Promise<void> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
      const logs = await sbGetSetting<ViewLogEntry[]>("cp-view-logs", []);
      const now = new Date().toISOString();
      // 같은 기사 5분 내 중복 기록 건너뜀 (읽기/쓰기 감소)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const isDuplicate = logs.some(
        (l) => l.articleId === entry.articleId && l.timestamp > fiveMinAgo && l.isBot === (entry.isBot || false)
      );
      if (!isDuplicate) {
        const logEntry: ViewLogEntry = {
          articleId: entry.articleId,
          path: entry.path,
          timestamp: now,
          isAdmin: entry.isAdmin || false,
          ...(entry.isBot ? { isBot: true, botName: entry.botName } : {}),
        };
        const updated = [...logs, logEntry].slice(-2000);
        await sbSaveSetting("cp-view-logs", updated);
      }
      return;
    } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbAddViewLog } = await import("@/lib/mysql-db"); return dbAddViewLog(entry); }
  const { fileAddViewLog } = await import("@/lib/file-db"); return fileAddViewLog(entry);
}

// ── Distribute Logs ───────────────────────────────────────

export async function serverGetDistributeLogs(): Promise<DistributeLog[]> {
  if (isSupabaseEnabled()) {
    try { const { sbGetSetting } = await import("@/lib/supabase-server-db"); return await sbGetSetting<DistributeLog[]>("cp-distribute-logs", []); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbGetDistributeLogs } = await import("@/lib/mysql-db"); return dbGetDistributeLogs(); }
  const { fileGetDistributeLogs } = await import("@/lib/file-db"); return fileGetDistributeLogs();
}

export async function serverAddDistributeLogs(logs: DistributeLog[]): Promise<void> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
      const existing = await sbGetSetting<DistributeLog[]>("cp-distribute-logs", []);
      await sbSaveSetting("cp-distribute-logs", [...logs, ...existing].slice(0, 100));
      return;
    } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbAddDistributeLogs } = await import("@/lib/mysql-db"); return dbAddDistributeLogs(logs); }
  const { fileAddDistributeLogs } = await import("@/lib/file-db"); return fileAddDistributeLogs(logs);
}

export async function serverClearDistributeLogs(): Promise<void> {
  if (isSupabaseEnabled()) {
    try { const { sbSaveSetting } = await import("@/lib/supabase-server-db"); await sbSaveSetting("cp-distribute-logs", []); return; } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbClearDistributeLogs } = await import("@/lib/mysql-db"); return dbClearDistributeLogs(); }
  const { fileClearDistributeLogs } = await import("@/lib/file-db"); return fileClearDistributeLogs();
}
