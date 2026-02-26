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
import { unstable_cache } from "next/cache";
import type { Article } from "@/types/article";

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
    { revalidate }
  );
  return cached();
}

export async function serverSaveSetting(key: string, value: unknown): Promise<void> {
  if (isPhpApiEnabled()) {
    try {
      const { dbSaveSetting } = await import("@/lib/php-api-db");
      return await dbSaveSetting(key, value);
    } catch { /* 폴백 */ }
  }
  if (isSupabaseEnabled()) {
    try {
      const { sbSaveSetting } = await import("@/lib/supabase-server-db");
      return await sbSaveSetting(key, value);
    } catch { /* 폴백 */ }
  }
  if (isMySQLEnabled()) {
    const { dbSaveSetting } = await import("@/lib/mysql-db");
    return dbSaveSetting(key, value);
  }
  const { fileSaveSetting } = await import("@/lib/file-db");
  fileSaveSetting(key, value);
}
