/**
 * 보도자료 자동 수집·편집·등록 크론 핸들러
 * POST /api/cron/auto-press
 * GET  /api/cron/auto-press
 *
 * Body (JSON, 선택):
 *   { count?, keywords?, category?, publishStatus?, source?: "cron"|"manual"|"cli", preview? }
 *
 * 규칙:
 *   - netpro(정부 보도자료 RSS / 뉴스와이어) 목록 → 상세 → AI 편집 → 기사 저장
 *   - 본문에 이미지 없으면 등록하지 않음
 *   - 평일: 오늘/어제 자료만 허용, 주말: 직전 금요일까지만 허용
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serverGetSetting, serverSaveSetting, serverCreateArticle } from "@/lib/db-server";
import { serverUploadImageUrl } from "@/lib/server-upload-image";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { getBaseUrl } from "@/lib/get-base-url";
import { decodeHtmlEntities as sharedDecodeHtml } from "@/lib/html-utils";
import {
  extractTitle as htmlExtractTitle, extractDate as htmlExtractDate,
  extractBodyHtml as htmlExtractBodyHtml, toPlainText as htmlToPlainText,
  extractImages as htmlExtractImages, extractThumbnail as htmlExtractThumbnail,
} from "@/lib/html-extract";
import type {
  AutoPressSettings, AutoPressSource,
  AutoPressRun, AutoPressArticleResult,
} from "@/types/article";
import type { Article } from "@/types/article";

import { DEFAULT_AUTO_PRESS_SETTINGS } from "@/lib/auto-defaults";

// ── 인증 (미들웨어와 동일한 방식: Bearer CRON_SECRET 또는 쿠키) ──
async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    if (bearer && timingSafeEqual(bearer, secret)) return true;
  }
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

// ── 날짜 유효성 검사 (KST 기준) ─────────────────────────────
/**
 * 평일: 오늘/어제 자료만 허용
 * 주말(토/일): 직전 금요일(워킹데이-1)까지 허용
 */
function isDateAllowed(dateStr: string, dateRangeDays?: number): boolean {
  if (!dateStr) return false;

  const cleaned = dateStr.replace(/\./g, "-").trim();
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstToday = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());

  let itemDate: Date;
  const parts = cleaned.split("-").map((p) => p.trim());
  if (parts.length === 3) {
    let year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    if (year < 100) year += 2000;
    itemDate = new Date(year, month, day);
  } else if (parts.length === 2) {
    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    itemDate = new Date(kstToday.getFullYear(), month, day);
  } else {
    return false;
  }

  if (isNaN(itemDate.getTime())) return false;

  // 사용자 지정 범위가 있으면 그대로 사용 (워킹데이 N일)
  if (dateRangeDays && dateRangeDays > 0) {
    const cutoff = new Date(kstToday);
    cutoff.setDate(cutoff.getDate() - dateRangeDays);
    return itemDate >= cutoff && itemDate <= kstToday;
  }

  // 기본: 요일 기반 자동 계산
  const dayOfWeek = kstToday.getDay();
  let cutoffDate: Date;
  if (dayOfWeek === 0) {
    cutoffDate = new Date(kstToday);
    cutoffDate.setDate(cutoffDate.getDate() - 2);
  } else if (dayOfWeek === 6) {
    cutoffDate = new Date(kstToday);
    cutoffDate.setDate(cutoffDate.getDate() - 1);
  } else if (dayOfWeek === 1) {
    cutoffDate = new Date(kstToday);
    cutoffDate.setDate(cutoffDate.getDate() - 3);
  } else {
    cutoffDate = new Date(kstToday);
    cutoffDate.setDate(cutoffDate.getDate() - 1);
  }

  return itemDate >= cutoffDate && itemDate <= kstToday;
}

// ── 직접 RSS 파싱 ───────────────────────────────────────────
interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function decodeHtmlEntities(text: string): string {
  return sharedDecodeHtml(text);
}

/** XSS 위험 요소 제거: <script> 태그 및 on* 이벤트 핸들러 */
function stripDangerousHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}

