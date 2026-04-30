/**
 * 자동 뉴스 수집·편집·발행 크론 핸들러
 * POST /api/cron/auto-news
 * GET  /api/cron/auto-news
 *
 * Body (JSON, 선택):
 *   { count?, keywords?, category?, publishStatus?, source?: "cron"|"manual"|"cli", preview? }
 *
 * 인증: CRON_SECRET 헤더 (Vercel Cron), 또는 관리자 쿠키
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serverGetSetting, serverSaveSetting, serverCreateArticle, createNotification } from "@/lib/db-server";
import { serverUploadImageUrl } from "@/lib/server-upload-image";
import { verifyAuthToken, timingSafeEqual } from "@/lib/cookie-auth";
import {
  extractTitle as htmlExtractTitle,
  extractDate as htmlExtractDate,
  extractThumbnail as htmlExtractThumbnail,
  extractBodyHtml as htmlExtractBodyHtml,
  toPlainText as htmlToPlainText,
} from "@/lib/html-extract";
import type {
  AutoNewsSettings, AutoNewsRssSource,
  AutoNewsRun, AutoNewsArticleResult,
} from "@/types/article";
import type { Article } from "@/types/article";
import { getBaseUrl } from "@/lib/get-base-url";
import { decodeHtmlEntities } from "@/lib/html-utils";
import { safeFetch } from "@/lib/safe-remote-url";
import { notifyTelegramArticleRegistered } from "@/lib/telegram-notify";
import { getMediaStorageRunSummary } from "@/lib/media-storage-health";

// ── 기본 설정 ───────────────────────────────────────────────
import { DEFAULT_AUTO_NEWS_SETTINGS } from "@/lib/auto-defaults";

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

// ── RSS 파싱 유틸 ────────────────────────────────────────────
interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function decodeHtml(str: string): string {
  return decodeHtmlEntities(str).replace(/&nbsp;/g, " ").trim();
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeHtml((block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ?? block.match(/<title[^>]*>([\s\S]*?)<\/title>/i))?.[1] ?? "");
    const link  = decodeHtml((block.match(/<link>([\s\S]*?)<\/link>/i) ?? block.match(/<link[^>]+href="([^"]+)"/i))?.[1] ?? "");
    const pub   = decodeHtml((block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i))?.[1] ?? "");
    const desc  = decodeHtml((block.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ?? block.match(/<description[^>]*>([\s\S]*?)<\/description>/i))?.[1] ?? "").replace(/<[^>]+>/g, "").slice(0, 200);
    if (title && link) items.push({ title, link, pubDate: pub, description: desc });
  }
  return items;
}

/** Google News redirect URL → 실제 기사 URL 추출 */
async function resolveGoogleNewsUrl(googleUrl: string): Promise<string> {
  try {
    const resp = await safeFetch(googleUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CulturepeopleBot/1.0)" },
      signal: AbortSignal.timeout(8000),
      maxRedirects: 2,
    });
    if (resp.url && !resp.url.includes("news.google.com")) return resp.url;
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location") ?? "";
      if (loc && loc.startsWith("http") && !loc.includes("news.google.com")) return loc;
    }
  } catch { /* ignore */ }
  return googleUrl;
}

