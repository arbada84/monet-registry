/**
 * 서버 컴포넌트 전용 DB 접근 레이어
 * "use client" 파일에서는 import 불가 — 서버 컴포넌트/API 라우트 전용
 *
 * 우선순위:
 *   1. PHP_API_URL → Cafe24 PHP 게이트웨이
 *   2. NEXT_PUBLIC_SUPABASE_URL → Supabase (Vercel 배포 기본)
 *   3. MYSQL_DATABASE → MySQL 직접 접속
 *   4. 없으면 → data/ 폴더 JSON 파일 DB (로컬 개발)
 */
import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import type { Article, ViewLogEntry, DistributeLog } from "@/types/article";

const isPhpApiEnabled  = () => Boolean(process.env.PHP_API_URL);
const isSupabaseEnabled = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const isMySQLEnabled   = () => Boolean(process.env.MYSQL_DATABASE);

// ── Articles ─────────────────────────────────────────────

export async function serverGetArticles(): Promise<Article[]> {
  if (isPhpApiEnabled()) {
    try {
      const { dbGetArticles } = await import("@/lib/php-api-db");
      return await dbGetArticles();
    } catch { /* Cafe24가 Vercel IP 차단 시 Supabase로 폴백 */ }
  }
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
  if (isPhpApiEnabled()) {
    try {
      const { dbGetArticleById } = await import("@/lib/php-api-db");
      return await dbGetArticleById(id);
    } catch { /* 폴백 */ }
  }
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
  if (isPhpApiEnabled()) {
    try {
      const { dbGetArticleByNo } = await import("@/lib/php-api-db");
      return await dbGetArticleByNo(no);
    } catch { /* 폴백 */ }
  }
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
      if (isPhpApiEnabled()) {
        try {
          const { dbGetSetting } = await import("@/lib/php-api-db");
          return await dbGetSetting(key, fallback);
        } catch { /* 폴백 */ }
      }
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

  if (isPhpApiEnabled()) {
    try {
      const { dbSaveSetting } = await import("@/lib/php-api-db");
      await dbSaveSetting(key, value);
      revalidateTag(`setting:${key}`);
      return;
    } catch (e) {
      errors.push(`PHP: ${e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120)}`);
    }
  }
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

  // 모든 백엔드 실패
  throw new Error(`저장 실패 — ${errors.join(" / ")}`);
}

// ── Article CUD ───────────────────────────────────────────

/** 기사 순서 번호 카운터를 읽고 1 증가시켜 새 번호를 반환 */
async function getNextArticleNo(): Promise<number> {
  const COUNTER_KEY = "cp-article-counter";
  let current = 0;
  // 캐시 없이 직접 읽기
  if (isPhpApiEnabled()) {
    try {
      const { dbGetSetting, dbSaveSetting } = await import("@/lib/php-api-db");
      current = await dbGetSetting<number>(COUNTER_KEY, 0);
      await dbSaveSetting(COUNTER_KEY, current + 1);
      revalidateTag(`setting:${COUNTER_KEY}`);
      return current + 1;
    } catch { /* fallback */ }
  }
  if (isSupabaseEnabled()) {
    try {
      const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
      current = await sbGetSetting<number>(COUNTER_KEY, 0);
      await sbSaveSetting(COUNTER_KEY, current + 1);
      revalidateTag(`setting:${COUNTER_KEY}`);
      return current + 1;
    } catch { /* fallback */ }
  }
  if (isMySQLEnabled()) {
    try {
      const { dbGetSetting, dbSaveSetting } = await import("@/lib/mysql-db");
      current = await dbGetSetting<number>(COUNTER_KEY, 0);
      await dbSaveSetting(COUNTER_KEY, current + 1);
      revalidateTag(`setting:${COUNTER_KEY}`);
      return current + 1;
    } catch { /* fallback */ }
  }
  const { fileGetSetting, fileSaveSetting } = await import("@/lib/file-db");
  current = fileGetSetting<number>(COUNTER_KEY, 0);
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
  if (isPhpApiEnabled()) {
    try { const { dbCreateArticle } = await import("@/lib/php-api-db"); return await dbCreateArticle(article); } catch (e) { console.warn("[DB] PHP create failed, falling back:", (e as Error).message?.slice(0, 80)); }
  }
  if (isSupabaseEnabled()) {
    try { const { sbCreateArticle } = await import("@/lib/supabase-server-db"); console.info("[DB] Creating article via Supabase"); return await sbCreateArticle(article); } catch (e) { console.warn("[DB] Supabase create failed, falling back:", (e as Error).message?.slice(0, 80)); }
  }
  if (isMySQLEnabled()) { const { dbCreateArticle } = await import("@/lib/mysql-db"); return dbCreateArticle(article); }
  const { fileCreateArticle } = await import("@/lib/file-db"); return fileCreateArticle(article);
}

