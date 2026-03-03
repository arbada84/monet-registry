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
 * 1순위: Supabase get_next_article_no() RPC (원자적 — PostgreSQL 시퀀스)
 *   SQL 설치:
 *     CREATE SEQUENCE IF NOT EXISTS article_no_seq;
 *     SELECT setval('article_no_seq', COALESCE((SELECT MAX(no) FROM articles WHERE no IS NOT NULL), 0) + 1, false);
 *     CREATE OR REPLACE FUNCTION get_next_article_no() RETURNS bigint LANGUAGE sql AS $$ SELECT nextval('article_no_seq'); $$;
 * 2순위: MAX(no)+1 직접 계산 (RPC 미설치 시)
 * ※ DB 레벨 INSERT 트리거가 설치되면 no=null로 INSERT해도 DB가 자동 부여
 */
async function getNextArticleNo(): Promise<number> {
  if (isSupabaseEnabled()) {
    try {
      const { sbGetNextArticleNo, sbGetMaxArticleNo } = await import("@/lib/supabase-server-db");
      const no = await sbGetNextArticleNo();
      if (no !== null && no > 0) return no;
      // RPC 미설치 시 MAX+1 폴백
      const maxNo = await sbGetMaxArticleNo();
      return maxNo + 1;
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

export async function serverCreateArticle(article: Article): Promise<void> {
  // 새 기사에 순서 번호 자동 부여
  if (!article.no) {
    try {
      article = { ...article, no: await getNextArticleNo() };
    } catch { /* no 없이 계속 진행 */ }
  }
  if (isSupabaseEnabled()) {
    try { const { sbCreateArticle } = await import("@/lib/supabase-server-db"); return await sbCreateArticle(article); } catch (e) { console.warn("[DB] Supabase create failed:", (e as Error).message?.slice(0, 80)); }
  }
  if (isMySQLEnabled()) { const { dbCreateArticle } = await import("@/lib/mysql-db"); return dbCreateArticle(article); }
  const { fileCreateArticle } = await import("@/lib/file-db"); return fileCreateArticle(article);
}

export async function serverUpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  if (isSupabaseEnabled()) {
    try { const { sbUpdateArticle } = await import("@/lib/supabase-server-db"); return await sbUpdateArticle(id, updates); } catch (e) { console.warn("[DB] Supabase update failed:", (e as Error).message?.slice(0, 80)); }
  }
  if (isMySQLEnabled()) { const { dbUpdateArticle } = await import("@/lib/mysql-db"); return dbUpdateArticle(id, updates); }
  const { fileUpdateArticle } = await import("@/lib/file-db"); return fileUpdateArticle(id, updates);
}

export async function serverDeleteArticle(id: string): Promise<void> {
  if (isSupabaseEnabled()) {
    try { const { sbDeleteArticle } = await import("@/lib/supabase-server-db"); return await sbDeleteArticle(id); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbDeleteArticle } = await import("@/lib/mysql-db"); return dbDeleteArticle(id); }
  const { fileDeleteArticle } = await import("@/lib/file-db"); return fileDeleteArticle(id);
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

export async function serverAddViewLog(entry: { articleId: string; path: string }): Promise<void> {
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
        const updated = [...logs, { ...entry, timestamp: now }].slice(-1000);
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