function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const extract = (tag: string) => {
      // CDATA 지원
      const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
      const cm = block.match(cdataRe);
      if (cm) return decodeHtmlEntities(cm[1].trim());
      const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
      const pm = block.match(plainRe);
      return pm ? decodeHtmlEntities(pm[1].trim()) : "";
    };
    const title = stripDangerousHtml(extract("title"));
    let link = extract("link");
    if (!link) {
      const hrefMatch = block.match(/href="([^"]+)"/);
      if (hrefMatch) link = hrefMatch[1];
    }
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: extract("pubDate") || extract("dc:date") || "",
      description: stripDangerousHtml(extract("description")).replace(/<[^>]+>/g, "").slice(0, 300),
    });
  }
  return items;
}

async function fetchRssFeed(url: string, maxItems: number): Promise<RssItem[]> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "CulturePeople-Bot/1.0" },
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseRssXml(xml).slice(0, maxItems);
  } catch {
    console.error(`[auto-press] RSS 수집 실패: ${url}`);
    return [];
  }
}

// ── 원문 직접 수집 (self-fetch 제거: Vercel serverless 타임아웃 방지) ──
async function fetchOriginContent(
  _baseUrl: string,
  articleUrl: string
): Promise<{ title: string; bodyHtml: string; bodyText: string; date: string; images: string[]; sourceUrl: string } | null> {
  try {
    const resp = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    const html = await resp.text();
    const finalUrl = resp.url || articleUrl;

    const title = htmlExtractTitle(html);
    const date = htmlExtractDate(html);
    const bodyHtml = htmlExtractBodyHtml(html, finalUrl);
    const bodyText = htmlToPlainText(bodyHtml);
    const images = htmlExtractImages(bodyHtml);
    const thumbnail = htmlExtractThumbnail(html, finalUrl);
    if (thumbnail && !images.includes(thumbnail)) images.unshift(thumbnail);

    return { title, bodyHtml, bodyText, date, images, sourceUrl: finalUrl };
  } catch { return null; }
}

// ── netpro 목록 수집 ────────────────────────────────────────
interface NetproListItem {
  wr_id: string;
  title: string;
  category: string;
  writer: string;
  date: string;
  detail_url: string;
}

async function fetchNetproList(
  baseUrl: string,
  boTable: string,
  sca: string,
  maxItems: number
): Promise<NetproListItem[]> {
  try {
    const params = new URLSearchParams({ bo_table: boTable, page: "1", sca, stx: "" });
    const headers: Record<string, string> = {};
    const secret = process.env.CRON_SECRET;
    if (secret) headers["Authorization"] = `Bearer ${secret}`;
    const resp = await fetch(`${baseUrl}/api/netpro/list?${params}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!data.success) return [];
    return (data.items ?? []).slice(0, maxItems);
  } catch { return []; }
}

// ── netpro 상세 수집 ────────────────────────────────────────
interface NetproDetail {
  title: string;
  bodyText: string;
  bodyHtml: string;
  date: string;
  writer: string;
  images: string[];
  sourceUrl: string;
}

async function fetchNetproDetail(
  baseUrl: string,
  boTable: string,
  wrId: string
): Promise<NetproDetail | null> {
  try {
    const params = new URLSearchParams({ bo_table: boTable, wr_id: wrId });
    const headers: Record<string, string> = {};
    const secret = process.env.CRON_SECRET;
    if (secret) headers["Authorization"] = `Bearer ${secret}`;
    const resp = await fetch(`${baseUrl}/api/netpro/detail?${params}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.success) return null;
    return {
      title: data.title || "",
      bodyText: data.bodyText || "",
      bodyHtml: data.bodyHtml || "",
      date: data.date || "",
      writer: data.writer || "",
      images: data.images || [],
      sourceUrl: data.sourceUrl || "",
    };
  } catch { return null; }
}

// ── 이미지 확인 ──────────────────────────────────────────────
function hasImages(bodyHtml: string, images: string[]): boolean {
  if (images && images.length > 0) return true;
  return /<img[^>]+src=["'][^"']+["']/i.test(bodyHtml);
}

// ── AI 편집 (공유 모듈 사용) ─────────────────────────────────
import { aiEditArticle, extractAiJson as extractJson, VALID_CATEGORIES, type AiEditResult as AiResult } from "@/lib/ai-prompt";

// ── 제목 정규화: 공백·특수문자 제거 + 소문자 + 유니코드 NFC 정규화 ──
function normalizeTitle(t: string): string {
  return t.replace(/\s+/g, "").replace(/[^\w가-힣]/g, "").toLowerCase().normalize("NFC");
}

