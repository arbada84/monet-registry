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

// ── Settings ─────────────────────────────────────────────

export async function serverGetSetting<T>(key: string, fallback: T): Promise<T> {
  const revalidate = key.includes("seo") || key.includes("categories") ? 300 : 60;
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

export async function serverCreateArticle(article: Article): Promise<number | undefined> {
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

export async function serverIncrementViews(id: string): Promise<void> {
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

export async function serverAddViewLog(entry: { articleId: string; path: string; isAdmin?: boolean }): Promise<void> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
      const logs = await sbGetSetting<ViewLogEntry[]>("cp-view-logs", []);
      const now = new Date().toISOString();
      // 같은 기사 5분 내 중복 기록 건너뜀 (읽기/쓰기 감소)
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const isDuplicate = logs.some(
        (l) => l.articleId === entry.articleId && l.timestamp > fiveMinAgo
      );
      if (!isDuplicate) {
        const updated = [...logs, { articleId: entry.articleId, path: entry.path, timestamp: now, isAdmin: entry.isAdmin || false }].slice(-1000);
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
