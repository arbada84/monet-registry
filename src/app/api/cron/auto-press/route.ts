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
import { serverGetSetting, serverSaveSetting, serverCreateArticle } from "@/lib/db-server";
import { serverUploadImageUrl } from "@/lib/server-upload-image";
import { verifyAuthToken } from "@/lib/cookie-auth";
import type {
  AutoPressSettings, AutoPressSource,
  AutoPressRun, AutoPressArticleResult,
} from "@/types/article";
import type { Article } from "@/types/article";

// ── 기본 설정 ───────────────────────────────────────────────
export const DEFAULT_AUTO_PRESS_SETTINGS: AutoPressSettings = {
  enabled: false,
  sources: [
    { id: "gov_policy",   name: "정책뉴스",     boTable: "rss",      sca: "policy",       enabled: true  },
    { id: "gov_press",    name: "브리핑룸",     boTable: "rss",      sca: "pressrelease", enabled: true  },
    { id: "gov_all",      name: "정부 전체",     boTable: "rss",      sca: "",             enabled: false },
    { id: "nw_all",       name: "뉴스와이어 전체", boTable: "newswire", sca: "",             enabled: true  },
    { id: "nw_policy",    name: "뉴스와이어 정책", boTable: "newswire", sca: "1400",         enabled: false },
    { id: "nw_economy",   name: "뉴스와이어 경제", boTable: "newswire", sca: "100",          enabled: false },
    { id: "nw_culture",   name: "뉴스와이어 문화", boTable: "newswire", sca: "1200",         enabled: false },
  ],
  keywords: [],
  category: "보도자료",
  count: 5,
  publishStatus: "임시저장",
  aiProvider: "gemini",
  aiModel: "gemini-2.0-flash",
  author: "",
  cronEnabled: false,
  dedupeWindowHours: 48,
  requireImage: true,
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

// ── 날짜 유효성 검사 (KST 기준) ─────────────────────────────
/**
 * 평일: 오늘/어제 자료만 허용
 * 주말(토/일): 직전 금요일(워킹데이-1)까지 허용
 */
function isDateAllowed(dateStr: string): boolean {
  if (!dateStr) return false;

  // 다양한 날짜 형식 지원: "2026-03-07", "03-07", "26-03-07", "2026.03.07" 등
  const cleaned = dateStr.replace(/\./g, "-").trim();
  const now = new Date();
  // KST (UTC+9)
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstToday = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());

  // 날짜 파싱
  let itemDate: Date;
  const parts = cleaned.split("-").map((p) => p.trim());
  if (parts.length === 3) {
    let year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    if (year < 100) year += 2000;
    itemDate = new Date(year, month, day);
  } else if (parts.length === 2) {
    // MM-DD 형식 → 올해로 간주
    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    itemDate = new Date(kstToday.getFullYear(), month, day);
  } else {
    return false;
  }

  if (isNaN(itemDate.getTime())) return false;

  const dayOfWeek = kstToday.getDay(); // 0=일, 6=토

  let cutoffDate: Date;
  if (dayOfWeek === 0) {
    // 일요일 → 금요일(-2일)까지 허용
    cutoffDate = new Date(kstToday);
    cutoffDate.setDate(cutoffDate.getDate() - 2);
  } else if (dayOfWeek === 6) {
    // 토요일 → 금요일(-1일)까지 허용
    cutoffDate = new Date(kstToday);
    cutoffDate.setDate(cutoffDate.getDate() - 1);
  } else if (dayOfWeek === 1) {
    // 월요일 → 금요일(-3일)까지 허용
    cutoffDate = new Date(kstToday);
    cutoffDate.setDate(cutoffDate.getDate() - 3);
  } else {
    // 화~금 → 어제까지만 허용
    cutoffDate = new Date(kstToday);
    cutoffDate.setDate(cutoffDate.getDate() - 1);
  }

  // itemDate가 cutoffDate ~ 오늘 사이면 OK
  return itemDate >= cutoffDate && itemDate <= kstToday;
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

// ── AI 편집 ─────────────────────────────────────────────────
interface AiResult {
  title: string; summary: string; body: string; tags: string;
}

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

const AI_PROMPT = `당신은 컬처피플 뉴스 편집 AI입니다. 아래 보도자료/정책 뉴스 원문을 분석하여 독자 친화적인 한국어 기사로 편집하세요.

규칙:
1. 제목은 원문 의미를 살리되 60자 이내, 핵심을 담아 간결하게
2. 본문은 HTML 형식으로 4-6개 문단 (<p> 태그), 각 문단 2-4문장
3. 원문 사실만 작성 (창작/추측 금지), 객관적 어조 유지
4. 광고, 관련 기사 링크, 기자 정보, SNS 버튼 등 불필요 내용 제거
5. 원문 이미지(<img> 태그)는 반드시 본문에 포함하세요 (이미지 삭제 금지)
6. 요약은 기사 핵심을 2문장으로 (80자 이내)
7. 태그는 핵심 키워드 3-5개, 쉼표 구분

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{"title":"...","summary":"...","body":"<p>...</p>","tags":"태그1,태그2,태그3"}`;

function extractJson(raw: string): AiResult | null {
  let text = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
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
  originalTitle: string, bodyText: string, bodyHtml: string
): Promise<AiResult | null> {
  // 이미지 태그를 포함하여 AI에 전달
  const imgTags = bodyHtml.match(/<img[^>]+>/gi) ?? [];
  const content = `원문 제목: ${originalTitle}\n\n원문 본문:\n${bodyText}\n\n원문 이미지 태그:\n${imgTags.join("\n")}`;
  try {
    let raw = "";
    if (provider === "openai") {
      raw = await callOpenAI(apiKey, model, AI_PROMPT, content);
    } else {
      raw = await callGemini(apiKey, model || "gemini-2.0-flash", AI_PROMPT, content);
    }
    return extractJson(raw);
  } catch (e) {
    console.error("[auto-press] AI 편집 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── 중복 체크 ────────────────────────────────────────────────
async function isDuplicate(wrId: string, boTable: string, history: AutoPressRun[], windowHours: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  for (const run of history) {
    if (run.startedAt < cutoff) continue;
    if (run.articles.some((a) => a.wrId === wrId && a.boTable === boTable && a.status === "ok")) return true;
  }
  return false;
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
  wrIds?: string[]; // "boTable:wrId" 형식으로 특정 기사만 지정
  baseUrl?: string;
}): Promise<AutoPressRun> {
  const startedAt = new Date().toISOString();
  const runId = `press_${Date.now()}`;
  const src = options.source ?? "manual";

  const settings = await serverGetSetting<AutoPressSettings>("cp-auto-press-settings", DEFAULT_AUTO_PRESS_SETTINGS);
  const aiSettings = await serverGetSetting<{ geminiApiKey?: string; openaiApiKey?: string }>("cp-ai-settings", {});

  const count = options.countOverride ?? settings.count ?? 5;
  const keywords = options.keywordsOverride ?? settings.keywords ?? [];
  const category = options.categoryOverride ?? settings.category ?? "보도자료";
  const publishStatus = options.statusOverride ?? settings.publishStatus ?? "임시저장";
  const aiProvider = settings.aiProvider ?? "gemini";
  const aiModel = settings.aiModel ?? "gemini-2.0-flash";
  const author = settings.author ?? "";
  const requireImage = settings.requireImage !== false;

  const apiKey = aiProvider === "openai"
    ? (aiSettings.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "")
    : (aiSettings.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "");

  const baseUrl = options.baseUrl
    ?? process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "")
    ?? "https://culturepeople.co.kr";

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
  let targets: { item: NetproListItem; source: AutoPressSource }[];

  if (options.wrIds && options.wrIds.length > 0) {
    // wrIds: ["newswire:65894", "rss:208853", ...]
    targets = options.wrIds.map((wrIdStr) => {
      const [boTable, wrId] = wrIdStr.split(":");
      const source = activeSources.find((s) => s.boTable === boTable) ?? { id: boTable, name: boTable, boTable: boTable as "rss" | "newswire", sca: "", enabled: true as const };
      return { item: { wr_id: wrId, title: "", category: "", writer: "", date: "", hits: "", detail_url: "" }, source };
    });
  } else {
    // 소스별 netpro 목록 수집 (병렬)
    const allItems: { item: NetproListItem; source: AutoPressSource }[] = [];
    const listResults = await Promise.all(
      activeSources.map(async (source) => {
        const items = await fetchNetproList(baseUrl, source.boTable, source.sca, Math.ceil(count * 3));
        return items.map((item) => ({ item, source }));
      })
    );
    for (const items of listResults) allItems.push(...items);

    // 키워드 필터
    const filtered = allItems.filter(({ item }) => {
      if (keywords.length === 0) return true;
      return keywords.some((kw) => item.title.includes(kw));
    });

    // 중복 제거
    const seen = new Set<string>();
    const deduped: typeof filtered = [];
    for (const entry of filtered) {
      const key = `${entry.source.boTable}:${entry.item.wr_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dup = await isDuplicate(entry.item.wr_id, entry.source.boTable, history, settings.dedupeWindowHours ?? 48);
      if (!dup) deduped.push(entry);
    }

    targets = deduped.slice(0, count * 2); // 이미지 없으면 스킵하므로 여유있게
  }
  const results: AutoPressArticleResult[] = [];
  let published = 0;

  for (const { item, source } of targets) {
    if (published >= count) break;

    // preview 모드
    if (options.preview) {
      results.push({ title: item.title, sourceUrl: "", wrId: item.wr_id, boTable: source.boTable, status: "ok" });
      published++;
      continue;
    }

    // 상세 수집
    const detail = await fetchNetproDetail(baseUrl, source.boTable, item.wr_id);
    if (!detail || !detail.bodyText || detail.bodyText.length < 50) {
      results.push({ title: item.title, sourceUrl: "", wrId: item.wr_id, boTable: source.boTable, status: "fail", error: "상세 수집 실패" });
      continue;
    }

    // 날짜 체크 (상세의 date 또는 목록의 date) — force 시 우회
    const itemDate = detail.date || item.date;
    if (!options.force && !isDateAllowed(itemDate)) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "old", error: `날짜 제한 (${itemDate})` });
      continue;
    }

    // 이미지 필수 체크 — 이미지 없으면 조용히 건너뜀
    if (requireImage && !hasImages(detail.bodyHtml, detail.images)) {
      continue;
    }

    // 금칙어 필터 — 본문에 금칙어 포함 시 건너뜀
    const BLOCKED_KEYWORDS = ["전대통령"];
    const bodyTextLower = detail.bodyText || "";
    if (BLOCKED_KEYWORDS.some((kw) => bodyTextLower.includes(kw))) {
      results.push({ title: item.title, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "skip", error: `금칙어 포함` });
      continue;
    }

    // AI 편집
    const edited = apiKey
      ? await aiEditArticle(aiProvider, aiModel, apiKey, item.title, detail.bodyText.slice(0, 3000), detail.bodyHtml)
      : null;

    const finalTitle = edited?.title || item.title;
    let finalBody = edited?.body || detail.bodyHtml || `<p>${detail.bodyText.slice(0, 1000)}</p>`;
    const finalSummary = edited?.summary || "";
    const finalTags = edited?.tags || "";

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

    // 최종 이미지 없으면 조용히 건너뜀
    if (requireImage && !/<img[^>]+src=/i.test(finalBody)) {
      continue;
    }

    // 본문 이미지 재업로드 (Supabase)
    finalBody = await reuploadBodyImages(finalBody);

    // 대표이미지: 본문 첫 이미지
    let thumbnail = "";
    const firstImg = finalBody.match(/<img[^>]+src="([^"]+)"/i);
    if (firstImg?.[1]) thumbnail = firstImg[1];

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
        author: author || detail.writer || undefined,
        summary: finalSummary || undefined,
        sourceUrl: detail.sourceUrl || undefined,
        updatedAt: new Date().toISOString(),
      };
      await serverCreateArticle(article);
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "ok", articleId });
      published++;
    } catch (e) {
      results.push({ title: finalTitle, sourceUrl: detail.sourceUrl, wrId: item.wr_id, boTable: source.boTable, status: "fail", error: String(e) });
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
    articles: results,
  };

  if (!options.preview) {
    const newHistory = [run, ...history].slice(0, 50);
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
      if (sp.get("count")) body.count = parseInt(sp.get("count")!);
      if (sp.get("keywords")) body.keywords = sp.get("keywords")!.split(",").map((k) => k.trim());
      if (sp.get("category")) body.category = sp.get("category");
      if (sp.get("status")) body.publishStatus = sp.get("status");
      if (sp.get("preview")) body.preview = sp.get("preview") === "true";
      if (sp.get("force")) body.force = sp.get("force") === "true";
    }

    // 로컬 개발 시 origin 사용, 프로덕션은 x-forwarded-host 또는 환경변수
    const origin = new URL(req.url).origin;
    const baseUrl = (body.baseUrl as string)
      || (origin.includes("localhost") ? origin : null)
      || (req.headers.get("x-forwarded-host") ? `https://${req.headers.get("x-forwarded-host")}` : null)
      || process.env.NEXT_PUBLIC_SITE_URL?.split(/\s/)[0]?.replace(/\/$/, "")
      || "https://culturepeople.co.kr";

    const run = await runAutoPress({
      source: (body.source as "cron" | "manual" | "cli") ?? "manual",
      countOverride: body.count as number | undefined,
      keywordsOverride: body.keywords as string[] | undefined,
      categoryOverride: body.category as string | undefined,
      statusOverride: body.publishStatus as "게시" | "임시저장" | undefined,
      preview: body.preview as boolean | undefined,
      force: body.force as boolean | undefined,
      wrIds: body.wrIds as string[] | undefined,
      baseUrl,
    });

    return NextResponse.json({ success: true, run });
  } catch (e) {
    console.error("[auto-press] handler error:", e);
    return NextResponse.json({ success: false, error: "보도자료 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export const POST = handler;
export const GET  = handler;
