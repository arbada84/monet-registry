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
import { fetchWithRetry } from "@/lib/fetch-retry";
import { notifyTelegramArticleRegistered, notifyTelegramAutoPublishRun } from "@/lib/telegram-notify";
import { getMediaStorageRunSummary } from "@/lib/media-storage-health";
import { resolveAiApiKey, serverGetAiSettings } from "@/lib/ai-settings-server";
import {
  ArticleDuplicateError,
  isSubstantiallyEdited,
  normalizeArticleSourceUrl,
  normalizeArticleTitle,
} from "@/lib/article-dedupe";
import {
  createAutoPressObservedRun,
  failAutoPressObservedRun,
  queueAutoPressObservedCandidates,
  saveAutoPressRunSnapshot,
} from "@/lib/auto-press-observability";
import {
  cleanEmptyImageWrappers,
  DEFAULT_PRESS_IMAGE_MAX_PER_ARTICLE,
  filterPressImageUrls,
  getPressImageLimit,
  isManagedPressImageUrl,
  isNoisyPressImageUrl,
} from "@/lib/press-image-policy";
import {
  ensurePressBodyImage,
  getPressImageCandidates,
  hasPressBodyImage,
  promoteFirstPressBodyImage,
} from "@/lib/auto-press-image-guard";
import {
  extractTitle as htmlExtractTitle, extractDate as htmlExtractDate,
  extractBodyHtml as htmlExtractBodyHtml, toPlainText as htmlToPlainText,
  extractImages as htmlExtractImages, extractThumbnail as htmlExtractThumbnail,
} from "@/lib/html-extract";
import { isNewswireUrl, extractNewswireArticle, selectNewswireArticleForCulturePeople } from "@/lib/newswire-extract";
import { extractKoreaPressArticle, isKoreaKrUrl } from "@/lib/korea-press-extract";
import { fetchKoreaPressDocumentBodyHtml } from "@/lib/korea-press-document";
import { getUnregisteredFeeds, markAsRegistered } from "@/lib/cockroach-db";
import {
  getAutoPressCandidateLimit,
  getNewswireDbFallbackLimit,
  interleaveSourceItems,
  isNewswireAutoPressSource,
  shouldBackfillNewswireDbCandidates,
} from "@/lib/auto-press-source-selection";
import { normalizeAutoPressCount } from "@/lib/auto-press-count";
import { dispatchAutoPressWorker } from "@/lib/auto-press-worker-dispatch";
import { DEFAULT_GEMINI_TEXT_MODEL } from "@/lib/ai-model-options";
import type {
  AutoPressSettings, AutoPressSource,
  AutoPressRun, AutoPressArticleResult,
  AutoPressRetryPayload,
} from "@/types/article";
import type { Article } from "@/types/article";

import { DEFAULT_AUTO_PRESS_SETTINGS } from "@/lib/auto-defaults";

type AutoPressExecutionMode = "queue_only" | "limited_immediate";

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

function parseAutoPressPublishStatus(value: unknown): "게시" | "임시저장" | undefined {
  const status = String(value || "").trim().toLowerCase();
  if (status === "게시" || status === "publish" || status === "published") return "게시";
  if (status === "임시저장" || status === "draft" || status === "temporary") return "임시저장";
  return undefined;
}

function parseAutoPressExecutionMode(value: unknown): AutoPressExecutionMode {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "limited_immediate" || mode === "immediate") return "limited_immediate";
  return "queue_only";
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
  descriptionHtml: string;
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
    const descriptionHtml = stripDangerousHtml(extract("description"));
    items.push({
      title,
      link,
      pubDate: extract("pubDate") || extract("dc:date") || "",
      description: descriptionHtml.replace(/<[^>]+>/g, "").slice(0, 300),
      descriptionHtml,
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
  articleUrl: string,
  rssDescriptionHtml?: string,
): Promise<{ title: string; bodyHtml: string; bodyText: string; date: string; images: string[]; sourceUrl: string; author?: string; keywords?: string[] } | null> {
  const koreaRssFallback = () => (
    rssDescriptionHtml && isKoreaKrUrl(articleUrl)
      ? extractKoreaPressArticle("", articleUrl, { rssDescriptionHtml })
      : null
  );

  try {
    const resp = await fetchWithRetry(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(15000),
      maxRetries: 2,
      retryDelayMs: 1000,
      safeRemote: true,
      safeMaxRedirects: 5,
    });
    if (!resp.ok) return koreaRssFallback();
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return koreaRssFallback();
    const html = await resp.text();
    const finalUrl = resp.url || articleUrl;

    // korea.kr 보도자료는 실제 본문이 RSS description 또는 문서뷰어에 있고,
    // 바깥 페이지에는 첨부/저작권/이전다음기사 잡음이 많으므로 전용 파서만 신뢰한다.
    if (isKoreaKrUrl(finalUrl) || isKoreaKrUrl(articleUrl)) {
      const documentBodyHtml = rssDescriptionHtml
        ? ""
        : await fetchKoreaPressDocumentBodyHtml(html, finalUrl);
      return extractKoreaPressArticle(html, finalUrl, { rssDescriptionHtml, documentBodyHtml });
    }

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
  } catch { return koreaRssFallback(); }
}