// ── DB 기사 캐시 (중복 체크용, 한 번만 로드) ─────────────────
let _dbArticlesCache: { urls: Set<string>; titles: Set<string>; ts: number } | null = null;
const DB_CACHE_TTL = 30 * 60 * 1000; // 30분 TTL
async function getDbArticlesCache(): Promise<{ urls: Set<string>; titles: Set<string> }> {
  if (_dbArticlesCache && Date.now() - _dbArticlesCache.ts < DB_CACHE_TTL) return _dbArticlesCache;
  try {
    const { serverGetArticles } = await import("@/lib/db-server");
    const articles = await serverGetArticles();
    const urls = new Set(articles.filter((a) => a.sourceUrl).map((a) => a.sourceUrl!));
    const titles = new Set(articles.map((a) => normalizeTitle(a.title)));
    _dbArticlesCache = { urls, titles, ts: Date.now() };
  } catch {
    _dbArticlesCache = { urls: new Set(), titles: new Set(), ts: Date.now() };
  }
  return _dbArticlesCache;
}

// ── 중복 체크 (이력 + DB) ────────────────────────────────────
async function isDuplicate(wrId: string, boTable: string, history: AutoPressRun[], windowHours: number, sourceUrl?: string, title?: string): Promise<boolean> {
  // 1) 이력 기반 (기존)
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  for (const run of history) {
    if (run.startedAt < cutoff) continue;
    if (run.articles.some((a) => a.wrId === wrId && a.boTable === boTable && (a.status === "ok" || a.status === "fail"))) return true;
  }
  // 2) DB 기반 — source_url 또는 제목 일치
  const cache = await getDbArticlesCache();
  if (sourceUrl && cache.urls.has(sourceUrl)) return true;
  if (title && cache.titles.has(normalizeTitle(title))) return true;
  return false;
}

/** 같은 실행 내 등록된 기사를 캐시에 즉시 반영 (동일 배치 중복 방지) */
function addToDbCache(sourceUrl?: string, title?: string) {
  if (!_dbArticlesCache) return;
  if (sourceUrl) _dbArticlesCache.urls.add(sourceUrl);
  if (title) _dbArticlesCache.titles.add(normalizeTitle(title));
}

// ── 이미지 재업로드 (HTML 내 img src) ────────────────────────
async function reuploadBodyImages(html: string): Promise<string> {
  const imgRegex = /<img([^>]*)src=["'](https?:\/\/[^"']+)["']([^>]*)>/gi;
  const matches = [...html.matchAll(imgRegex)];
  let result = html;
  for (const m of matches) {
    const originalUrl = m[2];
    // 이미 supabase URL이면 스킵
    if (originalUrl.includes("supabase")) continue;
    const uploaded = await serverUploadImageUrl(originalUrl);
    if (uploaded) {
      result = result.replace(originalUrl, uploaded);
    }
  }
  return result;
}