// ── RSS 수집 ─────────────────────────────────────────────────
async function fetchRssItems(source: AutoNewsRssSource, maxItems = 30): Promise<RssItem[]> {
  try {
    const { fetchWithRetry } = await import("@/lib/fetch-retry");
    const resp = await fetchWithRetry(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CulturepeopleBot/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
      maxRetries: 1,
      safeRemote: true,
      safeMaxRedirects: 5,
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const items = parseRss(xml).slice(0, maxItems);

    // Google News → 실제 URL로 교체
    if (source.url.includes("news.google.com")) {
      for (const item of items) {
        if (item.link.includes("news.google.com")) {
          item.link = await resolveGoogleNewsUrl(item.link);
        }
      }
    }
    return items;
  } catch { return []; }
}

// ── 원문 직접 수집 (self-fetch 제거: Vercel serverless 타임아웃 방지) ──
interface OriginResult {
  title: string; thumbnail: string; bodyText: string; bodyHtml: string;
}

async function fetchOrigin(articleUrl: string, _baseUrl: string): Promise<OriginResult | null> {
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
    if (!resp.ok) {
      console.warn(`[auto-news] origin fetch failed: ${resp.status} for ${articleUrl.slice(0, 80)}`);
      return null;
    }
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    const html = await resp.text();
    const finalUrl = resp.url || articleUrl;

    const title = htmlExtractTitle(html);
    const thumbnail = htmlExtractThumbnail(html, finalUrl);
    const bodyHtml = htmlExtractBodyHtml(html, finalUrl);
    const bodyText = htmlToPlainText(bodyHtml);

    if (!bodyText || bodyText.length < 100) return null;
    return {
      title,
      thumbnail,
      bodyText: bodyText.slice(0, 5000),
      bodyHtml,
    };
  } catch (e) {
    console.warn("[auto-news] origin error:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── AI 편집 (공유 모듈 사용) ─────────────────────────────────
import { aiEditArticle as sharedAiEdit, extractAiJson as extractJson, VALID_CATEGORIES, callGemini, type AiEditResult as AiResult } from "@/lib/ai-prompt";

async function aiEditArticle(
  provider: string, model: string, apiKey: string,
  rssTitle: string, bodyText: string
): Promise<AiResult | null> {
  return sharedAiEdit(provider, model, apiKey, rssTitle, bodyText, "");
}

// ── 정정/바로잡기 기사 판별 ──────────────────────────────────
const CORRECTION_PATTERNS = [
  /^\s*\[바로잡습니다\]/,
  /^\s*\[정정\]/,
  /^\s*\[수정\]/,
  /^\s*\[사과\]/,
  /^\s*\[바로잡기\]/,
  /^\s*\[오보\]/,
  /정정\s*보도/,
];

function isCorrectionArticle(title: string): boolean {
  return CORRECTION_PATTERNS.some((p) => p.test(title));
}

// ── Pexels 이미지 검색 (썸네일·본문용 2장) ───────────────────
interface PexelsImages {
  thumbnail: string | null;
  bodyImage: string | null; // 썸네일과 다른 이미지 (본문 삽입용)
}

async function searchPexelsImages(
  title: string,
  geminiApiKey: string,
  pexelsApiKey: string
): Promise<PexelsImages> {
  const empty: PexelsImages = { thumbnail: null, bodyImage: null };
  if (!pexelsApiKey) return empty;
  try {
    // Gemini로 영어 키워드 추출 (검색 정확도 향상)
    let query = title;
    if (geminiApiKey) {
      try {
        const gr = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `다음 뉴스 제목을 Pexels 이미지 검색용 영어 키워드 1~3개로 변환하세요 (쉼표 구분, 다른 설명 없이):\n${title}` }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 50 },
            }),
            signal: AbortSignal.timeout(8000),
          }
        );
        if (gr.ok) {
          const gd = await gr.json();
          const kw = gd.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (kw && kw.length < 100) query = kw;
        }
      } catch { /* Gemini 실패 시 원제목 사용 */ }
    }

    // per_page=2 로 2장 받아 thumbnail/body에 서로 다른 이미지 사용
    const pr = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=2&orientation=landscape`,
      { headers: { Authorization: pexelsApiKey }, signal: AbortSignal.timeout(10000) }
    );
    if (!pr.ok) return empty;
    const pd = await pr.json();
    const photos = pd.photos ?? [];
    const pick = (p: Record<string, unknown>) =>
      ((p.src as Record<string, string>)?.large2x ?? (p.src as Record<string, string>)?.large ?? null);
    return {
      thumbnail: photos[0] ? pick(photos[0]) : null,
      bodyImage:  photos[1] ? pick(photos[1]) : null, // 2번째 → 본문용 (다른 이미지)
    };
  } catch { return empty; }
}

/** 본문 HTML에 이미지 없으면 2번째 </p> 뒤에 삽입 (대표이미지와 다른 이미지) */
function injectImageIntoBody(body: string, imageUrl: string, altText: string): string {
  if (!imageUrl || body.includes("<img")) return body; // 이미 이미지 있으면 스킵
  const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${imageUrl}" alt="${altText.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
  // 2번째 </p> 뒤에 삽입 (첫 문단 바로 다음 X, 2번째 문단 다음에)
  let count = 0;
  let idx = -1;
  let pos = 0;
  while (pos < body.length) {
    const found = body.indexOf("</p>", pos);
    if (found === -1) break;
    count++;
    if (count === 2) { idx = found + 4; break; }
    pos = found + 4;
  }
  if (idx === -1) {
    // </p> 가 1개 이하면 맨 뒤에 삽입
    const firstP = body.indexOf("</p>");
    if (firstP === -1) return body + imgHtml;
    return body.slice(0, firstP + 4) + imgHtml + body.slice(firstP + 4);
  }
  return body.slice(0, idx) + imgHtml + body.slice(idx);
}

// ── 제목 정규화: 공백·특수문자 제거 + 소문자 + 유니코드 NFC 정규화 ──
function normalizeTitle(t: string): string {
  return t.replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase().normalize("NFC");
}

// ── DB 기사 캐시 (중복 체크용, TTL 30분) ─────────────────
let _dbArticlesCache: { urls: Set<string>; titles: Set<string>; ts: number } | null = null;
const DB_CACHE_TTL = 30 * 60 * 1000; // 30분 TTL
async function getDbArticlesCache(): Promise<{ urls: Set<string>; titles: Set<string> }> {
  if (_dbArticlesCache && Date.now() - _dbArticlesCache.ts < DB_CACHE_TTL) return _dbArticlesCache;
  try {
    const { serverGetRecentTitles } = await import("@/lib/db-server");
    const recent = await serverGetRecentTitles(30);
    const urls = new Set(recent.filter((a) => a.sourceUrl).map((a) => a.sourceUrl!));
    const titles = new Set(recent.map((a) => normalizeTitle(a.title)));
    _dbArticlesCache = { urls, titles, ts: Date.now() };
  } catch {
    _dbArticlesCache = { urls: new Set(), titles: new Set(), ts: Date.now() };
  }
  return _dbArticlesCache;
}

// ── 중복 체크 (이력 + DB) ────────────────────────────────────
async function isDuplicate(sourceUrl: string, history: AutoNewsRun[], windowHours: number, title?: string): Promise<boolean> {
  // 1) 이력 기반 (기존)
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  for (const run of history) {
    if (run.startedAt < cutoff) continue;
    if (run.articles.some((a) => a.sourceUrl === sourceUrl && a.status === "ok")) return true;
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

// ── 메인 실행 함수 ───────────────────────────────────────────
async function runAutoNews(options: {
  source?: "cron" | "manual" | "cli";
  countOverride?: number;
  keywordsOverride?: string[];
  categoryOverride?: string;
  statusOverride?: "게시" | "임시저장";
  preview?: boolean;
  dateRangeDays?: number;
  noAiEdit?: boolean;
  excludeUrls?: string[]; // 이전 실행에서 시도한 URL (중복 방지)
  baseUrl?: string;
}): Promise<AutoNewsRun> {
  const startedAt = new Date().toISOString();
  const runId = `run_${Date.now()}`;
  const src = options.source ?? "manual";

  const settings = await serverGetSetting<AutoNewsSettings>("cp-auto-news-settings", DEFAULT_AUTO_NEWS_SETTINGS);

  if (src === "cron" && !settings.cronEnabled) {
    console.log("[auto-news] cron 비활성화로 인해 실행 중단");
    return {
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "중단됨", sourceUrl: "", status: "skip", error: "자동 뉴스 cron이 비활성화되어 있습니다." }],
    };
  }

  // 자동 뉴스 기능이 비활성화되어 있는 경우 (수동 실행 'manual' 제외한 모든 경우 중단)
  if (!settings.enabled && src !== "manual") {
    console.log(`[auto-news] 기능 비활성화로 인해 실행 중단 (source: ${src})`);
    return {
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "중단됨", sourceUrl: "", status: "skip", error: "자동 뉴스 기능이 비활성화되어 있습니다." }],
    };
  }

  const aiSettings = await serverGetSetting<{ geminiApiKey?: string; openaiApiKey?: string; pexelsApiKey?: string }>("cp-ai-settings", {});

  const count = options.countOverride ?? settings.count ?? 5;
  const keywords = options.keywordsOverride ?? settings.keywords ?? [];
  const category = options.categoryOverride ?? settings.category ?? "공공";
  const publishStatus = options.statusOverride ?? settings.publishStatus ?? "임시저장";
  const aiProvider = settings.aiProvider ?? "gemini";
  const aiModel = settings.aiModel ?? "gemini-2.0-flash";
  const author = settings.author ?? "";

  const apiKey = aiProvider === "openai"
    ? (aiSettings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "")
    : (aiSettings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "");
  const pexelsApiKey = aiSettings.pexelsApiKey ?? process.env.PEXELS_API_KEY ?? "";
  const geminiApiKey = aiSettings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "";

  const baseUrl = options.baseUrl ?? getBaseUrl();

  // 이력 로드 (중복 체크용)
  const history = await serverGetSetting<AutoNewsRun[]>("cp-auto-news-history", []);
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
      "Media storage check failed before auto-news run",
      mediaStorage.errors[0] || "Media storage is not healthy.",
      { route: "auto-news", mediaStorage },
    );
  }

  // 활성화된 RSS 소스 수집
  const activeSources = (settings.sources ?? DEFAULT_AUTO_NEWS_SETTINGS.sources).filter((s) => s.enabled);
  if (activeSources.length === 0) {
    return {
      id: runId, startedAt, completedAt: new Date().toISOString(),
      source: src, articlesPublished: 0, articlesSkipped: 0, articlesFailed: 0,
      articles: [{ title: "설정 오류", sourceUrl: "", status: "fail", error: "활성화된 RSS 소스가 없습니다." }],
    };
  }

  // RSS 수집 (소스별 병렬)
  const allItems = (await Promise.all(
    activeSources.map((s) => fetchRssItems(s, Math.ceil(count * 3)))
  )).flat();

  // 날짜 범위 필터 + 정정/바로잡기 기사 제외 + 키워드 필터
  const dateRangeCutoff = options.dateRangeDays && options.dateRangeDays > 0
    ? new Date(Date.now() - options.dateRangeDays * 24 * 60 * 60 * 1000)
    : null;
  const filtered = allItems.filter((item) => {
    if (isCorrectionArticle(item.title)) return false;
    if (dateRangeCutoff && item.pubDate) {
      const pub = new Date(item.pubDate);
      if (!isNaN(pub.getTime()) && pub < dateRangeCutoff) return false;
    }
    if (keywords.length === 0) return true;
    return keywords.some((kw) => item.title.includes(kw) || item.description.includes(kw));
  });

  // 중복 URL 제거 + history 중복 제거 + excludeUrls (이전 실행에서 시도한 URL 제외)
  const excludeSet = new Set(options.excludeUrls ?? []);
  const seen = new Set<string>();
  const deduped: typeof filtered = [];
  for (const item of filtered) {
    if (!item.link || seen.has(item.link)) continue;
    seen.add(item.link);
    // 이전 실행에서 시도한 URL/제목이면 건너뛰기
    if (excludeSet.has(item.link)) continue;
    if (item.title && excludeSet.has(item.title)) continue;
    const dup = await isDuplicate(item.link, history, settings.dedupeWindowHours ?? 48, item.title);
    if (!dup) deduped.push(item);
  }

  const targets = deduped.slice(0, count);
  const results: AutoNewsArticleResult[] = [];
  const TIMEOUT_MS = 50_000; // 50초 안전 마진
  const startTime = Date.now();
  let timedOut = false;

  for (const item of targets) {
    // 타임아웃 체크
    if (Date.now() - startTime > TIMEOUT_MS) {
      timedOut = true;
      console.warn(`[auto-news] 50초 안전 마진 도달, 조기 종료`);
      break;
    }

    // preview 모드: 저장하지 않고 목록만 반환
    if (options.preview) {
      results.push({ title: item.title, sourceUrl: item.link, status: "preview" });
      continue;
    }

    // 원문 수집 (실패하면 본문 없이 등록할 수 없으므로 건너뜀)
    const origin = await fetchOrigin(item.link, baseUrl);
    if (!origin || !origin.bodyText || origin.bodyText.length < 100) {
      results.push({ title: item.title, sourceUrl: item.link, status: "fail", error: "원문 수집 실패 (본문 없음)" });
      continue;
    }

    // 금칙어 필터
    const BLOCKED_KEYWORDS = ["전대통령"];
    if (BLOCKED_KEYWORDS.some((kw) => origin.bodyText.includes(kw) || item.title.includes(kw))) {
      results.push({ title: item.title, sourceUrl: item.link, status: "skip", error: "금칙어 포함" });
      continue;
    }

    // 원본 이미지 확인 — 이미지 없으면 등록하지 않음
    const originThumb = origin.thumbnail || "";
    if (!originThumb) {
      results.push({ title: item.title, sourceUrl: item.link, status: "no_image", error: "원본 이미지 없음" });
      continue;
    }

    // AI 편집 (noAiEdit 시 건너뜀)
    const edited = (apiKey && !options.noAiEdit) ? await aiEditArticle(aiProvider, aiModel, apiKey, item.title, origin.bodyText) : null;

    const aiFailed = !edited && apiKey && !options.noAiEdit;

    // AI 편집 실패 시 관리자 알림
    if (aiFailed) {
      console.error(`[auto-news] AI 편집 5회 실패: ${item.title.slice(0, 50)}`);
      try {
        const logs = await serverGetSetting<{ action: string; target: string; detail: string; timestamp: string; user: string }[]>("cp-activity-logs", []);
        logs.unshift({ action: "AI편집실패", target: item.title.slice(0, 100), detail: `자동뉴스 AI 편집 5회 실패. 임시저장함에 저장됨. 원문: ${item.link || ""}`, timestamp: new Date().toISOString(), user: "시스템" });
        await serverSaveSetting("cp-activity-logs", logs.slice(0, 1000));
      } catch { /* 무시 */ }
      try {
        const nodemailer = await import("nodemailer");
        const nlSettings = await serverGetSetting<{ smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; smtpSecure?: boolean; senderEmail?: string }>("cp-newsletter-settings", {});
        if (nlSettings.smtpHost && nlSettings.smtpUser && nlSettings.smtpPass) {
          const transporter = nodemailer.default.createTransport({ host: nlSettings.smtpHost, port: nlSettings.smtpPort || 587, secure: nlSettings.smtpSecure ?? false, auth: { user: nlSettings.smtpUser, pass: nlSettings.smtpPass } });
          await transporter.sendMail({ from: `"컬처피플 시스템" <${nlSettings.senderEmail || nlSettings.smtpUser}>`, to: "curpy@naver.com", subject: `[컬처피플] AI 편집 실패 — ${item.title.slice(0, 30)}`, html: `<p>자동뉴스 AI 편집 5회 실패</p><p><b>제목:</b> ${item.title}</p><p><b>원문:</b> <a href="${item.link}">${item.link}</a></p><p>임시저장함에 저장됨</p><p><a href="https://culturepeople.co.kr/cam/articles?status=임시저장">확인하기</a></p>` });
        }
      } catch { /* 무시 */ }
    }

    const finalTitle = edited?.title || item.title;
    let finalBody  = edited?.body || origin.bodyText.split(/\n\n+/).filter(p => p.trim().length > 20).map(p => `<p>${p.trim()}</p>`).join("\n\n") || `<p>${origin.bodyText.slice(0, 1000)}</p>`;
    const finalSummary = edited?.summary || item.description || "";
    const finalTags  = edited?.tags   || "";
    const finalCategory = (edited?.category && VALID_CATEGORIES.includes(edited.category)) ? edited.category : category;

    // 본문 최소 길이 검증 (AI 편집 실패 시 너무 짧은 본문 방지)
    const plainBody = finalBody.replace(/<[^>]*>/g, "").trim();
    if (plainBody.length < 100) {
      results.push({ title: finalTitle, sourceUrl: item.link, status: "fail", error: `본문 너무 짧음 (${plainBody.length}자)` });
      continue;
    }

    // 원본 이미지 Supabase 업로드 (HTML 페이지 URL이면 og:image/본문 이미지 자동 추출)
    let thumbnail = "";
    if (originThumb && !originThumb.includes("supabase")) {
      const uploaded = await serverUploadImageUrl(originThumb);
      if (uploaded) thumbnail = uploaded;
      // 업로드 실패 시: 이미지 확장자가 있는 URL만 폴백 허용
      else if (/\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(originThumb)) thumbnail = originThumb;
    } else {
      thumbnail = originThumb;
    }

    // 썸네일 없으면 원문 페이지에서 이미지 재시도 (og:image 외 본문 이미지도 탐색)
    if (!thumbnail && item.link) {
      const fromPage = await serverUploadImageUrl(item.link);
      if (fromPage) thumbnail = fromPage;
    }

    // 그래도 없으면 Pexels 저작권 무료 이미지 검색
    if (!thumbnail && pexelsApiKey) {
      const pexels = await searchPexelsImages(finalTitle, geminiApiKey, pexelsApiKey);
      if (pexels.thumbnail) {
        const up = await serverUploadImageUrl(pexels.thumbnail);
        if (up) thumbnail = up;
      }
    }

    // 최종: 이미지 확보 실패 시 OG 이미지 API로 제목 카드 생성
    if (!thumbnail) {
      // articleId로 OG 이미지 생성 (기사 저장 후 thumbnail 업데이트)
      // 여기서는 일단 빈 thumbnail로 기사 등록 후 아래에서 OG URL 설정
    }

    // 출처 도메인 추출
    let sourceDomain = "";
    try { sourceDomain = new URL(item.link).hostname.replace(/^www\./, ""); } catch { /* ignore */ }

    // 본문에 출처 이미지 삽입 (2번째 문단 뒤, 출처 표시 포함) — thumbnail이 있을 때만
    if (thumbnail && !/<img[^>]+src=/i.test(finalBody)) {
      const imgHtml = `<figure style="margin:1.5em 0;text-align:center;"><img src="${thumbnail}" alt="${finalTitle.replace(/"/g, "&quot;")}" style="max-width:100%;height:auto;border-radius:6px;" />${sourceDomain ? `<figcaption style="font-size:12px;color:#999;margin-top:4px;">사진 출처: ${sourceDomain}</figcaption>` : ""}</figure>`;
      let count = 0;
      let idx = -1;
      let pos = 0;
      while (pos < finalBody.length) {
        const found = finalBody.indexOf("</p>", pos);
        if (found === -1) break;
        count++;
        if (count === 2) { idx = found + 4; break; }
        pos = found + 4;
      }
      if (idx === -1) {
        const firstP = finalBody.indexOf("</p>");
        if (firstP === -1) finalBody = finalBody + imgHtml;
        else finalBody = finalBody.slice(0, firstP + 4) + imgHtml + finalBody.slice(firstP + 4);
      } else {
        finalBody = finalBody.slice(0, idx) + imgHtml + finalBody.slice(idx);
      }
    }

    // 기사 저장
    try {
      const today = new Date().toISOString().slice(0, 10);
      const article: Article = {
        id: "", // 서버에서 자동 채번
        title: finalTitle,
        category: finalCategory,
        date: today,
        status: aiFailed ? "임시저장" : publishStatus,
        views: 0,
        body: finalBody,
        thumbnail: thumbnail || undefined,
        tags: finalTags || undefined,
        author: author || undefined,
        summary: finalSummary || undefined,
        sourceUrl: item.link || undefined,
        updatedAt: new Date().toISOString(),
        aiGenerated: !!edited,
        reviewNote: aiFailed ? "AI 편집 실패 — 수동 검토 필요 (3회 재시도 소진)" : undefined,
      };
      const savedNo = await serverCreateArticle(article);
      const articleId = String(savedNo || "");
      // Next.js ISR 캐시 무효화 — 기사 목록에 즉시 반영
      try { revalidateTag("articles"); } catch { /* 캐시 무효화 실패 무시 */ }
      // serverCreateArticle이 throw 없이 반환하면 저장 성공으로 간주
      // (기존 read-back 체크는 캐시 불일치로 false negative 발생하여 제거)
      // thumbnail 없는 기사는 OG API가 기본 사이트 이미지를 사용 (재귀 참조 방지)
      // 같은 배치 내 중복 방지: 등록 즉시 캐시 업데이트
      addToDbCache(item.link, finalTitle);
      results.push({ title: finalTitle, sourceUrl: item.link, status: "ok", articleId, ...(articleWarnings ? { warnings: articleWarnings } : {}) });
      await notifyTelegramArticleRegistered({
        kind: "auto_news",
        title: finalTitle,
        source: (() => {
          try { return new URL(item.link).hostname; } catch { return "auto-news"; }
        })(),
        registeredAt: new Date().toISOString(),
        status: article.status,
        articleId,
        articleNo: savedNo,
        sourceUrl: item.link,
        summary: finalSummary,
        thumbnail: article.thumbnail,
      }).catch((error) => {
        console.warn("[auto-news] telegram notify failed:", error instanceof Error ? error.message : error);
      });

      // 건별 이력 즉시 저장 — 타임아웃 시에도 등록된 기사 유실 방지
      if (!options.preview) {
        try {
          const partialRun: AutoNewsRun = {
            id: runId, startedAt, completedAt: new Date().toISOString(), source: src,
            articlesPublished: results.filter((r) => r.status === "ok").length,
            articlesSkipped: results.filter((r) => r.status === "no_image" || r.status === "skip").length,
            articlesFailed: results.filter((r) => r.status === "fail").length,
            articles: [...results],
            ...(runWarnings.length > 0 ? { warnings: runWarnings, mediaStorage } : { mediaStorage }),
          };
          const updatedHistory = [partialRun, ...history.filter((h) => h.id !== runId)].slice(0, 50);
          await serverSaveSetting("cp-auto-news-history", updatedHistory);
        } catch { /* 이력 저장 실패 무시 — 기사는 이미 DB에 저장됨 */ }
      }
    } catch (e) {
      results.push({ title: finalTitle, sourceUrl: item.link, status: "fail", error: e instanceof Error ? e.message : "처리 실패" });
      await createNotification(
        "ai_failure",
        `AI 편집 실패: ${finalTitle} — ${e instanceof Error ? e.message : String(e)}`,
        "",
        { route: "auto-news", articleTitle: finalTitle, error: e instanceof Error ? e.message : String(e) }
      );
    }

    // API rate limit 방어: 요청 사이 0.5초 대기
    await new Promise((r) => setTimeout(r, 500));
  }

  // 기존에 있던 항목들을 dup로 기록 (count 초과) + no_image/skip 결과
  const skipped = deduped.slice(count).length + (allItems.length - deduped.length)
    + results.filter((r) => r.status === "no_image" || r.status === "skip").length;
  const previewCount = results.filter((r) => r.status === "preview").length;

  const run: AutoNewsRun = {
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
      ? [...results, { title: "⏱️ 시간 초과", sourceUrl: "", status: "skip" as const, error: `50초 안전 마진 도달, 조기 종료. 나머지는 다음 실행에서 처리됩니다.` }]
      : results,
    ...(runWarnings.length > 0 ? { warnings: runWarnings, mediaStorage } : { mediaStorage }),
  };

  // 최종 이력 저장 (최대 50건)
  if (!options.preview) {
    const newHistory = [run, ...history.filter((h) => h.id !== runId)].slice(0, 50);
    await serverSaveSetting("cp-auto-news-history", newHistory);
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
      // GET: query params
      const sp = new URL(req.url).searchParams;
      if (sp.get("count")) { const parsed = parseInt(sp.get("count")!); if (!isNaN(parsed) && parsed > 0) body.count = parsed; }
      if (sp.get("keywords")) body.keywords = sp.get("keywords")!.split(",").map((k) => k.trim().slice(0, 50)).filter(Boolean).slice(0, 20);
      if (sp.get("category")) body.category = sp.get("category");
      if (sp.get("status")) body.publishStatus = sp.get("status");
      if (sp.get("source")) body.source = sp.get("source");
      if (sp.get("preview")) body.preview = sp.get("preview") === "true";
      if (sp.get("dateRangeDays")) body.dateRangeDays = sp.get("dateRangeDays");
      if (sp.get("noAiEdit")) body.noAiEdit = sp.get("noAiEdit") === "true";
    }

    // baseUrl은 환경변수만 허용 (x-forwarded-host SSRF 방지)
    const baseUrl = getBaseUrl();

    const run = await runAutoNews({
      source: inferExecutionSource(req, body.source),
      countOverride: body.count as number | undefined,
      keywordsOverride: body.keywords as string[] | undefined,
      categoryOverride: body.category as string | undefined,
      statusOverride: body.publishStatus as "게시" | "임시저장" | undefined,
      preview: body.preview as boolean | undefined,
      dateRangeDays: body.dateRangeDays ? Number(body.dateRangeDays) : undefined,
      noAiEdit: body.noAiEdit as boolean | undefined,
      excludeUrls: body.excludeUrls as string[] | undefined,
      baseUrl,
    });

    // auto-press는 별도 cron(vercel.json)으로 독립 실행 — self-fetch 체인 제거 (2026-03-25)

    return NextResponse.json({ success: true, run });
  } catch (e) {
    console.error("[auto-news] handler error:", e);
    await createNotification(
      "cron_failure",
      "[auto-news] 실행 실패: " + (e instanceof Error ? e.message : String(e)),
      "",
      { route: "auto-news", error: e instanceof Error ? e.message : String(e) }
    );
    return NextResponse.json({ success: false, error: "자동 뉴스 처리 중 오류가 발생했습니다." }, { status: 500 });
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
