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
import { serverGetSetting, serverSaveSetting, serverCreateArticle } from "@/lib/db-server";
import { serverUploadImageUrl } from "@/lib/server-upload-image";
import { verifyAuthToken } from "@/lib/cookie-auth";
import type {
  AutoNewsSettings, AutoNewsRssSource,
  AutoNewsRun, AutoNewsArticleResult,
} from "@/types/article";
import type { Article } from "@/types/article";

// ── 기본 설정 ───────────────────────────────────────────────
export const DEFAULT_AUTO_NEWS_SETTINGS: AutoNewsSettings = {
  enabled: false,
  sources: [
    { id: "chosun",   name: "조선일보",  url: "https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml", enabled: true  },
    { id: "mk",       name: "매일경제",  url: "https://www.mk.co.kr/rss/30000001/",              enabled: true  },
    { id: "khan",     name: "경향신문",  url: "https://www.khan.co.kr/rss/rssdata/total_news.xml", enabled: false },
    { id: "yonhaptv", name: "연합뉴스TV", url: "https://www.yonhapnewstv.co.kr/browse/feed/",   enabled: false },
    { id: "gnews_ko", name: "Google 뉴스 (한국)", url: "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", enabled: false },
  ],
  keywords: [],
  category: "뉴스",
  count: 5,
  publishStatus: "임시저장",
  aiProvider: "gemini",
  aiModel: "gemini-2.0-flash",
  author: "",
  cronEnabled: false,
  dedupeWindowHours: 48,
};

// ── 인증 ────────────────────────────────────────────────────
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function authenticate(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
    if (timingSafeEqual(h, secret)) return true;
  }
  const cookie = req.cookies.get("cp-admin-auth");
  const result = await verifyAuthToken(cookie?.value ?? "");
  return result.valid;
}

// ── RSS 파싱 유틸 ────────────────────────────────────────────
interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
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
    const resp = await fetch(googleUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CulturepeopleBot/1.0)" },
      signal: AbortSignal.timeout(8000),
      redirect: "manual",
    });
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
    const resp = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CulturepeopleBot/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
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

// ── 원문 수집 ─────────────────────────────────────────────────
interface OriginResult {
  title: string; thumbnail: string; bodyText: string; bodyHtml: string;
}