// ── 메인 실행 함수 ───────────────────────────────────────────
async function runAutoPress(options: {
  source?: "cron" | "manual" | "cli";
  countOverride?: number;
  keywordsOverride?: string[];
  categoryOverride?: string;
  statusOverride?: "게시" | "임시저장";
  preview?: boolean;
  force?: boolean;
  dateRangeDays?: number; // 수집 날짜 범위 (일 수)
  noAiEdit?: boolean; // AI 편집 건너뛰기
  wrIds?: string[]; // "boTable:wrId" 형식으로 특정 기사만 지정
  excludeUrls?: string[]; // 이전 실행에서 시도한 URL (중복 방지)
  baseUrl?: string;
}): Promise<AutoPressRun> {
  const startedAt = new Date().toISOString();
  const runId = `press_${Date.now()}`;
  const src = options.source ?? "manual";

  const settings = await serverGetSetting<AutoPressSettings>("cp-auto-press-settings", DEFAULT_AUTO_PRESS_SETTINGS);
  const aiSettings = await serverGetSetting<{ geminiApiKey?: string; openaiApiKey?: string }>("cp-ai-settings", {});

  const count = options.countOverride ?? settings.count ?? 5;
  const keywords = options.keywordsOverride ?? settings.keywords ?? [];
  const category = options.categoryOverride ?? settings.category ?? "공공";
  const publishStatus = options.statusOverride ?? settings.publishStatus ?? "임시저장";
  const aiProvider = settings.aiProvider ?? "gemini";
  const aiModel = settings.aiModel ?? "gemini-2.0-flash";
  const author = settings.author ?? "";
  const requireImage = settings.requireImage !== false;

  const apiKey = aiProvider === "openai"
    ? (aiSettings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "")
    : (aiSettings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "");

  const baseUrl = options.baseUrl ?? getBaseUrl();

  const history = await serverGetSetting<AutoPressRun[]>("cp-auto-press-history", []);

  const activeSources = (settings.sources ?? DEFAULT_AUTO_PRESS_SETTINGS.sources).filter((s) => s.enabled);
  if (activeSources.length === 0) {
    return {
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "설정 오류", sourceUrl: "", wrId: "", boTable: "", status: "fail", error: "활성화된 소스가 없습니다." }],
    };
  }

  // wrIds 지정 시 특정 기사만 처리
  // 통합 타겟 타입: netpro 또는 rss 원본
  interface PressTarget {
    item: NetproListItem;
    source: AutoPressSource;
    rssLink?: string; // RSS 직접 수집 시 원문 URL
  }
  let targets: PressTarget[];

  if (options.wrIds && options.wrIds.length > 0) {
    targets = options.wrIds.map((wrIdStr) => {
      const [boTable, wrId] = wrIdStr.split(":");
      const source = activeSources.find((s) => s.boTable === boTable) ?? { id: boTable, name: boTable, boTable: boTable as "rss" | "newswire", sca: "", enabled: true as const };
      return { item: { wr_id: wrId, title: "", category: "", writer: "", date: "", detail_url: "" }, source };
    });
  } else {
    const allItems: PressTarget[] = [];

    // netpro 소스와 RSS 직접 소스 분리
    const netproSources = activeSources.filter((s) => s.fetchType !== "rss");
    const rssSources = activeSources.filter((s) => s.fetchType === "rss" && s.rssUrl);

    // 1) netpro 소스 수집 (기존 방식)
    const netproResults = await Promise.all(
      netproSources.map(async (source) => {
        const items = await fetchNetproList(baseUrl, source.boTable, source.sca, Math.ceil(count * 3));
        return items.map((item) => ({ item, source } as PressTarget));
      })
    );
    for (const items of netproResults) allItems.push(...items);

    // 2) RSS 직접 수집 (원천 사이트)
    const rssResults = await Promise.all(
      rssSources.map(async (source) => {
        const rssItems = await fetchRssFeed(source.rssUrl!, Math.ceil(count * 3));
        return rssItems.map((rssItem) => {
          // RSS 아이템을 NetproListItem 호환 형태로 변환
          // wr_id: URL 기반 고유키 생성
          const wrId = Buffer.from(rssItem.link).toString("base64url").slice(0, 40);
          return {
            item: {
              wr_id: wrId,
              title: rssItem.title,
              category: source.name,
              writer: "",
              date: rssItem.pubDate ? new Date(rssItem.pubDate).toISOString().slice(0, 10) : "",
              detail_url: rssItem.link,
            },
            source,
            rssLink: rssItem.link,
          } as PressTarget;
        });
      })
    );
    for (const items of rssResults) allItems.push(...items);

    // 키워드 필터
    const filtered = allItems.filter(({ item }) => {
      if (keywords.length === 0) return true;
      return keywords.some((kw) => item.title.includes(kw));
    });

    // 중복 제거 + excludeUrls (이전 실행에서 시도한 URL 제외)
    const excludeSet = new Set(options.excludeUrls ?? []);
    const seen = new Set<string>();
    const deduped: typeof filtered = [];
    for (const entry of filtered) {
      const key = `${entry.source.id}:${entry.item.wr_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entryUrl = entry.rssLink || entry.item.detail_url || "";
      // 이전 실행에서 시도한 URL이면 건너뛰기
      if (entryUrl && excludeSet.has(entryUrl)) continue;
      if (entry.item.title && excludeSet.has(entry.item.title)) continue;
      const dup = await isDuplicate(entry.item.wr_id, entry.source.boTable, history, settings.dedupeWindowHours ?? 48, entryUrl, entry.item.title);
      if (!dup) deduped.push(entry);
    }

    targets = deduped.slice(0, count * 2);
  }
  const results: AutoPressArticleResult[] = [];
  let published = 0;
  const TIMEOUT_MS = 50_000; // 50초 안전 마진 (Vercel 60초 제한)
  const startTime = Date.now();
  let timedOut = false;

  for (const target of targets) {
    const { item, source, rssLink } = target;
    if (published >= count) break;

    // 타임아웃 체크: 50초 경과 시 현재까지 결과 저장 후 조기 종료
    if (Date.now() - startTime > TIMEOUT_MS) {
      timedOut = true;
      console.warn(`[auto-press] 50초 안전 마진 도달, ${published}건 등록 후 조기 종료`);
      break;
    }

    // preview 모드
    if (options.preview) {
      results.push({ title: item.title, sourceUrl: rssLink || "", wrId: item.wr_id, boTable: source.boTable, status: "ok" });
      published++;
      continue;
    }

    // 상세 수집: RSS 직접 소스는 netpro/origin, 기존은 netpro/detail
    let detail: { title: string; bodyText: string; bodyHtml: string; date: string; writer?: string; images: string[]; sourceUrl: string } | null = null;

    if (source.fetchType === "rss" && rssLink) {
      // RSS 소스 → netpro/origin으로 원문 수집
      const origin = await fetchOriginContent(baseUrl, rssLink);
      if (origin) {
        detail = {
          title: origin.title || item.title,
          bodyText: origin.bodyText,
          bodyHtml: origin.bodyHtml,
          date: origin.date || item.date,
          writer: "",
          images: origin.images,
          sourceUrl: origin.sourceUrl || rssLink,
        };
      }
    } else {
      // 기존 netpro 방식
      detail = await fetchNetproDetail(baseUrl, source.boTable, item.wr_id);
    }

    if (!detail || !detail.bodyText || detail.bodyText.length < 50) {
      results.push({ title: item.title, sourceUrl: rssLink || "", wrId: item.wr_id, boTable: source.boTable, status: "fail", error: "상세 수집 실패" });
      continue;
    }

    // 날짜 체크 (상세의 date 또는 목록의 date) — force 시 우회
    const itemDate = detail.date || item.date;
    if (!options.force && !isDateAllowed(itemDate, options.dateRangeDays)) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "old", error: `날짜 제한 (${itemDate})` });
      continue;
    }

    // 이미지 필수 체크 (1차) — bodyHtml의 img 태그 + images 배열 + bodyText 내 이미지 URL도 확인
    // 최종 이미지 체크는 AI 편집·이미지 복원 후 아래에서 재확인
    const bodyHasImageUrl = /https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp)(\?[^\s"'<>]*)?/i.test(detail.bodyText || "");
    if (requireImage && !hasImages(detail.bodyHtml, detail.images) && !bodyHasImageUrl) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "no_image", error: "본문 이미지 없음" });
      continue;
    }

    // 금칙어 필터 — 본문에 금칙어 포함 시 건너뜀
    const BLOCKED_KEYWORDS = ["전대통령"];
    const bodyTextLower = detail.bodyText || "";
    if (BLOCKED_KEYWORDS.some((kw) => bodyTextLower.includes(kw))) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "skip", error: `금칙어 포함` });
      continue;
    }

    // AI 편집 (noAiEdit 시 건너뜀)
    const edited = (apiKey && !options.noAiEdit)
      ? await aiEditArticle(aiProvider, aiModel, apiKey, item.title, detail.bodyText.slice(0, 3000), detail.bodyHtml)
      : null;

    const aiFailed = !edited && apiKey && !options.noAiEdit;

    // AI 편집 실패 시 관리자 알림 (메일 + 활동 로그)
    if (aiFailed) {
      console.error(`[auto-press] AI 편집 5회 실패: ${item.title.slice(0, 50)}`);
      // 활동 로그에 기록
      try {
        const logs = await serverGetSetting<{ action: string; target: string; detail: string; timestamp: string; user: string }[]>("cp-activity-logs", []);
        logs.unshift({
          action: "AI편집실패",
          target: item.title.slice(0, 100),
          detail: `보도자료 AI 편집 5회 시도 후 실패. 임시저장함에 저장됨. 원문: ${detail.sourceUrl || ""}`,
          timestamp: new Date().toISOString(),
          user: "시스템",
        });
        await serverSaveSetting("cp-activity-logs", logs.slice(0, 1000));
      } catch { /* 로그 실패 무시 */ }
      // 관리자 메일 발송 시도
      try {
        const nodemailer = await import("nodemailer");
        const nlSettings = await serverGetSetting<{ smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; smtpSecure?: boolean; senderEmail?: string; senderName?: string }>("cp-newsletter-settings", {});
        if (nlSettings.smtpHost && nlSettings.smtpUser && nlSettings.smtpPass) {
          const transporter = nodemailer.default.createTransport({
            host: nlSettings.smtpHost,
            port: nlSettings.smtpPort || 587,
            secure: nlSettings.smtpSecure ?? false,
            auth: { user: nlSettings.smtpUser, pass: nlSettings.smtpPass },
          });
          await transporter.sendMail({
            from: `"컬처피플 시스템" <${nlSettings.senderEmail || nlSettings.smtpUser}>`,
            to: "curpy@naver.com",
            subject: `[컬처피플] AI 편집 실패 알림 — ${item.title.slice(0, 30)}`,
            html: `<p>보도자료 AI 편집이 5회 시도 후 실패했습니다.</p>
<p><b>제목:</b> ${item.title}</p>
<p><b>원문:</b> <a href="${detail.sourceUrl || "#"}">${detail.sourceUrl || "없음"}</a></p>
<p><b>상태:</b> 임시저장함에 저장됨 — 수동 검토 필요</p>
<p><a href="https://culturepeople.co.kr/cam/articles?status=임시저장">임시저장 기사 확인하기</a></p>`,
          });
          console.log(`[auto-press] AI 실패 알림 메일 발송: ${item.title.slice(0, 30)}`);
        }
      } catch { /* 메일 발송 실패 무시 */ }
    }

    const finalTitle = edited?.title || item.title;
    // AI 실패 시 원문 HTML(뉴스와이어 잔재 포함) 대신 텍스트를 <p> 태그로 감싸서 저장
    let finalBody = edited?.body || detail.bodyText.split(/\n\n+/).filter(p => p.trim().length > 20).map(p => `<p>${p.trim()}</p>`).join("\n\n") || `<p>${detail.bodyText.slice(0, 1000)}</p>`;
    const finalSummary = edited?.summary || "";
    const finalTags = edited?.tags || "";
    const finalCategory = (edited?.category && VALID_CATEGORIES.includes(edited.category)) ? edited.category : category;
    // AI 편집 실패 시 임시저장으로 전환
    const articleStatus = aiFailed ? "임시저장" : publishStatus;

    // AI 결과에 이미지가 빠졌으면 원문 이미지 복원
    if (!/<img[^>]+src=/i.test(finalBody) && detail.images.length > 0) {
      // 2번째 </p> 뒤에 첫 이미지 삽입
      const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${detail.images[0]}" alt="${finalTitle.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
      let pCount = 0;
      let insertIdx = -1;
      let pos = 0;
      while (pos < finalBody.length) {
        const found = finalBody.indexOf("</p>", pos);
        if (found === -1) break;
        pCount++;
        if (pCount === 2) { insertIdx = found + 4; break; }
        pos = found + 4;
      }
      if (insertIdx === -1) {
        finalBody = finalBody + imgHtml;
      } else {
        finalBody = finalBody.slice(0, insertIdx) + imgHtml + finalBody.slice(insertIdx);
      }
    }

    // 최종 이미지 없으면 건너뜀
    if (requireImage && !/<img[^>]+src=/i.test(finalBody)) {
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "no_image", error: "AI 편집 후 이미지 없음" });
      continue;
    }

    // 본문 이미지 재업로드 (Supabase)
    finalBody = await reuploadBodyImages(finalBody);

    // 대표이미지: 본문 첫 이미지 → thumbnail으로 승격 후 본문에서 제거 (중복 방지)
    let thumbnail = "";
    const firstImgMatch = finalBody.match(/<(?:figure[^>]*>)?\s*<img[^>]+src=["']([^"']+)["'][^>]*>\s*(?:<\/figure>)?/i);
    if (firstImgMatch?.[1]) {
      thumbnail = firstImgMatch[1];
      // 대표이미지가 외부 URL이면 Supabase로 재업로드
      if (thumbnail && !thumbnail.includes("supabase")) {
        try {
          const uploaded = await serverUploadImageUrl(thumbnail);
          if (uploaded) thumbnail = uploaded;
        } catch { /* 실패 시 원본 유지 */ }
      }
      // 본문에서 첫 이미지(figure 감싸기 포함) 제거
      finalBody = finalBody.replace(firstImgMatch[0], "").trim();
    }

    // 기사 저장
    try {
      const articleId = crypto.randomUUID();
      const today = new Date().toISOString().slice(0, 10);
      const article: Article = {
        id: articleId,
        title: finalTitle,
        category: finalCategory,
        date: today,
        status: articleStatus,
        views: 0,
        body: finalBody,
        thumbnail: thumbnail || undefined,
        tags: finalTags || undefined,
        author: author || detail.writer || undefined,
        summary: finalSummary || undefined,
        sourceUrl: detail.sourceUrl || undefined,
        updatedAt: new Date().toISOString(),
        aiGenerated: !!edited,
        reviewNote: aiFailed ? "AI 편집 실패 — 수동 검토 필요 (3회 재시도 소진)" : undefined,
      };
      // 대표이미지 접속 검증 → 실패 시 본문 이미지로 대체
      if (thumbnail && !thumbnail.includes("supabase")) {
        try {
          const chk = await fetch(thumbnail, { method: "HEAD", signal: AbortSignal.timeout(5000) });
          if (!chk.ok) thumbnail = "";
        } catch { thumbnail = ""; }
        if (!thumbnail) {
          // 본문에서 Supabase 이미지 추출
          const sbMatch = finalBody.match(/<img[^>]+src="(https:\/\/ifducnfrjarmlpktrjkj[^"]+)"/i);
          if (sbMatch?.[1]) thumbnail = sbMatch[1];
        }
        article.thumbnail = thumbnail || undefined;
      }
      await serverCreateArticle(article);
      // Next.js ISR 캐시 무효화 — 기사 목록에 즉시 반영
      try { revalidateTag("articles"); } catch { /* 캐시 무효화 실패 무시 */ }
      // 같은 배치 내 중복 방지: 등록 즉시 캐시 업데이트
      addToDbCache(detail.sourceUrl, finalTitle);
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "ok", articleId });
      published++;

      // 건별 이력 즉시 저장 — 타임아웃 시에도 등록된 기사 유실 방지
      if (!options.preview) {
        try {
          const partialRun: AutoPressRun = {
            id: runId, startedAt, completedAt: new Date().toISOString(), source: src,
            articlesPublished: results.filter((r) => r.status === "ok").length,
            articlesSkipped: results.filter((r) => r.status === "no_image" || r.status === "old" || r.status === "skip").length,
            articlesFailed: results.filter((r) => r.status === "fail").length,
            articles: [...results],
          };
          const updatedHistory = [partialRun, ...history.filter((h) => h.id !== runId)].slice(0, 50);
          await serverSaveSetting("cp-auto-press-history", updatedHistory);
        } catch { /* 이력 저장 실패는 무시 — 기사는 이미 DB에 저장됨 */ }
      }
    } catch (e) {
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "fail", error: e instanceof Error ? e.message : "처리 실패" });
    }

    // rate limit 방어
    await new Promise((r) => setTimeout(r, 500));
  }

  const skipped = results.filter((r) => r.status === "no_image" || r.status === "old" || r.status === "skip").length;

  const run: AutoPressRun = {
    id: runId,
    startedAt,
    completedAt: new Date().toISOString(),
    source: src,
    articlesPublished: results.filter((r) => r.status === "ok").length,
    articlesSkipped: skipped,
    articlesFailed: results.filter((r) => r.status === "fail").length,
    articles: timedOut
      ? [...results, { title: "⏱️ 시간 초과", sourceUrl: "", wrId: "", boTable: "" as "rss", status: "skip" as const, error: `50초 안전 마진 도달, ${published}건 등록 후 조기 종료. 나머지는 다음 실행에서 처리됩니다.` }]
      : results,
  };

  if (!options.preview) {
    const newHistory = [run, ...history.filter((h) => h.id !== runId)].slice(0, 50);
    await serverSaveSetting("cp-auto-press-history", newHistory);
  }

  return run;
}

// ── HTTP 핸들러 ──────────────────────────────────────────────
async function handler(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    } else {
      const sp = new URL(req.url).searchParams;
      if (sp.get("count")) { const parsed = parseInt(sp.get("count")!); if (!isNaN(parsed) && parsed > 0) body.count = parsed; }
      if (sp.get("keywords")) body.keywords = sp.get("keywords")!.split(",").map((k) => k.trim());
      if (sp.get("category")) body.category = sp.get("category");
      if (sp.get("status")) body.publishStatus = sp.get("status");
      if (sp.get("preview")) body.preview = sp.get("preview") === "true";
      if (sp.get("force")) body.force = sp.get("force") === "true";
      if (sp.get("dateRangeDays")) body.dateRangeDays = sp.get("dateRangeDays");
      if (sp.get("noAiEdit")) body.noAiEdit = sp.get("noAiEdit") === "true";
    }

    // baseUrl은 환경변수만 허용 (body.baseUrl, x-forwarded-host SSRF 방지)
    // 로컬 개발 시 origin 사용
    const origin = new URL(req.url).origin;
    const baseUrl = origin.includes("localhost") ? origin : getBaseUrl();

    const run = await runAutoPress({
      source: (body.source as "cron" | "manual" | "cli") ?? "manual",
      countOverride: body.count as number | undefined,
      keywordsOverride: body.keywords as string[] | undefined,
      categoryOverride: body.category as string | undefined,
      statusOverride: body.publishStatus as "게시" | "임시저장" | undefined,
      preview: body.preview as boolean | undefined,
      force: body.force as boolean | undefined,
      dateRangeDays: body.dateRangeDays ? Number(body.dateRangeDays) : undefined,
      noAiEdit: body.noAiEdit as boolean | undefined,
      wrIds: body.wrIds as string[] | undefined,
      excludeUrls: body.excludeUrls as string[] | undefined,
      baseUrl,
    });

    // ── 체인콜: 메일 동기화 (cron 호출 시에만, 설정 활성화 시) ──
    let mailSyncResult: { success: boolean; error?: string } | null = null;
    if (body.source === "cron" || !body.source) {
      try {
        const mailSettings = await serverGetSetting<{ autoSync?: boolean; autoSyncDays?: number }>("cp-mail-settings", {});
        if (mailSettings.autoSync) {
          const syncDays = mailSettings.autoSyncDays || 1;
          const secret = process.env.CRON_SECRET;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (secret) headers["Authorization"] = `Bearer ${secret}`;
          try {
            const syncResp = await fetch(`${baseUrl}/api/mail/sync`, {
              method: "POST",
              headers,
              body: JSON.stringify({ days: syncDays }),
              signal: AbortSignal.timeout(55000),
            });
            if (syncResp.ok) {
              mailSyncResult = { success: true };
            } else {
              mailSyncResult = { success: false, error: `HTTP ${syncResp.status}` };
            }
          } catch (syncErr) {
            const errMsg = syncErr instanceof Error ? syncErr.message : "알 수 없는 오류";
            console.warn("[auto-press] mail/sync 체인콜 실패:", errMsg);
            mailSyncResult = { success: false, error: errMsg };
          }
        }
      } catch { /* 메일 설정 조회 실패는 무시 */ }
    }

    return NextResponse.json({ success: true, run, mailSync: mailSyncResult });
  } catch (e) {
    console.error("[auto-press] handler error:", e);
    return NextResponse.json({ success: false, error: "보도자료 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export const maxDuration = 60; // Vercel Hobby 최대 60초
export const POST = handler;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;

  // Vercel Cron 또는 외부 cron 서비스 (Bearer 토큰)
  if (cronSecret && authHeader.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), cronSecret)) {
    return handler(req);
  }

  // URL 파라미터로도 CRON_SECRET 전달 가능 (cron-job.org 등)
  const url = new URL(req.url);
  if (cronSecret && url.searchParams.get("secret") === cronSecret) {
    return handler(req);
  }

  // CRON_SECRET 없으면 상태만 반환
  return NextResponse.json({
    status: "ok",
    message: "Use POST to execute manually",
    enabled: true,
  });
}
