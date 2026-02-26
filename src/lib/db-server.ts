/**
 * 서버 컴포넌트 전용 DB 접근 레이어
 * "use client" 파일에서는 import 불가 — 서버 컴포넌트/API 라우트 전용
 *
 * 우선순위:
 *   1. PHP_API_URL 환경변수 → Cafe24 PHP 게이트웨이 (Vercel 배포 시)
 *   2. MYSQL_DATABASE 환경변수 → MySQL 직접 접속 (Cafe24 Node.js 배포 시)
 *   3. 둘 다 없으면 → data/ 폴더 JSON 파일 DB (로컬 개발)
 */
import "server-only";
import { unstable_cache } from "next/cache";
import type { Article } from "@/types/article";

const isPhpApiEnabled = () => Boolean(process.env.PHP_API_URL);
const isMySQLEnabled = () => Boolean(process.env.MYSQL_DATABASE);

// serverGetArticles: 캐싱하지 않음 (최신 기사 즉시 반영 필요)
export async function serverGetArticles(): Promise<Article[]> {
  if (isPhpApiEnabled()) {
    const { dbGetArticles } = await import("@/lib/php-api-db");
    return dbGetArticles();
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
    const { dbGetArticleById } = await import("@/lib/php-api-db");
    return dbGetArticleById(id);
  }
  if (isMySQLEnabled()) {
    const { dbGetArticleById } = await import("@/lib/mysql-db");
    return dbGetArticleById(id);
  }
  const { fileGetArticleById } = await import("@/lib/file-db");
  return fileGetArticleById(id);
}

// G1: serverGetSetting에 unstable_cache 적용
// key 파라미터 기반으로 캐시 키 동적 생성
// SEO/카테고리 설정은 5분, 나머지는 1분 캐시
export async function serverGetSetting<T>(key: string, fallback: T): Promise<T> {
  const revalidate = key.includes("seo") || key.includes("categories") ? 300 : 60;
  const cached = unstable_cache(
    async (): Promise<T> => {
      try {
        if (isPhpApiEnabled()) {
          const { dbGetSetting } = await import("@/lib/php-api-db");
          return dbGetSetting(key, fallback);
        }
        if (isMySQLEnabled()) {
          const { dbGetSetting } = await import("@/lib/mysql-db");
          return dbGetSetting(key, fallback);
        }
        const { fileGetSetting } = await import("@/lib/file-db");
        return fileGetSetting(key, fallback);
      } catch {
        return fallback;
      }
    },
    [key],
    { revalidate }
  );
  return cached();
}

export async function serverSaveSetting(key: string, value: unknown): Promise<void> {
  if (isPhpApiEnabled()) {
    const { dbSaveSetting } = await import("@/lib/php-api-db");
    return dbSaveSetting(key, value);
  }
  if (isMySQLEnabled()) {
    const { dbSaveSetting } = await import("@/lib/mysql-db");
    return dbSaveSetting(key, value);
  }
  const { fileSaveSetting } = await import("@/lib/file-db");
  fileSaveSetting(key, value);
}
