import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { serverAddViewLog, serverIncrementViews } from "@/lib/db-server";
import { verifyAuthToken } from "@/lib/cookie-auth";

const viewCache = new Map<string, number>();
const RATE_LIMIT_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = Date.now();

const BOT_PATTERNS: [RegExp, string][] = [
  [/Googlebot/i, "Googlebot"],
  [/bingbot/i, "Bingbot"],
  [/Yeti/i, "Yeti (네이버)"],
  [/Daumoa/i, "Daumoa (다음)"],
  [/ChatGPT-User/i, "ChatGPT"],
  [/PerplexityBot/i, "Perplexity"],
  [/GPTBot/i, "GPTBot"],
  [/Google-Extended/i, "Google-Extended"],
  [/CCBot/i, "CCBot"],
  [/ClaudeBot|anthropic-ai|Claude-Web/i, "ClaudeBot"],
  [/cohere-ai/i, "Cohere"],
  [/Bytespider/i, "Bytespider"],
  [/Applebot/i, "Applebot"],
  [/Meta-ExternalAgent|FacebookBot|facebookexternalhit/i, "Meta/Facebook"],
  [/SemrushBot/i, "SemrushBot"],
  [/AhrefsBot/i, "AhrefsBot"],
  [/MJ12bot/i, "MJ12bot"],
  [/DotBot/i, "DotBot"],
  [/PetalBot/i, "PetalBot"],
  [/DataForSeoBot/i, "DataForSeoBot"],
  [/Slurp/i, "Yahoo Slurp"],
  [/msnbot/i, "MSNBot"],
  [/ia_archiver/i, "Alexa"],
  [/Sogou/i, "Sogou"],
  [/Baiduspider/i, "Baidu"],
  [/YandexBot/i, "Yandex"],
  [/bot|crawler|spider|scraper|fetch|curl|wget|python-requests|http|Go-http-client|Java\//i, "기타 봇"],
];

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown"
  );
}

function getKstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function createVisitorKey(request: NextRequest): string {
  const salt = process.env.AUTH_SECRET || process.env.COOKIE_SECRET || "culturepeople";
  const userAgent = request.headers.get("user-agent") || "";
  return createHash("sha256")
    .update(`${getKstDateKey()}:${getClientIp(request)}:${userAgent}:${salt}`)
    .digest("hex")
    .slice(0, 24);
}

function detectBot(userAgent: string): { isBot: boolean; botName?: string } {
  if (!userAgent) return { isBot: false };
  for (const [pattern, name] of BOT_PATTERNS) {
    if (pattern.test(userAgent)) return { isBot: true, botName: name };
  }
  return { isBot: false };
}

async function isAdminRequest(request: NextRequest): Promise<boolean> {
  try {
    const cookie = request.cookies.get("cp-admin-auth");
    if (!cookie?.value) return false;
    const result = await verifyAuthToken(cookie.value);
    return result.valid;
  } catch {
    return false;
  }
}

function cleanupViewCache(now: number) {
  if (now - lastCleanup <= CLEANUP_INTERVAL_MS && viewCache.size <= 10_000) return;
  lastCleanup = now;
  for (const [key, value] of viewCache.entries()) {
    if (now - value > RATE_LIMIT_MS) viewCache.delete(key);
  }
  if (viewCache.size <= 1_000) return;
  let removed = 0;
  const target = viewCache.size - 500;
  for (const key of viewCache.keys()) {
    viewCache.delete(key);
    removed += 1;
    if (removed >= target) break;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { articleId?: unknown; id?: unknown; path?: unknown };
    const articleId = String(body.articleId || body.id || "").trim();
    if (!articleId || articleId.length > 100) {
      return NextResponse.json({ success: false, error: "articleId required" }, { status: 400 });
    }

    const path = typeof body.path === "string" && body.path.length <= 300 ? body.path : `/article/${articleId}`;
    const userAgent = request.headers.get("user-agent") || "";
    const visitorKey = createVisitorKey(request);
    const { isBot, botName } = detectBot(userAgent);
    const isAdmin = await isAdminRequest(request);

    await serverAddViewLog({ articleId, path, visitorKey, isAdmin, isBot, botName });

    const now = Date.now();
    cleanupViewCache(now);
    const cacheKey = `${visitorKey}:${articleId}`;
    const lastView = viewCache.get(cacheKey);
    if (lastView && now - lastView < RATE_LIMIT_MS) {
      return NextResponse.json({ success: true, counted: false, reason: "rate_limited" });
    }
    viewCache.set(cacheKey, now);

    if (isAdmin) {
      return NextResponse.json({ success: true, counted: false, reason: "admin" });
    }
    if (isBot) {
      return NextResponse.json({ success: true, counted: false, reason: "bot", botName });
    }

    await serverIncrementViews(articleId, { isBot: false });
    return NextResponse.json({ success: true, counted: true });
  } catch (error) {
    console.error("[DB] POST article-view error:", error);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
