/**
 * 보도자료 자동 수집·편집·등록 크론 핸들러
 * POST /api/cron/auto-press
 * GET  /api/cron/auto-press
 *
 * Body (JSON, 선택):
 *   { count?, keywords?, category?, publishStatus?, source?: "cron"|"manual"|"cli", preview? }
 *
 * 규칙:
 *   - RSS 직접 수집(정부 보도자료 / 뉴스와이어) → 원문 추출 → AI 편집 → 기사 저장
 *   - 본문에 이미지 없으면 등록하지 않음
 *   - 평일: 오늘/어제 자료만 허용, 주말: 직전 금요일까지만 허용
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serverGetSetting, serverSaveSetting, serverCreateArticle, createNotification } from "@/lib/db-server";
import { serverUploadImageUrl } from "@/lib/server-upload-image";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import { getBaseUrl } from "@/lib/get-base-url";
import { decodeHtmlEntities as sharedDecodeHtml } from "@/lib/html-utils";
import { safeFetch } from "@/lib/safe-remote-url";
import { notifyTelegramArticleRegistered } from "@/lib/telegram-notify";
import { getMediaStorageRunSummary } from "@/lib/media-storage-health";
import {
  extractTitle as htmlExtractTitle, extractDate as htmlExtractDate,
  extractBodyHtml as htmlExtractBodyHtml, toPlainText as htmlToPlainText,
  extractImages as htmlExtractImages, extractThumbnail as htmlExtractThumbnail,
} from "@/lib/html-extract";
import { isNewswireUrl, extractNewswireArticle } from "@/lib/newswire-extract";
import { getUnregisteredFeeds, markAsRegistered } from "@/lib/cockroach-db";
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

function isCronBearerRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  return Boolean(secret && authHeader.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), secret));
}

function inferExecutionSource(req: NextRequest, requested?: unknown): "cron" | "manual" | "cli" {
  if (requested === "cron" || requested === "manual" || requested === "cli") return requested;
  return isCronBearerRequest(req) ? "cron" : "manual";
}

// ── 날짜 유효성 검사 (KST 기준) ─────────────────────────────
/**
 * 평일: 오늘/어제 자료만 허용
 * 주말(토/일): 직전 금요일(워킹데이-1)까지 허용
 */
function isDateAllowed(dateStr: string, dateRangeDays?: number): boolean {
  // 날짜 정보가 없는 경우, 최신 수집본이므로 일단 허용 (스킵 방지)
  if (!dateStr) return true;

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
    // 날짜 형식이 이상해도 일단 허용 (보수적 수집보다 적극적 수집)
    return true;
  }

  if (isNaN(itemDate.getTime())) return true;

  // 드롭박스에서 선택한 범위 (최근 N일) 적용
  // 0(자동)일 경우 기본적으로 최근 3일 이내 자료는 모두 허용 (넉넉하게 변경)
  const range = (dateRangeDays && dateRangeDays > 0) ? dateRangeDays : 3;
  
  const cutoff = new Date(kstToday);
  cutoff.setDate(cutoff.getDate() - range);
  
  // 수집 기사 날짜가 (오늘 - N일) 보다 크거나 같으면 허용
  return itemDate >= cutoff && itemDate <= kstNow;
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
    const { fetchWithRetry } = await import("@/lib/fetch-retry");
    const resp = await fetchWithRetry(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "CulturePeople-Bot/1.0" },
      maxRetries: 1,
      safeRemote: true,
      safeMaxRedirects: 5,
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
    const resp = await safeFetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(15000),
      maxRedirects: 5,
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    const html = await resp.text();
    const finalUrl = resp.url || articleUrl;

    // 뉴스와이어 전용 처리: section.article_column 기반 정밀 추출
    if (isNewswireUrl(finalUrl) || isNewswireUrl(articleUrl)) {
      const nw = extractNewswireArticle(html, finalUrl);
      if (nw) return nw;
      // 전용 파서 실패 시 범용 추출로 fallback
    }

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

// ── RSS 타겟 인터페이스 ─────────────────────────────────────
interface RssTarget {
  id: string;      // URL 기반 base64 고유키
  title: string;
  date: string;
  link: string;    // 원문 URL
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
  return t.replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase().normalize("NFC");
}