// ── RSS 타겟 인터페이스 ─────────────────────────────────────
interface RssTarget {
  id: string;      // URL 기반 base64 고유키
  title: string;
  date: string;
  link: string;    // 원문 URL
}

// ── AI 편집 ─────────────────────────────────────────────────
// ── AI 편집 (공유 모듈 사용) ─────────────────────────────────
import { aiEditArticle, extractAiJson as extractJson, VALID_CATEGORIES, type AiEditResult as AiResult } from "@/lib/ai-prompt";

// ── 제목 정규화: 공백·특수문자 제거 + 소문자 + 유니코드 NFC 정규화 ──
function normalizeTitle(t: string): string {
  return normalizeArticleTitle(t);
}

// ── DB 기사 캐시 (중복 체크용, 한 번만 로드) ─────────────────
let _dbArticlesCache: { urls: Set<string>; titles: Set<string>; ts: number } | null = null;
const DB_CACHE_TTL = 30 * 60 * 1000; // 30분 TTL
async function getDbArticlesCache(): Promise<{ urls: Set<string>; titles: Set<string> }> {
  if (_dbArticlesCache && Date.now() - _dbArticlesCache.ts < DB_CACHE_TTL) return _dbArticlesCache;
  try {
    const { serverGetRecentTitles } = await import("@/lib/db-server");
    const recent = await serverGetRecentTitles(100); // 30개에서 100개로 확대 (중복 방지 강화)
    const urls = new Set(recent.map((a) => normalizeArticleSourceUrl(a.sourceUrl)).filter(Boolean));
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
  const normalizedSourceUrl = normalizeArticleSourceUrl(sourceUrl);
  if (normalizedSourceUrl && cache.urls.has(normalizedSourceUrl)) {
    console.log(`[auto-press] URL 중복 스킵: ${sourceUrl}`);
    return true;
  }

  // 2) 이력 기반 (기존)
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  for (const run of history) {
    if (run.startedAt < cutoff) continue;
    if (run.articles.some((a) => (
      (normalizedSourceUrl && normalizeArticleSourceUrl(a.sourceUrl) === normalizedSourceUrl)
      || (a.wrId === wrId && a.boTable === boTable && a.status === "ok")
    ))) return true;
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
  const normalizedSourceUrl = normalizeArticleSourceUrl(sourceUrl);
  if (normalizedSourceUrl) _dbArticlesCache.urls.add(normalizedSourceUrl);
  if (title) _dbArticlesCache.titles.add(normalizeTitle(title));
}

// ── 이미지 재업로드 (HTML 내 img src) ────────────────────────
function getAutoPressImageLimit(): number {
  return getPressImageLimit(process.env.PRESS_IMAGE_MAX_PER_ARTICLE ?? DEFAULT_PRESS_IMAGE_MAX_PER_ARTICLE);
}

async function reuploadBodyImages(html: string): Promise<string> {
  const imgRegex = /<img([^>]*)src=["'](https?:\/\/[^"']+)["']([^>]*)>/gi;
  const matches = [...html.matchAll(imgRegex)];
  const uploadTargets = filterPressImageUrls(
    matches.map((match) => match[2]).filter((url) => !isManagedPressImageUrl(url)),
    { maxImages: getAutoPressImageLimit(), keepManaged: false },
  );
  const uploadTargetSet = new Set(uploadTargets);
  const urlMap = new Map<string, string>();

  for (const originalUrl of uploadTargets) {
    const uploaded = await serverUploadImageUrl(originalUrl);
    if (uploaded) urlMap.set(originalUrl, uploaded);
  }

  let result = html;
  for (const m of matches) {
    const originalUrl = m[2];
    // 이미 supabase URL이면 스킵
    if (isManagedPressImageUrl(originalUrl)) continue;
    if (isNoisyPressImageUrl(originalUrl) || !uploadTargetSet.has(originalUrl)) {
      result = result.replace(m[0], "");
      continue;
    }
    const uploaded = urlMap.get(originalUrl);
    if (uploaded) {
      result = result.replace(originalUrl, uploaded);
    } else {
      result = result.replace(m[0], "");
    }
  }
  return cleanEmptyImageWrappers(result);
}

function trimRetryPayloadText(value: string | undefined, maxLength: number): string {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function buildUnpublishedRetryPayload(input: {
  title: string;
  sourceUrl: string;
  wrId: string;
  boTable: string;
  source: AutoPressSource;
  bodyText: string;
  bodyHtml: string;
  images: string[];
  thumbnail?: string;
  category: string;
  publishStatus: AutoPressSettings["publishStatus"];
  author?: string;
  date?: string;
  keywords?: string[];
  aiProvider: AutoPressSettings["aiProvider"];
  aiModel: string;
  reasonCode: string;
}): AutoPressRetryPayload {
  return {
    type: "auto_press_unpublished",
    title: trimRetryPayloadText(input.title, 240),
    sourceUrl: input.sourceUrl,
    wrId: input.wrId,
    boTable: input.boTable,
    sourceName: input.source.name || input.source.id,
    bodyText: trimRetryPayloadText(input.bodyText, 6000),
    bodyHtml: trimRetryPayloadText(input.bodyHtml, 16000),
    images: filterPressImageUrls(input.images || [], { maxImages: getAutoPressImageLimit() }),
    thumbnail: input.thumbnail,
    category: input.category,
    publishStatus: input.publishStatus,
    author: input.author,
    date: input.date,
    keywords: input.keywords?.slice(0, 20),
    aiProvider: input.aiProvider,
    aiModel: input.aiModel,
    reasonCode: input.reasonCode,
    createdAt: new Date().toISOString(),
  };
}

// ── 메인 실행 함수 ───────────────────────────────────────────
export async function runAutoPress(options: {
  source?: "cron" | "manual" | "cli";
  runId?: string;
  triggeredBy?: string;
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
  executionMode?: AutoPressExecutionMode;
  maxCandidates?: number;
}): Promise<AutoPressRun> {
  const startedAt = new Date().toISOString();
  const runId = options.runId || `press_${Date.now()}`;
  const src = options.source ?? "manual";
  const executionMode = parseAutoPressExecutionMode(options.executionMode);
  const observationOptions = {
    count: options.countOverride,
    keywords: options.keywordsOverride,
    category: options.categoryOverride,
    publishStatus: options.statusOverride,
    preview: options.preview,
    force: options.force,
    dateRangeDays: options.dateRangeDays,
    noAiEdit: options.noAiEdit,
    wrIds: options.wrIds,
    executionMode,
    maxCandidates: options.maxCandidates,
  };
  await createAutoPressObservedRun({
    id: runId,
    source: src,
    preview: options.preview,
    requestedCount: options.countOverride,
    triggeredBy: options.triggeredBy,
    options: observationOptions,
    startedAt,
  }).catch((error) => {
    console.warn("[auto-press] 실행 관측 로그 시작 기록 실패:", error instanceof Error ? error.message : error);
  });

  const finishObservedRun = async (
    run: AutoPressRun,
    status: "completed" | "failed" | "timeout" = "completed",
  ): Promise<AutoPressRun> => {
    await saveAutoPressRunSnapshot(run, {
      status,
      requestedCount: options.countOverride,
      triggeredBy: options.triggeredBy,
      options: observationOptions,
    }).catch((error) => {
      console.warn("[auto-press] 실행 관측 로그 완료 기록 실패:", error instanceof Error ? error.message : error);
    });
    return run;
  };

  try {

  const settings = await serverGetSetting<AutoPressSettings>("cp-auto-press-settings", DEFAULT_AUTO_PRESS_SETTINGS);

  if (src === "cron" && !settings.cronEnabled) {
    console.log("[auto-press] cron 비활성화로 인해 실행 중단");
    return finishObservedRun({
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "중단됨", sourceUrl: "", status: "skip", error: "자동 보도자료 cron이 비활성화되어 있습니다.", wrId: "", boTable: "" }],
    });
  }

  // 자동 보도자료 기능이 비활성화되어 있는 경우 (수동 실행 'manual' 제외한 모든 경우 중단)
  if (!settings.enabled && src !== "manual") {
    console.log(`[auto-press] 기능 비활성화로 인해 실행 중단 (source: ${src})`);
    return finishObservedRun({
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "중단됨", sourceUrl: "", status: "skip", error: "자동 보도자료 기능이 비활성화되어 있습니다.", wrId: "", boTable: "" }],
    });
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

  const aiSettings = await serverGetAiSettings();

  const count = normalizeAutoPressCount(options.countOverride ?? settings.count);
  const keywords = options.keywordsOverride ?? settings.keywords ?? [];
  const category = options.categoryOverride ?? settings.category ?? "공공";
  const publishStatus = options.statusOverride ?? settings.publishStatus ?? "임시저장";
  const aiProvider = settings.aiProvider ?? "gemini";
  const aiModel = settings.aiModel ?? DEFAULT_GEMINI_TEXT_MODEL;
  const author = settings.author ?? "";
  const requireImage = settings.requireImage !== false;
  const defaultCandidateCap = src === "cron" ? 100 : 300;
  const requestedCandidateCap = Number(options.maxCandidates || defaultCandidateCap);
  const maxCandidateCreation = Math.max(
    1,
    Math.min(
      Number.isFinite(requestedCandidateCap) ? Math.trunc(requestedCandidateCap) : defaultCandidateCap,
      defaultCandidateCap,
    ),
  );

  const apiKey = resolveAiApiKey(aiSettings, aiProvider);

  const baseUrl = options.baseUrl ?? getBaseUrl();

  const history = await serverGetSetting<AutoPressRun[]>("cp-auto-press-history", []);
  const mediaStorage = await getMediaStorageRunSummary({ remote: !options.preview }).catch((error) => ({
    ok: false,
    provider: "supabase" as const,
    configured: false,
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [],
    recommendations: ["발행 전에 미디어 저장소 상태 점검을 실행하세요."],
  }));
  const runWarnings = mediaStorage.ok ? [] : [
    `미디어 저장소 상태가 비정상입니다(${mediaStorage.provider}). 이미지 업로드가 실패하거나 원본 URL로 대체될 수 있습니다.`,
  ];
  const articleWarnings = runWarnings.length > 0 ? runWarnings : undefined;
  if (!options.preview && src === "cron" && !mediaStorage.ok) {
    await createNotification(
      "media_storage",
      "보도자료 자동등록 실행 전 미디어 저장소 점검 실패",
      mediaStorage.errors[0] || "미디어 저장소 상태가 정상적이지 않습니다.",
      { route: "auto-press", mediaStorage },
    );
  }

  const activeSources = (settings.sources ?? DEFAULT_AUTO_PRESS_SETTINGS.sources).filter((s) => s.enabled);
  if (activeSources.length === 0) {
    return finishObservedRun({
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "설정 오류", sourceUrl: "", wrId: "", boTable: "", status: "fail", error: "활성화된 소스가 없습니다." }],
    }, "failed");
  }

  // 통합 타겟 타입: RSS + CockroachDB 하이브리드
  interface PressTarget {
    item: RssTarget;
    source: AutoPressSource;
    _feedId?: string;           // CockroachDB press_feeds.id (markAsRegistered용)
    _bodyHtml?: string | null;  // DB에서 가져온 본문 (fetchOriginContent 건너뛰기)
    _rssDescriptionHtml?: string;
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
            _rssDescriptionHtml: rssItem.descriptionHtml,
          }));
        } catch (e) {
          console.warn(`[auto-press] RSS 수집 실패 (${source.name}):`, e instanceof Error ? e.message : e);
          return [];
        }
      })
    );
    allItems.push(...interleaveSourceItems(rssResults));

    const newswireSources = activeSources.filter(isNewswireAutoPressSource);
    const appendNewswireDbFallback = async (excludeSet: Set<string>, targetLimit: number) => {
      if (newswireSources.length === 0) return;
      try {
        const dbFeeds = await getUnregisteredFeeds({
          keywords: keywords.length > 0 ? keywords : undefined,
          limit: getNewswireDbFallbackLimit({ count, targetLimit }),
        });
        const matchSource = newswireSources[0];
        const existingUrls = new Set(allItems.map((entry) => entry.item.link).filter(Boolean));
        for (const feed of dbFeeds) {
          if (!feed.url || existingUrls.has(feed.url) || excludeSet.has(feed.url) || excludeSet.has(feed.title)) continue;
          existingUrls.add(feed.url);
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
    };

    const filterByKeywords = (items: PressTarget[]) => items.filter(({ item }) => {
      if (keywords.length === 0) return true;
      return keywords.some((kw) => item.title.includes(kw));
    });

    const excludeSet = new Set(options.excludeUrls ?? []);
    const dedupeCandidates = async (items: PressTarget[]) => {
      const seen = new Set<string>();
      const deduped: PressTarget[] = [];
      for (const entry of items) {
        const key = `${entry.source.id}:${entry.item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const entryUrl = entry.item.link || "";
        if (entryUrl && excludeSet.has(entryUrl)) continue;
        if (entry.item.title && excludeSet.has(entry.item.title)) continue;
        const dup = await isDuplicate(entry.item.id, entry.source.boTable ?? "", history, settings.dedupeWindowHours ?? 48, entryUrl, entry.item.title);
        if (!dup) deduped.push(entry);
      }
      return deduped;
    };

    const targetLimit = Math.min(getAutoPressCandidateLimit({
      count,
      requireImage,
      preview: Boolean(options.preview),
    }), maxCandidateCreation);

    let deduped = await dedupeCandidates(filterByKeywords(allItems));
    if (shouldBackfillNewswireDbCandidates({
      hasNewswireSource: newswireSources.length > 0,
      candidateCount: deduped.length,
      targetLimit,
    })) {
      await appendNewswireDbFallback(excludeSet, targetLimit);
      deduped = await dedupeCandidates(filterByKeywords(allItems));
    }

    targets = deduped.slice(0, targetLimit);
  }

  if (targets.length > maxCandidateCreation) {
    targets = targets.slice(0, maxCandidateCreation);
  }

  if (!options.preview && executionMode === "queue_only") {
    const queuedResults: AutoPressArticleResult[] = targets.map(({ item, source }) => ({
      title: item.title || "(제목 없음)",
      sourceUrl: item.link || "",
      wrId: item.id,
      boTable: source.boTable ?? "",
      status: "queued",
      error: "작업 예약 완료",
    }));
    const queueMessage = targets.length > 0
      ? `보도자료 후보 ${targets.length}건을 큐에 예약했습니다. 실제 AI 편집과 등록은 순차 처리기가 담당합니다.`
      : "예약 가능한 보도자료 후보가 없습니다. 수집 소스, 날짜 범위, 중복 제외 조건을 확인하세요.";
    const run: AutoPressRun = {
      id: runId,
      startedAt,
      completedAt: new Date().toISOString(),
      source: src,
      articlesPublished: 0,
      articlesSkipped: 0,
      articlesFailed: 0,
      articles: queuedResults,
      ...(runWarnings.length > 0 ? { warnings: runWarnings, mediaStorage } : { mediaStorage }),
    };

    const queuedCount = await queueAutoPressObservedCandidates({
      run,
      requestedCount: count,
      triggeredBy: options.triggeredBy,
      options: observationOptions,
      candidates: targets.map(({ item, source, _feedId, _rssDescriptionHtml, _images, _thumbnail }) => ({
        title: item.title || "(제목 없음)",
        sourceId: source.id,
        sourceName: source.name,
        sourceUrl: item.link || "",
        sourceItemId: item.id,
        boTable: source.boTable ?? "",
        imageCount: _images?.length || (_thumbnail ? 1 : 0),
        raw: {
          item,
          source: {
            id: source.id,
            name: source.name,
            boTable: source.boTable,
            rssUrl: source.rssUrl,
          },
          feedId: _feedId,
          hasRssDescription: Boolean(_rssDescriptionHtml),
          thumbnail: _thumbnail || null,
        },
      })),
      message: queueMessage,
    }).catch((error) => {
      console.warn("[auto-press] 큐 예약 관측 로그 저장 실패:", error instanceof Error ? error.message : error);
      return 0;
    });

    if (queuedCount === 0 && targets.length > 0) {
      run.warnings = [...(run.warnings || []), "큐 예약 로그 저장에 실패했습니다. D1 연결 상태를 확인하세요."];
    }

    if (queuedCount > 0) {
      const dispatch = await dispatchAutoPressWorker({
        runId,
        limit: Math.min(queuedCount, maxCandidateCreation),
      });
      if (!dispatch.configured) {
        run.warnings = [...(run.warnings || []), "Worker Queue 발행 URL이 아직 설정되지 않았습니다. Cloudflare Cron 폴링으로 대기열을 처리합니다."];
      } else if (!dispatch.ok) {
        run.warnings = [...(run.warnings || []), `Worker Queue 발행 요청 실패: ${dispatch.error || "알 수 없는 오류"}`];
      }
    }

    if (!options.preview) {
      const newHistory = [run, ...history.filter((h) => h.id !== runId)].slice(0, 50);
      await serverSaveSetting("cp-auto-press-history", newHistory);
    }

    return run;
  }
  const results: AutoPressArticleResult[] = [];
  let published = 0;
  let previewed = 0;
  const TIMEOUT_MS = 50_000; // 50초 안전 마진 (Vercel 60초 제한)
  const startTime = Date.now();
  let timedOut = false;

  for (const target of targets) {
    const { item, source } = target;
    if ((options.preview ? previewed : published) >= count) break;

    // 타임아웃 체크: 50초 경과 시 현재까지 결과 저장 후 조기 종료
    if (Date.now() - startTime > TIMEOUT_MS) {
      timedOut = true;
      console.warn(`[auto-press] 50초 안전 마진 도달, ${published}건 등록 후 조기 종료`);
      break;
    }

    // preview 모드
    if (options.preview) {
      results.push({ title: item.title, sourceUrl: item.link, wrId: item.id, boTable: source.boTable ?? "", status: "preview" });
      previewed++;
      continue;
    }

    // 상세 수집: CockroachDB 본문 우선 → 없으면 원문 직접 수집
    let detail: { title: string; bodyText: string; bodyHtml: string; date: string; writer?: string; author?: string; keywords?: string[]; images: string[]; sourceUrl: string } | null = null;

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
      const origin = await fetchOriginContent(baseUrl, item.link, target._rssDescriptionHtml);
      if (origin) {
        detail = {
          title: origin.title || item.title,
          bodyText: origin.bodyText,
          bodyHtml: origin.bodyHtml,
          date: origin.date || item.date,
          writer: "",
          author: origin.author,
          keywords: origin.keywords,
          images: origin.images,
          sourceUrl: origin.sourceUrl || item.link,
        };
      }
    }

    if (!detail || !detail.bodyText || detail.bodyText.length < 50) {
      results.push({ title: item.title, sourceUrl: item.link || "", wrId: item.id, boTable: source.boTable ?? "", status: "fail", error: "상세 수집 실패" });
      continue;
    }

    if (
      isNewswireUrl(detail.sourceUrl)
    ) {
      const selection = selectNewswireArticleForCulturePeople({
        title: detail.title,
        author: detail.author ?? detail.writer ?? "",
        keywords: detail.keywords ?? [],
        bodyText: detail.bodyText,
        sourceId: source.id,
        sourceName: source.name,
      });
      if (!selection.allowed) {
        results.push({ title: detail.title || item.title, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "skip", error: selection.reason });
        continue;
      }
    }

    // 날짜 체크 (상세의 date 또는 목록의 date) — force 시 우회
    const itemDate = detail.date || item.date;
    if (!options.force && !isDateAllowed(itemDate, options.dateRangeDays)) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "old", error: `날짜 제한 (${itemDate})` });
      continue;
    }

    // 이미지 필수 체크 (1차): AI 호출 전에 원문/첨부/본문 URL을 코드로 판정해 토큰 낭비를 막는다.
    const sourceImageCandidates = getPressImageCandidates({
      bodyHtml: detail.bodyHtml,
      images: detail.images,
      bodyText: detail.bodyText,
      maxImages: getAutoPressImageLimit(),
    });
    if (requireImage && sourceImageCandidates.length === 0) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "no_image", error: "원문 이미지 없음" });
      continue;
    }

    // 금칙어 필터 — 본문에 금칙어 포함 시 건너뜀
    const BLOCKED_KEYWORDS = ["전대통령"];
    const bodyTextLower = detail.bodyText || "";
    if (BLOCKED_KEYWORDS.some((kw) => bodyTextLower.includes(kw))) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "skip", error: `금칙어 포함` });
      continue;
    }

    const makeRetryPayload = (reasonCode: string): AutoPressRetryPayload => buildUnpublishedRetryPayload({
      title: detail.title || item.title,
      sourceUrl: detail.sourceUrl,
      wrId: item.id,
      boTable: source.boTable ?? "",
      source,
      bodyText: detail.bodyText,
      bodyHtml: detail.bodyHtml,
      images: sourceImageCandidates,
      thumbnail: sourceImageCandidates[0],
      category,
      publishStatus,
      author: author || detail.author || detail.writer,
      date: itemDate,
      keywords: detail.keywords,
      aiProvider,
      aiModel,
      reasonCode,
    });

    // AI 편집 (noAiEdit 시 건너뜀)
    let edited: AiResult | null = null;
    if (apiKey && !options.noAiEdit) {
      try {
        const remainingMs = TIMEOUT_MS - (Date.now() - startTime);
        if (remainingMs < 12_000) {
          timedOut = true;
          results.push({
            title: item.title,
            sourceUrl: detail.sourceUrl,
            wrId: item.id,
            boTable: source.boTable ?? "",
            status: "skip",
            error: "AI 편집 시작 전 시간 제한 안전 종료",
            retryReasonCode: "TIME_BUDGET_EXCEEDED",
            retryPayload: makeRetryPayload("TIME_BUDGET_EXCEEDED"),
          });
          break;
        }
        edited = await aiEditArticle(aiProvider, aiModel, apiKey, item.title, detail.bodyText.slice(0, 3000), detail.bodyHtml, {
          maxAttempts: 1,
          timeoutMs: Math.max(8_000, Math.min(18_000, remainingMs - 8_000)),
          retryDelayMs: 0,
          maxOutputTokens: 3072,
        });
      } catch (e) {
        console.error(`[auto-press] AI 편집 오류: ${item.title.slice(0, 50)} - ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (!edited) {
      const reason = options.noAiEdit
        ? "AI 편집 건너뛰기 설정이 켜져 있어 원문 그대로 등록 금지"
        : !apiKey
          ? "AI API 키가 없어 원문 그대로 등록 금지"
          : "AI 편집 결과가 없어 원문 그대로 등록 금지";
      const retryReasonCode = options.noAiEdit ? undefined : !apiKey ? "NO_AI_KEY" : "AI_RESPONSE_INVALID";
      results.push({
        title: item.title,
        sourceUrl: detail.sourceUrl,
        wrId: item.id,
        boTable: source.boTable ?? "",
        status: "skip",
        error: reason,
        ...(retryReasonCode ? {
          retryReasonCode,
          retryPayload: makeRetryPayload(retryReasonCode),
        } : {}),
      });
      continue;
    }

    const editQuality = isSubstantiallyEdited({
      sourceText: detail.bodyText,
      editedHtml: edited.body,
    });
    if (!editQuality.ok) {
      results.push({
        title: edited.title || item.title,
        sourceUrl: detail.sourceUrl,
        wrId: item.id,
        boTable: source.boTable ?? "",
        status: "skip",
        error: `${editQuality.reason || "AI 편집 결과가 원문과 너무 유사합니다."} 원문 그대로 등록 금지`,
        retryReasonCode: "AI_RESPONSE_INVALID",
        retryPayload: makeRetryPayload("AI_RESPONSE_INVALID"),
      });
      continue;
    }

    const aiFailed = false;

    const finalTitle = edited?.title || item.title;
    // AI 실패 시 원문 HTML 대신 텍스트를 <p> 태그로 감싸서 저장 (복구 로직 강화)
    let finalBody = edited?.body || detail.bodyHtml || detail.bodyText.split(/\n\n+/).filter(p => p.trim().length > 20).map(p => `<p>${p.trim()}</p>`).join("\n\n");
    const finalSummary = edited?.summary || "";
    const finalTags = edited?.tags || "";
    const finalCategory = (edited?.category && VALID_CATEGORIES.includes(edited.category)) ? edited.category : category;
    const safeDetailImages = sourceImageCandidates;
    
    // AI 편집 실패 시 상태를 무조건 "임시저장"으로 변경하여 수동 검토 유도
    const articleStatus = publishStatus;

    // AI 결과에 이미지가 빠졌거나 AI 실패 시 원문 이미지 복원 (이미지 소실 방지)
    const restoredBeforeUpload = ensurePressBodyImage({
      bodyHtml: finalBody,
      candidateImages: safeDetailImages,
      altText: finalTitle,
    });
    finalBody = restoredBeforeUpload.bodyHtml;

    // 최종 이미지 없으면 건너뜀
    if (requireImage && !restoredBeforeUpload.ok) {
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "no_image", error: "AI 편집 후 복원 가능한 이미지 없음" });
      continue;
    }

    // 본문 이미지 재업로드 (Supabase)
    finalBody = await reuploadBodyImages(finalBody);
    const managedDetailImages = getPressImageCandidates({
      bodyHtml: finalBody,
      maxImages: getAutoPressImageLimit(),
    }).filter(isManagedPressImageUrl);
    const restoredAfterUpload = ensurePressBodyImage({
      bodyHtml: finalBody,
      candidateImages: managedDetailImages,
      altText: finalTitle,
    });
    finalBody = restoredAfterUpload.bodyHtml;
    if (requireImage && !restoredAfterUpload.ok) {
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "no_image", error: "이미지 정리 후 본문 이미지 없음" });
      continue;
    }

    // 대표이미지: 본문 첫 이미지 → thumbnail으로 승격. 본문 이미지가 하나뿐이면 삭제하지 않는다.
    let thumbnail = "";
    const promotedImage = promoteFirstPressBodyImage(finalBody);
    finalBody = promotedImage.bodyHtml;
    if (promotedImage.thumbnailUrl) {
      thumbnail = promotedImage.thumbnailUrl;
      // 대표이미지가 외부 URL이면 Supabase로 재업로드
      if (thumbnail && !isManagedPressImageUrl(thumbnail) && !isNoisyPressImageUrl(thumbnail)) {
        try {
          const uploaded = await serverUploadImageUrl(thumbnail);
          thumbnail = uploaded || "";
        } catch { thumbnail = ""; }
      }
    }

    // 대표이미지 접속 검증 → 실패 시 본문 이미지로 대체
    if (thumbnail && !isManagedPressImageUrl(thumbnail)) {
      try {
        const chk = await safeFetch(thumbnail, { method: "HEAD", signal: AbortSignal.timeout(5000), maxRedirects: 3 });
        if (!chk.ok) thumbnail = "";
      } catch { thumbnail = ""; }
    }
    if (!thumbnail) {
      thumbnail = getPressImageCandidates({ bodyHtml: finalBody, maxImages: 1 })[0] ?? "";
    }

    // 저장 직전 최종 가드: 본문 이미지가 빠졌다면 대표이미지/원문 후보로 복원, 그래도 없으면 저장하지 않는다.
    const finalImageGuard = ensurePressBodyImage({
      bodyHtml: finalBody,
      candidateImages: getPressImageCandidates({
        bodyHtml: finalBody,
        images: thumbnail ? [thumbnail] : [],
        maxImages: getAutoPressImageLimit(),
      }).filter(isManagedPressImageUrl),
      altText: finalTitle,
    });
    finalBody = finalImageGuard.bodyHtml;
    if (requireImage && (!finalImageGuard.ok || !hasPressBodyImage(finalBody))) {
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "no_image", error: "저장 직전 본문 이미지 없음" });
      continue;
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
      const resultWarnings = [
        ...(articleWarnings ?? []),
        ...(aiFailed ? ["AI 편집 실패로 임시저장 처리되었습니다. 자동 재시도 대기열에서 추적하세요."] : []),
      ];
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "ok", articleId, ...(resultWarnings.length > 0 ? { warnings: resultWarnings } : {}) });
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
            articlesSkipped: results.filter((r) => r.status === "no_image" || r.status === "old" || r.status === "skip" || r.status === "dup").length,
            articlesFailed: results.filter((r) => r.status === "fail").length,
            articles: [...results],
            ...(runWarnings.length > 0 ? { warnings: runWarnings, mediaStorage } : { mediaStorage }),
          };
          const updatedHistory = [partialRun, ...history.filter((h) => h.id !== runId)].slice(0, 50);
          await serverSaveSetting("cp-auto-press-history", updatedHistory);
        } catch { /* 이력 저장 실패는 무시 — 기사는 이미 DB에 저장됨 */ }
      }
    } catch (e) {
      if (e instanceof ArticleDuplicateError) {
        results.push({
          title: finalTitle,
          sourceUrl: detail.sourceUrl,
          wrId: item.id,
          boTable: source.boTable ?? "",
          status: "dup",
          error: e.message.replace(/^DUPLICATE_ARTICLE:\s*/, ""),
        });
        continue;
      }

      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.id, boTable: source.boTable ?? "", status: "fail", error: e instanceof Error ? e.message : "처리 실패" });
      await createNotification(
        "ai_failure",
        "보도자료 AI 편집 실패",
        `기사 제목: ${finalTitle || "제목 없음"}\n세부 오류는 관리자 로그를 확인하세요.`,
        { route: "auto-press", articleTitle: finalTitle, error: e instanceof Error ? e.message : String(e) }
      );
    }

    // rate limit 방어
    await new Promise((r) => setTimeout(r, 500));
  }

  const previewCount = results.filter((r) => r.status === "preview").length;
  const skipped = results.filter((r) => r.status === "no_image" || r.status === "old" || r.status === "skip" || r.status === "dup").length;
  const processedInRun = results.length;
  const timeoutArticle: AutoPressArticleResult = {
    title: "시간 초과 안전 종료",
    sourceUrl: "",
    wrId: "",
    boTable: "",
    status: "skip",
    error: `50초 안전 마진 도달, ${published}건 등록 후 조기 종료. 관리자 화면이 다음 배치를 자동으로 이어 실행할 수 있습니다.`,
  };

  const run: AutoPressRun = {
    id: runId,
    startedAt,
    completedAt: new Date().toISOString(),
    source: src,
    ...(options.preview ? { preview: true } : {}),
    articlesPublished: results.filter((r) => r.status === "ok").length,
    ...(previewCount > 0 ? { articlesPreviewed: previewCount } : {}),
    articlesSkipped: skipped,
    articlesFailed: results.filter((r) => r.status === "fail").length,
    articles: timedOut
      ? [...results, timeoutArticle]
      : results,
    ...(timedOut
      ? {
          timedOut: true,
          continuation: {
            shouldContinue: true,
            nextDelayMs: 2000,
            processedInRun,
            message: "50초 안전 마진에 도달해 현재 배치를 안전 종료했습니다. 관리자 화면은 다음 배치를 자동으로 이어 실행할 수 있습니다.",
          },
        }
      : {}),
    ...(runWarnings.length > 0 ? { warnings: runWarnings, mediaStorage } : { mediaStorage }),
  };

  if (!options.preview) {
    const newHistory = [run, ...history.filter((h) => h.id !== runId)].slice(0, 50);
    await serverSaveSetting("cp-auto-press-history", newHistory);
  }

  return finishObservedRun(run, timedOut ? "timeout" : "completed");
  } catch (error) {
    await failAutoPressObservedRun({
      id: runId,
      source: src,
      preview: options.preview,
      requestedCount: options.countOverride,
      triggeredBy: options.triggeredBy,
      options: observationOptions,
      startedAt,
      errorCode: "UNKNOWN",
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch((logError) => {
      console.warn("[auto-press] 실행 관측 로그 실패 기록 실패:", logError instanceof Error ? logError.message : logError);
    });
    throw error;
  }
}

// ── HTTP 핸들러 ──────────────────────────────────────────────
async function handler(req: NextRequest) {
  if (!await authenticate(req)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    } else {
      const sp = new URL(req.url).searchParams;
      if (sp.get("count")) body.count = normalizeAutoPressCount(sp.get("count"));
      if (sp.get("keywords")) body.keywords = sp.get("keywords")!.split(",").map((k) => k.trim().slice(0, 50)).filter(Boolean).slice(0, 20);
      if (sp.get("category")) body.category = sp.get("category");
      if (sp.get("status")) body.publishStatus = sp.get("status");
      if (sp.get("source")) body.source = sp.get("source");
      if (sp.get("preview")) body.preview = sp.get("preview") === "true";
      if (sp.get("force")) body.force = sp.get("force") === "true";
      if (sp.get("dateRangeDays")) body.dateRangeDays = sp.get("dateRangeDays");
      if (sp.get("noAiEdit")) body.noAiEdit = sp.get("noAiEdit") === "true";
      if (sp.get("executionMode")) body.executionMode = sp.get("executionMode");
      if (sp.get("maxCandidates")) body.maxCandidates = sp.get("maxCandidates");
    }

    // baseUrl은 환경변수만 허용 (body.baseUrl, x-forwarded-host SSRF 방지)
    // 로컬 개발 시 origin 사용
    const origin = new URL(req.url).origin;
    const baseUrl = origin.includes("localhost") ? origin : getBaseUrl();
    const source = inferExecutionSource(req, body.source);

    const run = await runAutoPress({
      source,
      runId: body.runId as string | undefined,
      triggeredBy: source === "manual" ? "관리자 수동 실행" : source,
      countOverride: body.count !== undefined ? normalizeAutoPressCount(body.count) : undefined,
      keywordsOverride: body.keywords as string[] | undefined,
      categoryOverride: body.category as string | undefined,
      statusOverride: parseAutoPressPublishStatus(body.publishStatus),
      preview: body.preview as boolean | undefined,
      force: body.force as boolean | undefined,
      dateRangeDays: body.dateRangeDays ? Number(body.dateRangeDays) : undefined,
      noAiEdit: body.noAiEdit as boolean | undefined,
      wrIds: body.wrIds as string[] | undefined,
      excludeUrls: body.excludeUrls as string[] | undefined,
      executionMode: parseAutoPressExecutionMode(body.executionMode),
      maxCandidates: body.maxCandidates ? normalizeAutoPressCount(body.maxCandidates) : undefined,
      baseUrl,
    });

    if (!run.preview && (source === "cron" || source === "manual")) {
      await notifyTelegramAutoPublishRun("auto_press", run).catch((error) => {
        console.warn("[auto-press] telegram run summary failed:", error instanceof Error ? error.message : error);
      });
    }

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
      "보도자료 자동등록 실행 실패",
      "보도자료 처리 중 오류가 발생했습니다. 세부 오류는 서버 로그를 확인하세요.",
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
