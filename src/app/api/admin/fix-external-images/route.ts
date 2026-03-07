/**
 * 기사 외부 이미지 Supabase 재업로드 수정 API
 * POST /api/admin/fix-external-images
 * Body: { since?: "YYYY-MM-DD" }   (기본: 전체 기사)
 *
 * - 기사 본문 및 썸네일의 외부(비 Supabase) 이미지 URL을 Supabase Storage에 업로드
 * - Referer 스푸핑으로 hotlink 보호 우회 시도
 * - 한 번에 최대 200개 기사 처리
 */
import { NextRequest, NextResponse } from "next/server";
import { serverGetArticles, serverUpdateArticle } from "@/lib/db-server";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY ?? "";
const BUCKET        = "images";
const ALLOWED_MIME  = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const EXT_MAP: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

function isOwnUrl(url: string): boolean {
  if (!url) return true;
  return url.includes("supabase") ||
    (url.includes("culturepeople.co.kr") && !url.includes("files.culturepeople.co.kr"));
}

function isSafeUrl(url: string): boolean {
  try {
    const p = new URL(url);
    if (p.protocol !== "https:" && p.protocol !== "http:") return false;
    const h = p.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") return false;
    if (h.startsWith("[") || h.includes(":")) return false;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 0 || a === 10 || a === 127) return false;
      if (a === 100 && b >= 64 && b <= 127) return false;
      if (a === 169 && b === 254) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 198 && (b === 18 || b === 19)) return false;
      if (a >= 224) return false;
    }
    if (h === "metadata.google.internal") return false;
    return true;
  } catch { return false; }
}

/** 외부 이미지 → Supabase 업로드. 실패 시 null 반환 */
async function uploadToSupabase(imgUrl: string): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  if (isOwnUrl(imgUrl) || !isSafeUrl(imgUrl)) return null;
  try {
    // 1차: 직접 fetch (Referer 스푸핑으로 hotlink 우회)
    let buffer: ArrayBuffer | null = null;
    let mimeType = "";

    const tryFetch = async (fetchUrl: string, extraHeaders?: Record<string, string>): Promise<boolean> => {
      try {
        const r = await fetch(fetchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": new URL(imgUrl).origin + "/",
            "Accept": "image/webp,image/avif,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
            ...extraHeaders,
          },
          signal: AbortSignal.timeout(12000),
          redirect: "error",
        });
        if (!r.ok) return false;
        const ct = r.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        const buf = await r.arrayBuffer();
        if (buf.byteLength === 0 || buf.byteLength > 5 * 1024 * 1024) return false;
        buffer = buf;
        mimeType = ct;
        return true;
      } catch { return false; }
    };

    // 1차: 직접 요청
    const ok1 = await tryFetch(imgUrl);

    // 2차: weserv.nl 프록시로 우회 (hotlink 우회용)
    if (!ok1) {
      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imgUrl)}&output=jpg&q=85`;
      const ok2 = await tryFetch(proxyUrl, { "Referer": "https://images.weserv.nl/" });
      if (!ok2 || !buffer) return null;
      if (!mimeType) mimeType = "image/jpeg";
    }
    if (!buffer) return null;

    // MIME 타입 보정
    if (!ALLOWED_MIME.includes(mimeType)) {
      const lower = imgUrl.toLowerCase();
      if (lower.includes(".png")) mimeType = "image/png";
      else if (lower.includes(".gif")) mimeType = "image/gif";
      else if (lower.includes(".webp")) mimeType = "image/webp";
      else mimeType = "image/jpeg";
    }
    const ext = EXT_MAP[mimeType] ?? "jpg";
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body: buffer,
      signal: AbortSignal.timeout(20000),
    });
    if (!up.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch { return null; }
}

/** HTML에서 외부 img src 수집 */
function extractExternalImgUrls(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/gi)) {
    if (!isOwnUrl(m[1]) && isSafeUrl(m[1])) set.add(m[1]);
  }
  return [...set];
}

/** HTML 내 이미지 URL 일괄 교체 */
function replaceImgUrls(html: string, urlMap: Map<string, string>): string {
  return html.replace(/<img([^>]+)src="(https?:\/\/[^"]+)"/gi, (full, attrs, url) => {
    const r = urlMap.get(url);
    return r ? `<img${attrs}src="${r}"` : full;
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const since: string | undefined = body.since; // "YYYY-MM-DD"

    const all = await serverGetArticles();

    // 대상 필터: since 지정 시 해당 날짜 이후 기사만
    const targets = all.filter((a) => {
      if (since) {
        const created = (a.updatedAt ?? a.date ?? "").slice(0, 10);
        if (created < since) return false;
      }
      const hasExtBody = extractExternalImgUrls(a.body ?? "").length > 0;
      const hasExtThumb = a.thumbnail && !isOwnUrl(a.thumbnail) && isSafeUrl(a.thumbnail);
      return hasExtBody || hasExtThumb;
    }).slice(0, 200); // 최대 200개 안전장치

    const results: {
      id: string; title: string;
      bodyFixed: number; thumbFixed: boolean; skipped?: boolean;
    }[] = [];

    let totalImgFixed = 0;

    for (const article of targets) {
      let bodyHtml = article.body ?? "";
      let thumbnail = article.thumbnail ?? "";
      let bodyChanged = false;
      let thumbChanged = false;

      // ── 본문 이미지 처리 ─────────────────────────────────
      const extUrls = extractExternalImgUrls(bodyHtml);
      if (extUrls.length > 0) {
        const urlMap = new Map<string, string>();
        // 최대 5개씩 병렬 업로드
        for (let i = 0; i < extUrls.length; i += 5) {
          const chunk = extUrls.slice(i, i + 5);
          await Promise.all(chunk.map(async (url) => {
            const newUrl = await uploadToSupabase(url);
            if (newUrl) urlMap.set(url, newUrl);
          }));
        }
        if (urlMap.size > 0) {
          bodyHtml = replaceImgUrls(bodyHtml, urlMap);
          bodyChanged = true;
          totalImgFixed += urlMap.size;
        }
      }

      // ── 썸네일 처리 ──────────────────────────────────────
      if (thumbnail && !isOwnUrl(thumbnail) && isSafeUrl(thumbnail)) {
        const newThumb = await uploadToSupabase(thumbnail);
        if (newThumb) {
          thumbnail = newThumb;
          thumbChanged = true;
        }
      }

      if (bodyChanged || thumbChanged) {
        await serverUpdateArticle(article.id, {
          ...(bodyChanged ? { body: bodyHtml } : {}),
          ...(thumbChanged ? { thumbnail } : {}),
        });
        results.push({
          id: article.id,
          title: article.title,
          bodyFixed: extUrls.length,
          thumbFixed: thumbChanged,
        });
      } else {
        results.push({
          id: article.id,
          title: article.title,
          bodyFixed: 0,
          thumbFixed: false,
          skipped: true,
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: targets.length,
      articlesFixed: results.filter((r) => !r.skipped).length,
      imagesMigrated: totalImgFixed,
      results,
    });
  } catch (e) {
    console.error("[fix-external-images]", e);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
