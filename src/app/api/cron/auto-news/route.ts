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
    { id: "yonhap",   name: "연합뉴스",  url: "https://www.yna.co.kr/RSS/all.xml",              enabled: true  },
    { id: "kbs",      name: "KBS 뉴스",  url: "https://news.kbs.co.kr/rss/rss_news.xml",        enabled: true  },
    { id: "ytn",      name: "YTN",       url: "https://www.ytn.co.kr/_rss_main.php",             enabled: false },
    { id: "mbc",      name: "MBC 뉴스",  url: "https://imnews.imbc.com/rss/news/news_00.xml",   enabled: false },
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
  const aiSettings = await serverGetSetting<{ geminiApiKey?: string; openaiApiKey?: string }>("cp-ai-settings", {});

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

  const baseUrl = options.baseUrl
    ?? process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")
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

  // 키워드 필터
  const filtered = keywords.length > 0
    ? allItems.filter((item) =>
        keywords.some((kw) =>
          item.title.includes(kw) || item.description.includes(kw)
        )
      )
    : allItems;

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

    // 원문 수집
    const origin = await fetchOrigin(item.link, baseUrl);
    if (!origin || !origin.bodyText) {
      results.push({ title: item.title, sourceUrl: item.link, status: "fail", error: "원문 수집 실패" });
      continue;
    }

    // AI 편집
    const edited = apiKey ? await aiEditArticle(aiProvider, aiModel, apiKey, item.title, origin.bodyText) : null;

    const finalTitle = edited?.title || item.title;
    const finalBody  = edited?.body  || `<p>${origin.bodyText.slice(0, 1000)}</p>`;
    const finalSummary = edited?.summary || item.description || "";
    const finalTags  = edited?.tags   || "";

    // 썸네일 Supabase 업로드
    let thumbnail = origin.thumbnail;
    if (thumbnail && !thumbnail.includes("supabase")) {
      const uploaded = await serverUploadImageUrl(thumbnail);
      if (uploaded) thumbnail = uploaded;
    }

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
        body: finalBody,
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
      : process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://culturepeople.co.kr";

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
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export const POST = handler;
export const GET  = handler;