async function fetchOrigin(articleUrl: string, baseUrl: string): Promise<OriginResult | null> {
  try {
    const resp = await fetch(`${baseUrl}/api/netpro/origin?url=${encodeURIComponent(articleUrl)}`, {
      signal: AbortSignal.timeout(18000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.success || !data.bodyText || data.bodyText.length < 100) return null;
    return {
      title: data.title || "",
      thumbnail: data.thumbnail || "",
      bodyText: data.bodyText.slice(0, 3000),
      bodyHtml: data.bodyHtml || "",
    };
  } catch { return null; }
}

// ── AI 편집 ─────────────────────────────────────────────────
interface AiResult {
  title: string; summary: string; body: string; tags: string;
}

/** Gemini 직접 호출 (서버사이드) */
async function callGemini(apiKey: string, model: string, prompt: string, content: string): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${prompt}\n\n---\n\n${content}` }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(45000),
    }
  );
  if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/** OpenAI 직접 호출 (서버사이드) */
async function callOpenAI(apiKey: string, model: string, prompt: string, content: string): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: prompt }, { role: "user", content }],
      temperature: 0.5,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

const AI_PROMPT = `당신은 컬처피플 뉴스 편집 AI입니다. 아래 뉴스 원문을 분석하여 독자 친화적인 한국어 기사로 편집하세요.

규칙:
1. 제목은 원문 의미를 살리되 60자 이내, 핵심을 담아 간결하게
2. 본문은 HTML 형식으로 4-6개 문단 (<p> 태그), 각 문단 2-4문장
3. 원문 사실만 작성 (창작/추측 금지), 객관적 어조 유지
4. 광고, 관련 기사 링크, 기자 정보, SNS 버튼 등 불필요 내용 제거
5. 요약은 기사 핵심을 2문장으로 (80자 이내)
6. 태그는 핵심 키워드 3-5개, 쉼표 구분

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{"title":"...","summary":"...","body":"<p>...</p>","tags":"태그1,태그2,태그3"}`;

function extractJson(raw: string): AiResult | null {
  // JSON 추출 (마크다운 코드블록 제거)
  let text = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 첫 { 부터 마지막 } 까지 추출
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  text = text.slice(start, end + 1);

  try {
    const obj = JSON.parse(text);
    if (!obj.title || !obj.body) return null;
    return {
      title: String(obj.title).slice(0, 200),
      summary: String(obj.summary || "").slice(0, 300),
      body: String(obj.body),
      tags: String(obj.tags || ""),
    };
  } catch { return null; }
}

async function aiEditArticle(
  provider: string, model: string, apiKey: string,
  rssTitle: string, bodyText: string
): Promise<AiResult | null> {
  const content = `원문 제목: ${rssTitle}\n\n원문 본문:\n${bodyText}`;
  try {
    let raw = "";
    if (provider === "openai") {
      raw = await callOpenAI(apiKey, model, AI_PROMPT, content);
    } else {
      raw = await callGemini(apiKey, model || "gemini-2.0-flash", AI_PROMPT, content);
    }
    return extractJson(raw);
  } catch (e) {
    console.error("[auto-news] AI 편집 실패:", e instanceof Error ? e.message : e);
    return null;
  }
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

// ── 중복 체크 ────────────────────────────────────────────────
async function isDuplicate(sourceUrl: string, history: AutoNewsRun[], windowHours: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  for (const run of history) {
    if (run.startedAt < cutoff) continue;
    if (run.articles.some((a) => a.sourceUrl === sourceUrl)) return true;
  }
  return false;
}

// ── 메인 실행 함수 ───────────────────────────────────────────
export async function runAutoNews(options: {
  source?: "cron" | "manual" | "cli";
  countOverride?: number;
  keywordsOverride?: string[];
  categoryOverride?: string;
  statusOverride?: "게시" | "임시저장";
  preview?: boolean;
  baseUrl?: string;
}): Promise<AutoNewsRun> {
  const startedAt = new Date().toISOString();
  const runId = `run_${Date.now()}`;
  const src = options.source ?? "manual";

  const settings = await serverGetSetting<AutoNewsSettings>("cp-auto-news-settings", DEFAULT_AUTO_NEWS_SETTINGS);
  const aiSettings = await serverGetSetting<{ geminiApiKey?: string; openaiApiKey?: string; pexelsApiKey?: string }>("cp-ai-settings", {});

  const count = options.countOverride ?? settings.count ?? 5;
  const keywords = options.keywordsOverride ?? settings.keywords ?? [];
  const category = options.categoryOverride ?? settings.category ?? "뉴스";
  const publishStatus = options.statusOverride ?? settings.publishStatus ?? "임시저장";
  const aiProvider = settings.aiProvider ?? "gemini";
  const aiModel = settings.aiModel ?? "gemini-2.0-flash";
  const author = settings.author ?? "";

  const apiKey = aiProvider === "openai"
    ? (aiSettings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "")
    : (aiSettings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "");
  const pexelsApiKey = aiSettings.pexelsApiKey ?? process.env.PEXELS_API_KEY ?? "";
  const geminiApiKey = aiSettings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "";

  const baseUrl = options.baseUrl
    ?? process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "")
    ?? "https://culturepeople.co.kr";

  // 이력 로드 (중복 체크용)
  const history = await serverGetSetting<AutoNewsRun[]>("cp-auto-news-history", []);

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

  // 정정/바로잡기 기사 제외 + 키워드 필터
  const filtered = allItems.filter((item) => {
    if (isCorrectionArticle(item.title)) return false; // 정정 기사 제외
    if (keywords.length === 0) return true;
    return keywords.some((kw) => item.title.includes(kw) || item.description.includes(kw));
  });

  // 중복 URL 제거 + history 중복 제거
  const seen = new Set<string>();
  const deduped: typeof filtered = [];
  for (const item of filtered) {
    if (!item.link || seen.has(item.link)) continue;
    seen.add(item.link);
    const dup = await isDuplicate(item.link, history, settings.dedupeWindowHours ?? 48);
    if (!dup) deduped.push(item);
  }

  const targets = deduped.slice(0, count);
  const results: AutoNewsArticleResult[] = [];

  for (const item of targets) {
    // preview 모드: 저장하지 않고 목록만 반환
    if (options.preview) {
      results.push({ title: item.title, sourceUrl: item.link, status: "ok" });
      continue;
    }

    // 원문 수집 (실패 시 RSS description 폴백)
    const origin = await fetchOrigin(item.link, baseUrl);
    const bodySource = origin?.bodyText || item.description || "";

    // 금칙어 필터
    const BLOCKED_KEYWORDS = ["전대통령"];
    if (BLOCKED_KEYWORDS.some((kw) => bodySource.includes(kw) || item.title.includes(kw))) {
      results.push({ title: item.title, link: item.link, status: "skip", error: "금칙어 포함" });
      continue;
    }

    // AI 편집
    const edited = apiKey && bodySource ? await aiEditArticle(aiProvider, aiModel, apiKey, item.title, bodySource) : null;

    const finalTitle = edited?.title || item.title;
    const finalBody  = edited?.body  || `<p>${bodySource.slice(0, 1000)}</p>`;
    const finalSummary = edited?.summary || item.description || "";
    const finalTags  = edited?.tags   || "";

    // 썸네일 Supabase 업로드
    let thumbnail = origin?.thumbnail ?? "";
    if (thumbnail && !thumbnail.includes("supabase")) {
      const uploaded = await serverUploadImageUrl(thumbnail);
      if (uploaded) thumbnail = uploaded;
    }

    // 썸네일 없으면 Pexels 이미지 2장 검색
    // photo[0] → 대표이미지(thumbnail), photo[1] → 본문 삽입 (서로 다른 이미지)
    let bodyImageUrl = "";
    if (pexelsApiKey) {
      const pexels = await searchPexelsImages(finalTitle, geminiApiKey, pexelsApiKey);
      if (!thumbnail && pexels.thumbnail) {
        const up = await serverUploadImageUrl(pexels.thumbnail);
        if (up) thumbnail = up;
      }
      if (pexels.bodyImage) {
        const up = await serverUploadImageUrl(pexels.bodyImage);
        if (up) bodyImageUrl = up;
      }
    }

    // 본문에 본문 전용 이미지 삽입 (대표이미지와 다른 이미지)
    const finalBodyWithImage = bodyImageUrl
      ? injectImageIntoBody(finalBody, bodyImageUrl, finalTitle)
      : finalBody;

    // 기사 저장
    try {
      const articleId = crypto.randomUUID();
      const today = new Date().toISOString().slice(0, 10);
      const article: Article = {
        id: articleId,
        title: finalTitle,
        category,
        date: today,
        status: publishStatus,
        views: 0,
        body: finalBodyWithImage,
        thumbnail: thumbnail || undefined,
        tags: finalTags || undefined,
        author: author || undefined,
        summary: finalSummary || undefined,
        sourceUrl: item.link,
        updatedAt: new Date().toISOString(),
      };
      await serverCreateArticle(article);
      results.push({ title: finalTitle, sourceUrl: item.link, status: "ok", articleId });
    } catch (e) {
      results.push({ title: finalTitle, sourceUrl: item.link, status: "fail", error: String(e) });
    }

    // API rate limit 방어: 요청 사이 0.5초 대기
    await new Promise((r) => setTimeout(r, 500));
  }

  // 기존에 있던 항목들을 dup로 기록 (count 초과)
  const skipped = deduped.slice(count).length + (allItems.length - deduped.length);

  const run: AutoNewsRun = {
    id: runId,
    startedAt,
    completedAt: new Date().toISOString(),
    source: src,
    articlesPublished: results.filter((r) => r.status === "ok").length,
    articlesSkipped: skipped,
    articlesFailed: results.filter((r) => r.status === "fail").length,
    articles: results,
  };

  // 이력 저장 (최대 50건)
  if (!options.preview) {
    const newHistory = [run, ...history].slice(0, 50);
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
      if (sp.get("count")) body.count = parseInt(sp.get("count")!);
      if (sp.get("keywords")) body.keywords = sp.get("keywords")!.split(",").map((k) => k.trim());
      if (sp.get("category")) body.category = sp.get("category");
      if (sp.get("status")) body.publishStatus = sp.get("status");
      if (sp.get("preview")) body.preview = sp.get("preview") === "true";
    }

    const baseUrl = req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : (process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "") || "https://culturepeople.co.kr");

    const run = await runAutoNews({
      source: (body.source as "cron" | "manual" | "cli") ?? "manual",
      countOverride: body.count as number | undefined,
      keywordsOverride: body.keywords as string[] | undefined,
      categoryOverride: body.category as string | undefined,
      statusOverride: body.publishStatus as "게시" | "임시저장" | undefined,
      preview: body.preview as boolean | undefined,
      baseUrl,
    });

    return NextResponse.json({ success: true, run });
  } catch (e) {
    console.error("[auto-news] handler error:", e);
    return NextResponse.json({ success: false, error: "자동 뉴스 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export const POST = handler;
export const GET  = handler;
