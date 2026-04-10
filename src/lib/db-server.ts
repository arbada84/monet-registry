/**
 * 서버 컴포넌트 전용 DB 접근 레이어
 * "use client" 파일에서는 import 불가 — 서버 컴포넌트/API 라우트 전용
 *
 * Supabase 단일 경로 (supabase-server-db.ts 위임)
 */
import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import type { Article, ViewLogEntry, DistributeLog } from "@/types/article";
import {
  sbGetArticles,
  sbGetArticlesByCategory,
  sbGetArticlesByTag,
  sbSearchArticles,
  sbGetArticleById,
  sbGetArticleByNo,
  sbGetPublishedArticles,
  sbGetRecentArticles,
  sbGetArticleSitemapData,
  sbGetScheduledArticles,
  sbGetRecentTitles,
  sbGetTopArticles,
  sbGetFilteredArticles,
  sbGetSetting,
  sbSaveSetting,
  sbCreateArticle,
  sbUpdateArticle,
  sbDeleteArticle,
  sbPurgeArticle,
  sbGetDeletedArticles,
  sbIncrementViews,
  sbGetMaxArticleNo,
  sbGetNextArticleNo,
} from "@/lib/supabase-server-db";

// ── Articles ─────────────────────────────────────────────

export async function serverGetArticles(): Promise<Article[]> {
  return sbGetArticles();
}

export async function serverGetArticlesByCategory(category: string): Promise<Article[]> {
  return sbGetArticlesByCategory(category);
}

export async function serverGetArticlesByTag(tag: string): Promise<Article[]> {
  return sbGetArticlesByTag(tag);
}

export async function serverSearchArticles(query: string): Promise<Article[]> {
  return sbSearchArticles(query);
}

export async function serverGetArticleById(id: string): Promise<Article | null> {
  return sbGetArticleById(id);
}

export async function serverGetArticleByNo(no: number): Promise<Article | null> {
  return sbGetArticleByNo(no);
}

/** 게시 상태 기사만 (body 제외) — 홈/기자/외부API용 */
export async function serverGetPublishedArticles(): Promise<Article[]> {
  return sbGetPublishedArticles();
}

/** 최신 N건 게시 기사 (body 제외) — 피드/사이드바용 */
export async function serverGetRecentArticles(limit: number): Promise<Article[]> {
  return sbGetRecentArticles(limit);
}

/** sitemap 전용 — no/date/tags/author만 조회 */
export async function serverGetArticleSitemapData(): Promise<{ no: number; date: string; tags?: string; author?: string }[]> {
  return sbGetArticleSitemapData();
}

/** 예약 발행 대상 기사 — status=예약, 발행 시간 경과 */
export async function serverGetScheduledArticles(): Promise<Article[]> {
  return sbGetScheduledArticles();
}

/** 최근 N일 기사 제목+sourceUrl — 중복 확인용 */
export async function serverGetRecentTitles(days: number): Promise<{ title: string; sourceUrl?: string }[]> {
  return sbGetRecentTitles(days);
}

/** 많이 본 뉴스 Top N (views 기준 내림차순, 게시 상태만) */
export async function serverGetTopArticles(limit = 10): Promise<Article[]> {
  return sbGetTopArticles(limit);
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
  const { articles, total: apiTotal } = await sbGetFilteredArticles(opts);

  // Supabase count=exact 헤더를 통해 받은 총 개수를 그대로 사용
  // (sbGetTotalCount 호출 루프 제거 - 성능 및 정확도 개선)
  return { articles, total: apiTotal };
}

// ── Settings ─────────────────────────────────────────────

export async function serverGetSetting<T>(key: string, fallback: T): Promise<T> {
  const revalidate = key.includes("seo") || key.includes("categories") ? 3600 : 300;
  const cached = unstable_cache(
    async (): Promise<T> => {
      return await sbGetSetting(key, fallback);
    },
    [key],
    { revalidate, tags: [`setting:${key}`] }
  );
  return cached();
}