// ── DB 기사 캐시 (중복 체크용, 한 번만 로드) ─────────────────
let _dbArticlesCache: { urls: Set<string>; titles: Set<string>; ts: number } | null = null;
const DB_CACHE_TTL = 30 * 60 * 1000; // 30분 TTL
async function getDbArticlesCache(): Promise<{ urls: Set<string>; titles: Set<string> }> {
  if (_dbArticlesCache && Date.now() - _dbArticlesCache.ts < DB_CACHE_TTL) return _dbArticlesCache;
  try {
    const { serverGetRecentTitles } = await import("@/lib/db-server");
    const recent = await serverGetRecentTitles(100); // 30개에서 100개로 확대 (중복 방지 강화)
    const urls = new Set(recent.filter((a) => a.sourceUrl).map((a) => a.sourceUrl!));
    const titles = new Set(recent.map((a) => normalizeTitle(a.title)));
    _dbArticlesCache = { urls, titles, ts: Date.now() };
  } catch {
    _dbArticlesCache = { urls: new Set(), titles: new Set(), ts: Date.now() };
  }
  return _dbArticlesCache;
}

// ── 중복 체크 (이력 + DB) ────────────────────────────────────
async function isDuplicate(wrId: string, boTable: string, history: AutoPressRun[], windowHours: number, sourceUrl?: string, title?: string): Promise<boolean> {
  // 1) URL 기반 (가장 정확한 일련번호 기술 대체)
  const cache = await getDbArticlesCache();
  if (sourceUrl && cache.urls.has(sourceUrl)) {
    console.log(`[auto-press] URL 중복 스킵: ${sourceUrl}`);
    return true;
  }

  // 2) 이력 기반 (기존)
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  for (const run of history) {
    if (run.startedAt < cutoff) continue;
    if (run.articles.some((a) => a.sourceUrl === sourceUrl || (a.wrId === wrId && a.boTable === boTable && a.status === "ok"))) return true;
  }

  // 3) 제목 기반 (보조 수단)
  if (title && cache.titles.has(normalizeTitle(title))) {
    console.log(`[auto-press] 제목 유사성 중복 스킵: ${title}`);
    return true;
  }
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
export async function runAutoPress(options: {
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

  if (src === "cron" && !settings.cronEnabled) {
    console.log("[auto-press] cron 비활성화로 인해 실행 중단");
    return {
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "중단됨", sourceUrl: "", status: "skip", error: "자동 보도자료 cron이 비활성화되어 있습니다.", wrId: "", boTable: "" }],
    };
  }

  // 자동 보도자료 기능이 비활성화되어 있는 경우 (수동 실행 'manual' 제외한 모든 경우 중단)
  if (!settings.enabled && src !== "manual") {
    console.log(`[auto-press] 기능 비활성화로 인해 실행 중단 (source: ${src})`);
    return {
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "중단됨", sourceUrl: "", status: "skip", error: "자동 보도자료 기능이 비활성화되어 있습니다.", wrId: "", boTable: "" }],
    };
  }

  // DB 설정의 넷프로 경유 소스를 RSS 직접 수집으로 자동 전환 (마이그레이션)
  const NETPRO_SOURCE_IDS = new Set(["nw_all", "nw_economy", "nw_culture", "gov_policy", "gov_press"]);
  if (settings.sources) {
    // 넷프로 경유 소스 제거 (대응하는 RSS 소스가 이미 존재)
    settings.sources = settings.sources.filter((s) => !NETPRO_SOURCE_IDS.has(s.id));
    // fetchType이 "netpro"이거나 미지정인 소스를 "rss"로 전환
    settings.sources = settings.sources.map((s) => {
      if ((s.fetchType as string) === "netpro" || (!s.fetchType && !s.rssUrl)) {
        return { ...s, fetchType: "rss" as const };
      }
      return s;
    });
  }

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
  const mediaStorage = await getMediaStorageRunSummary({ remote: !options.preview }).catch((error) => ({
    ok: false,
    provider: "supabase" as const,
    configured: false,
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [],
    recommendations: ["Run /api/cron/media-storage-health to diagnose media storage before publishing."],
  }));
  const runWarnings = mediaStorage.ok ? [] : [
    `Media storage is unhealthy (${mediaStorage.provider}); image uploads may fail or fall back to original URLs.`,
  ];
  const articleWarnings = runWarnings.length > 0 ? runWarnings : undefined;
  if (!options.preview && src === "cron" && !mediaStorage.ok) {
    await createNotification(
      "media_storage",
      "Media storage check failed before auto-press run",
      mediaStorage.errors[0] || "Media storage is not healthy.",
      { route: "auto-press", mediaStorage },
    );
  }

  const activeSources = (settings.sources ?? DEFAULT_AUTO_PRESS_SETTINGS.sources).filter((s) => s.enabled);
  if (activeSources.length === 0) {
    return {
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "설정 오류", sourceUrl: "", wrId: "", boTable: "", status: "fail", error: "활성화된 소스가 없습니다." }],
    };
  }

  // 통합 타겟 타입: RSS + CockroachDB 하이브리드
  interface PressTarget {
    item: RssTarget;
    source: AutoPressSource;
    _feedId?: string;           // CockroachDB press_feeds.id (markAsRegistered용)
    _bodyHtml?: string | null;  // DB에서 가져온 본문 (fetchOriginContent 건너뛰기)
    _images?: string[];
    _thumbnail?: string | null;
  }
  let targets: PressTarget[];

  if (options.wrIds && options.wrIds.length > 0) {
    // wrIds는 "sourceId:link" 형식 (하위호환: "boTable:wrId"도 처리)
    targets = options.wrIds.map((wrIdStr) => {
      const colonIdx = wrIdStr.indexOf(":");
      const sourceId = colonIdx > -1 ? wrIdStr.slice(0, colonIdx) : wrIdStr;
      const link = colonIdx > -1 ? wrIdStr.slice(colonIdx + 1) : "";
      const source = activeSources.find((s) => s.id === sourceId || s.boTable === sourceId) ?? { id: sourceId, name: sourceId, boTable: "rss", sca: "", enabled: true as const, fetchType: "rss" as const };
      return { item: { id: Buffer.from(link).toString("base64url").slice(0, 40), title: "", date: "", link }, source };
    });
  } else {
    const allItems: PressTarget[] = [];

    // 모든 활성 소스에 대해 실시간 RSS 수집 우선 실행 (최신 기사 보장)
    const rssResults = await Promise.all(
      activeSources.map(async (source) => {
        if (!source.rssUrl) return [];
        try {
          const rssItems = await fetchRssFeed(source.rssUrl, Math.ceil(count * 5));
          return rssItems.map((rssItem) => ({
            item: {
              id: String(Math.abs(rssItem.link.split("").reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0))).slice(0, 10), // 일관된 숫자 해시 ID
              title: rssItem.title,
              date: rssItem.pubDate ? new Date(rssItem.pubDate).toISOString().slice(0, 10) : "",
              link: rssItem.link,
            },
            source,
          }));
        } catch (e) {
          console.warn(`[auto-press] RSS 수집 실패 (${source.name}):`, e instanceof Error ? e.message : e);
          return [];
        }
      })
    );
    for (const items of rssResults) allItems.push(...items);

    // 뉴스와이어 소스이고 RSS 결과가 부족한 경우에만 CockroachDB 보조 조회
    if (allItems.length < count) {
      const newswireSources = activeSources.filter((s) => s.id?.includes("newswire"));
      if (newswireSources.length > 0) {
        try {
          const dbFeeds = await getUnregisteredFeeds({
            keywords: keywords.length > 0 ? keywords : undefined,
            limit: count * 2,
          });
          const matchSource = newswireSources[0];
          for (const feed of dbFeeds) {
            // 이미 RSS로 가져온 URL이면 스킵
            if (allItems.some(it => it.item.link === feed.url)) continue;
            allItems.push({
              item: { id: feed.id, title: feed.title, date: feed.date || "", link: feed.url },
              source: matchSource,
              _feedId: feed.id,
              _bodyHtml: feed.body_html,
              _images: feed.images,
              _thumbnail: feed.thumbnail,
            });
          }
        } catch (e) { /* DB 조회 실패는 무시 */ }
      }
    }

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
      const key = `${entry.source.id}:${entry.item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entryUrl = entry.item.link || "";
      // 이전 실행에서 시도한 URL이면 건너뛰기
      if (entryUrl && excludeSet.has(entryUrl)) continue;
      if (entry.item.title && excludeSet.has(entry.item.title)) continue;
      const dup = await isDuplicate(entry.item.id, entry.source.boTable ?? "", history, settings.dedupeWindowHours ?? 48, entryUrl, entry.item.title);
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
    const { item, source } = target;
    if (published >= count) break;

    // 타임아웃 체크: 50초 경과 시 현재까지 결과 저장 후 조기 종료
    if (Date.now() - startTime > TIMEOUT_MS) {
      timedOut = true;
      console.warn(`[auto-press] 50초 안전 마진 도달, ${published}건 등록 후 조기 종료`);
      break;
    }

    // preview 모드
    if (options.preview) {
      results.push({ title: item.title, sourceUrl: item.link, wrId: item.id, boTable: source.boTable ?? "", status: "ok" });
      published++;
      continue;
    }

    // 상세 수집: CockroachDB 본문 우선 → 없으면 원문 직접 수집
    let detail: { title: string; bodyText: string; bodyHtml: string; date: string; writer?: string; images: string[]; sourceUrl: string } | null = null;

    if (target._bodyHtml) {
      // CockroachDB에서 본문이 있으면 원문 fetch 건너뛰기
      const plainText = target._bodyHtml.replace(/<[^>]+>/g, "");
      detail = {
        title: item.title,
        bodyHtml: target._bodyHtml,
        bodyText: plainText,
        date: item.date,
        writer: "",
        images: target._images || [],
        sourceUrl: item.link,
      };
    } else if (item.link) {
      const origin = await fetchOriginContent(baseUrl, item.link);
      if (origin) {
        detail = {
          title: origin.title || item.title,
          bodyText: origin.bodyText,
          bodyHtml: origin.bodyHtml,
          date: origin.date || item.date,
          writer: "",
          images: origin.images,
          sourceUrl: origin.sourceUrl || item.link,
        };
      }
    }

    if (!detail || !detail.bodyText || detail.bodyText.length < 50) {
      results.push({ title: item.title, sourceUrl: item.link || "", wrId: item.id, boTable: source.boTable ?? "", status: "fail", error: "상세 수집 실패" });
      continue;
    }

    // 날짜 체크 (상세의 date 또는 목록의 date) — force 시 우회
    const itemDate = detail.date || item.date;
    if (!options.force && !isDateAllowed(itemDate, options.dateRangeDays)) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "old", error: `날짜 제한 (${itemDate})` });
      continue;
    }

    // 이미지 필수 체크 (1차) — bodyHtml의 img 태그 + images 배열 + bodyText 내 이미지 URL도 확인
    // 최종 이미지 체크는 AI 편집·이미지 복원 후 아래에서 재확인
    const bodyHasImageUrl = /https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp)(\?[^\s"'<>]*)?/i.test(detail.bodyText || "");
    if (requireImage && !hasImages(detail.bodyHtml, detail.images) && !bodyHasImageUrl) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "no_image", error: "본문 이미지 없음" });
      continue;
    }

    // 금칙어 필터 — 본문에 금칙어 포함 시 건너뜀
    const BLOCKED_KEYWORDS = ["전대통령"];
    const bodyTextLower = detail.bodyText || "";
    if (BLOCKED_KEYWORDS.some((kw) => bodyTextLower.includes(kw))) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "skip", error: `금칙어 포함` });
      continue;
    }

    // AI 편집 (noAiEdit 시 건너뜀)
    let edited: AiResult | null = null;
    if (apiKey && !options.noAiEdit) {
      try {
        edited = await aiEditArticle(aiProvider, aiModel, apiKey, item.title, detail.bodyText.slice(0, 3000), detail.bodyHtml);
      } catch (e) {
        console.error(`[auto-press] AI 편집 오류: ${item.title.slice(0, 50)} - ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const aiFailed = !edited && apiKey && !options.noAiEdit;

    const finalTitle = edited?.title || item.title;
    // AI 실패 시 원문 HTML 대신 텍스트를 <p> 태그로 감싸서 저장 (복구 로직 강화)
    let finalBody = edited?.body || detail.bodyHtml || detail.bodyText.split(/\n\n+/).filter(p => p.trim().length > 20).map(p => `<p>${p.trim()}</p>`).join("\n\n");
    const finalSummary = edited?.summary || "";
    const finalTags = edited?.tags || "";
    const finalCategory = (edited?.category && VALID_CATEGORIES.includes(edited.category)) ? edited.category : category;
    
    // AI 편집 실패 시 상태를 무조건 "임시저장"으로 변경하여 수동 검토 유도
    const articleStatus = aiFailed ? "임시저장" : publishStatus;

    // AI 결과에 이미지가 빠졌거나 AI 실패 시 원문 이미지 복원 (이미지 소실 방지)
    if (!/<img[^>]+src=/i.test(finalBody) && detail.images && detail.images.length > 0) {
      // 2번째 </p> 뒤 또는 본문 최상단에 첫 이미지 삽입
      const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${detail.images[0]}" alt="${finalTitle.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
      const pIdx = finalBody.indexOf("</p>", finalBody.indexOf("</p>") + 4);
      if (pIdx === -1) {
        finalBody = imgHtml + finalBody;
      } else {
        finalBody = finalBody.slice(0, pIdx + 4) + imgHtml + finalBody.slice(pIdx + 4);
      }
    }

    // 최종 이미지 없으면 건너뜀
    if (requireImage && !/<img[^>]+src=/i.test(finalBody)) {
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "no_image", error: "AI 편집 후 이미지 없음" });
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
      const today = new Date().toISOString().slice(0, 10);
      const article: Article = {
        id: "", // 서버에서 자동 채번
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
        reviewNote: aiFailed ? "AI 편집 실패 — 자동 재시도 대기 (0/6)" : undefined,
      };
      // 대표이미지 접속 검증 → 실패 시 본문 이미지로 대체
      if (thumbnail && !thumbnail.includes("supabase")) {
        try {
          const chk = await safeFetch(thumbnail, { method: "HEAD", signal: AbortSignal.timeout(5000), maxRedirects: 3 });
          if (!chk.ok) thumbnail = "";
        } catch { thumbnail = ""; }
        if (!thumbnail) {
          // 본문에서 Supabase 이미지 추출
          const sbMatch = finalBody.match(/<img[^>]+src="(https:\/\/ifducnfrjarmlpktrjkj[^"]+)"/i);
          if (sbMatch?.[1]) thumbnail = sbMatch[1];
        }
        article.thumbnail = thumbnail || undefined;
      }
      const savedNo = await serverCreateArticle(article);
      const articleId = String(savedNo || "");
      // CockroachDB 등록 완료 표시
      if (target._feedId) {
        try {
          await markAsRegistered(target._feedId, articleId);
        } catch (e) {
          console.warn("[auto-press] markAsRegistered 실패:", e);
          // 기사는 이미 저장됨 — 다음 실행 시 중복 체크로 방어
        }
      }
      // Next.js ISR 캐시 무효화 — 기사 목록에 즉시 반영
      try { revalidateTag("articles"); } catch { /* 캐시 무효화 실패 무시 */ }
      // 같은 배치 내 중복 방지: 등록 즉시 캐시 업데이트
      addToDbCache(detail.sourceUrl, finalTitle);
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "ok", articleId, ...(articleWarnings ? { warnings: articleWarnings } : {}) });
      published++;
      await notifyTelegramArticleRegistered({
        kind: "auto_press",
        title: finalTitle,
        source: source.name || source.id,
        registeredAt: new Date().toISOString(),
        status: articleStatus,
        articleId,
        articleNo: savedNo,
        sourceUrl: detail.sourceUrl,
        summary: finalSummary,
        thumbnail: article.thumbnail,
      }).catch((error) => {
        console.warn("[auto-press] telegram notify failed:", error instanceof Error ? error.message : error);
      });

      // 건별 이력 즉시 저장 — 타임아웃 시에도 등록된 기사 유실 방지
      if (!options.preview) {
        try {
          const partialRun: AutoPressRun = {
            id: runId, startedAt, completedAt: new Date().toISOString(), source: src,
            articlesPublished: results.filter((r) => r.status === "ok").length,
            articlesSkipped: results.filter((r) => r.status === "no_image" || r.status === "old" || r.status === "skip").length,
            articlesFailed: results.filter((r) => r.status === "fail").length,
            articles: [...results],
            ...(runWarnings.length > 0 ? { warnings: runWarnings, mediaStorage } : { mediaStorage }),
          };
          const updatedHistory = [partialRun, ...history.filter((h) => h.id !== runId)].slice(0, 50);
          await serverSaveSetting("cp-auto-press-history", updatedHistory);
        } catch { /* 이력 저장 실패는 무시 — 기사는 이미 DB에 저장됨 */ }
      }
    } catch (e) {
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "fail", error: e instanceof Error ? e.message : "처리 실패" });
      await createNotification(
        "ai_failure",
        `AI 편집 실패: ${finalTitle} — ${e instanceof Error ? e.message : String(e)}`,
        "",
        { route: "auto-press", articleTitle: finalTitle, error: e instanceof Error ? e.message : String(e) }
      );
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
      ? [...results, { title: "⏱️ 시간 초과", sourceUrl: "", wrId: "", boTable: "", status: "skip" as const, error: `50초 안전 마진 도달, ${published}건 등록 후 조기 종료. 나머지는 다음 실행에서 처리됩니다.` }]
      : results,
    ...(runWarnings.length > 0 ? { warnings: runWarnings, mediaStorage } : { mediaStorage }),
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
      if (sp.get("keywords")) body.keywords = sp.get("keywords")!.split(",").map((k) => k.trim().slice(0, 50)).filter(Boolean).slice(0, 20);
      if (sp.get("category")) body.category = sp.get("category");
      if (sp.get("status")) body.publishStatus = sp.get("status");
      if (sp.get("source")) body.source = sp.get("source");
      if (sp.get("preview")) body.preview = sp.get("preview") === "true";
      if (sp.get("force")) body.force = sp.get("force") === "true";
      if (sp.get("dateRangeDays")) body.dateRangeDays = sp.get("dateRangeDays");
      if (sp.get("noAiEdit")) body.noAiEdit = sp.get("noAiEdit") === "true";
    }

    // baseUrl은 환경변수만 허용 (body.baseUrl, x-forwarded-host SSRF 방지)
    // 로컬 개발 시 origin 사용
    const origin = new URL(req.url).origin;
    const baseUrl = origin.includes("localhost") ? origin : getBaseUrl();
    const source = inferExecutionSource(req, body.source);

    const run = await runAutoPress({
      source,
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

    // ── 체인콜: 메일 동기화 (cron 호출 시에만, 설정 활성화 시) — 직접 함수 호출 ──
    let mailSyncResult: { success: boolean; error?: string } | null = null;
    if (source === "cron") {
      try {
        const mailSettings = await serverGetSetting<{ autoSync?: boolean; autoSyncDays?: number }>("cp-mail-settings", {});
        if (mailSettings.autoSync) {
          const syncDays = mailSettings.autoSyncDays || 1;
          try {
            const { runMailSync } = await import("@/app/api/mail/sync/core");
            const syncResult = await runMailSync(syncDays);
            mailSyncResult = { success: true, synced: syncResult.synced } as { success: boolean; error?: string };
          } catch (syncErr) {
            const errMsg = syncErr instanceof Error ? syncErr.message : "알 수 없는 오류";
            console.warn("[auto-press] mail sync 실패:", errMsg);
            mailSyncResult = { success: false, error: errMsg };
          }
        }
      } catch { /* 메일 설정 조회 실패는 무시 */ }
    }

    return NextResponse.json({ success: true, run, mailSync: mailSyncResult });
  } catch (e) {
    console.error("[auto-press] handler error:", e);
    await createNotification(
      "cron_failure",
      "[auto-press] 실행 실패: " + (e instanceof Error ? e.message : String(e)),
      "",
      { route: "auto-press", error: e instanceof Error ? e.message : String(e) }
    );
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

  // CRON_SECRET 없으면 상태만 반환
  return NextResponse.json({
    status: "ok",
    message: "Use POST to execute manually",
    enabled: true,
  });
}