export async function serverUpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  if (isPhpApiEnabled()) {
    try { const { dbUpdateArticle } = await import("@/lib/php-api-db"); return await dbUpdateArticle(id, updates); } catch (e) { console.warn("[DB] PHP update failed, falling back:", (e as Error).message?.slice(0, 80)); }
  }
  if (isSupabaseEnabled()) {
    try { const { sbUpdateArticle } = await import("@/lib/supabase-server-db"); return await sbUpdateArticle(id, updates); } catch (e) { console.warn("[DB] Supabase update failed, falling back:", (e as Error).message?.slice(0, 80)); }
  }
  if (isMySQLEnabled()) { const { dbUpdateArticle } = await import("@/lib/mysql-db"); return dbUpdateArticle(id, updates); }
  const { fileUpdateArticle } = await import("@/lib/file-db"); return fileUpdateArticle(id, updates);
}

export async function serverDeleteArticle(id: string): Promise<void> {
  if (isPhpApiEnabled()) {
    try { const { dbDeleteArticle } = await import("@/lib/php-api-db"); return await dbDeleteArticle(id); } catch { /* 폴백 */ }
  }
  if (isSupabaseEnabled()) {
    try { const { sbDeleteArticle } = await import("@/lib/supabase-server-db"); return await sbDeleteArticle(id); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbDeleteArticle } = await import("@/lib/mysql-db"); return dbDeleteArticle(id); }
  const { fileDeleteArticle } = await import("@/lib/file-db"); return fileDeleteArticle(id);
}

export async function serverIncrementViews(id: string): Promise<void> {
  if (isPhpApiEnabled()) {
    try { const { dbIncrementViews } = await import("@/lib/php-api-db"); return await dbIncrementViews(id); } catch { /* 폴백 */ }
  }
  if (isSupabaseEnabled()) {
    try { const { sbIncrementViews } = await import("@/lib/supabase-server-db"); return await sbIncrementViews(id); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbIncrementViews } = await import("@/lib/mysql-db"); return dbIncrementViews(id); }
  const { fileIncrementViews } = await import("@/lib/file-db"); return fileIncrementViews(id);
}

// ── View Logs ─────────────────────────────────────────────

export async function serverGetViewLogs(): Promise<ViewLogEntry[]> {
  if (isPhpApiEnabled()) {
    try { const { dbGetViewLogs } = await import("@/lib/php-api-db"); return await dbGetViewLogs(); } catch { /* 폴백 */ }
  }
  if (isSupabaseEnabled()) {
    try { const { sbGetSetting } = await import("@/lib/supabase-server-db"); return await sbGetSetting<ViewLogEntry[]>("cp-view-logs", []); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbGetViewLogs } = await import("@/lib/mysql-db"); return dbGetViewLogs(); }
  const { fileGetViewLogs } = await import("@/lib/file-db"); return fileGetViewLogs();
}

export async function serverAddViewLog(entry: { articleId: string; path: string }): Promise<void> {
  if (isPhpApiEnabled()) {
    try { const { dbAddViewLog } = await import("@/lib/php-api-db"); return await dbAddViewLog(entry); } catch { /* 폴백 */ }
  }
  if (isSupabaseEnabled()) {
    try {
      const { sbGetSetting, sbSaveSetting } = await import("@/lib/supabase-server-db");
      const logs = await sbGetSetting<ViewLogEntry[]>("cp-view-logs", []);
      const updated = [...logs, { ...entry, timestamp: new Date().toISOString() }].slice(-2000);
      await sbSaveSetting("cp-view-logs", updated);
      return;
    } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbAddViewLog } = await import("@/lib/mysql-db"); return dbAddViewLog(entry); }
  const { fileAddViewLog } = await import("@/lib/file-db"); return fileAddViewLog(entry);
}

// ── Distribute Logs ───────────────────────────────────────

export async function serverGetDistributeLogs(): Promise<DistributeLog[]> {
  if (isPhpApiEnabled()) {
    try { const { dbGetDistributeLogs } = await import("@/lib/php-api-db"); return await dbGetDistributeLogs(); } catch { /* 폴백 */ }
  }
  if (isSupabaseEnabled()) {
    try { const { sbGetSetting } = await import("@/lib/supabase-server-db"); return await sbGetSetting<DistributeLog[]>("cp-distribute-logs", []); } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbGetDistributeLogs } = await import("@/lib/mysql-db"); return dbGetDistributeLogs(); }
  const { fileGetDistributeLogs } = await import("@/lib/file-db"); return fileGetDistributeLogs();
}

export async function serverAddDistributeLogs(logs: DistributeLog[]): Promise<void> {
  if (isPhpApiEnabled()) {
    try { const { dbAddDistributeLogs } = await import("@/lib/php-api-db"); return await dbAddDistributeLogs(logs); } catch { /* 폴백 */ }
  }
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
  if (isPhpApiEnabled()) {
    try { const { dbClearDistributeLogs } = await import("@/lib/php-api-db"); return await dbClearDistributeLogs(); } catch { /* 폴백 */ }
  }
  if (isSupabaseEnabled()) {
    try { const { sbSaveSetting } = await import("@/lib/supabase-server-db"); await sbSaveSetting("cp-distribute-logs", []); return; } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) { const { dbClearDistributeLogs } = await import("@/lib/mysql-db"); return dbClearDistributeLogs(); }
  const { fileClearDistributeLogs } = await import("@/lib/file-db"); return fileClearDistributeLogs();
}