export async function serverSaveSetting(key: string, value: unknown): Promise<void> {
  await sbSaveSetting(key, value);
  revalidateTag(`setting:${key}`);
}

// ── Article CUD ───────────────────────────────────────────

/**
 * 기사 순서 번호를 증가하여 반환
 * 1순위: Supabase get_next_article_no() RPC (원자적 — PostgreSQL 시퀀스 + MAX(no) 검증)
 * 2순위: MAX(no)+1 직접 계산 (RPC 미설치 시)
 */
export async function getNextArticleNo(): Promise<number> {
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
  // 모든 기사에 순서 번호 자동 부여 (없는 경우에만)
  let assignedNo = article.no;
  if (!assignedNo) {
    try {
      assignedNo = await getNextArticleNo();
      article = { ...article, no: assignedNo };
    } catch (e) {
      console.warn("[DB] 기사 번호 부여 실패:", (e as Error).message?.slice(0, 80));
    }
  }

  // 기사 ID가 없거나, 숫자가 아니거나, UUID 형식이거나, 너무 길면 무조건 순서 번호(no) 기반 숫자로 교체
  const isNumeric = article.id && /^\d+$/.test(article.id);
  const isUUID = article.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(article.id);
  
  if (assignedNo && (!article.id || !isNumeric || isUUID || article.id.length > 20)) {
    console.log(`[DB] 기사 ID를 숫자로 변환: ${article.id || "신규"} -> ${assignedNo}`);
    article = { ...article, id: String(assignedNo) };
  }

  await sbCreateArticle(article);
  return assignedNo;
}

export async function serverUpdateArticle(id: string, updates: Partial<Article>): Promise<void> {
  return await sbUpdateArticle(id, updates);
}

/** 소프트 삭제 (휴지통으로 이동) */
export async function serverDeleteArticle(id: string): Promise<void> {
  return await sbDeleteArticle(id);
}

/** 영구 삭제 (DB에서 완전 제거) */
export async function serverPurgeArticle(id: string): Promise<void> {
  return await sbPurgeArticle(id);
}

/** 휴지통 복원 (deleted_at 제거) */
export async function serverRestoreArticle(id: string): Promise<void> {
  return serverUpdateArticle(id, { deletedAt: null } as unknown as Partial<Article>);
}

/** 휴지통 기사 목록 */
export async function serverGetDeletedArticles(): Promise<Article[]> {
  return sbGetDeletedArticles();
}

export async function serverIncrementViews(id: string, botInfo?: { isBot?: boolean; botName?: string }): Promise<void> {
  // 봇 조회는 조회수에 카운트하지 않고 로그만 기록
  if (botInfo?.isBot) {
    try {
      await serverAddViewLog({ articleId: id, path: `/article/${id}`, isAdmin: false, isBot: true, botName: botInfo.botName });
    } catch { /* 로그 실패 무시 */ }
    return;
  }
  return await sbIncrementViews(id);
}

// ── View Logs ─────────────────────────────────────────────

export async function serverGetViewLogs(): Promise<ViewLogEntry[]> {
  return await sbGetSetting<ViewLogEntry[]>("cp-view-logs", []);
}

export async function serverAddViewLog(entry: { articleId: string; path: string; isAdmin?: boolean; isBot?: boolean; botName?: string }): Promise<void> {
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
}

// ── Distribute Logs ───────────────────────────────────────

export async function serverGetDistributeLogs(): Promise<DistributeLog[]> {
  return await sbGetSetting<DistributeLog[]>("cp-distribute-logs", []);
}

export async function serverAddDistributeLogs(logs: DistributeLog[]): Promise<void> {
  const existing = await sbGetSetting<DistributeLog[]>("cp-distribute-logs", []);
  await sbSaveSetting("cp-distribute-logs", [...logs, ...existing].slice(0, 100));
}

export async function serverClearDistributeLogs(): Promise<void> {
  await sbSaveSetting("cp-distribute-logs", []);
}
