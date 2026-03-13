/**
 * 서버사이드 이미지 업로드 유틸리티 (Supabase Storage)
 * Node.js 환경 전용 (api 라우트에서 사용)
 */
import { applyWatermark, getWatermarkSettings } from "@/lib/watermark";
import type { WatermarkSettings } from "@/types/article";

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET         = "images";
const ALLOWED_TYPES  = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
};

function isOwnUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith("supabase.co") || h.includes("culturepeople.co.kr");
  } catch { return false; }
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h.includes(":")) return false; // IPv6
    if (h === "localhost" || h === "127.0.0.1") return false;
    if (h.endsWith(".local") || h.endsWith(".internal")) return false;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b, c, d] = ipv4.map(Number);
      if (a > 255 || b > 255 || c > 255 || d > 255) return false;
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

// 워터마크 설정 캐시 (같은 요청 내 반복 조회 방지)
let _wmSettingsCache: { ts: number; settings: WatermarkSettings } | null = null;
async function getCachedWmSettings(): Promise<WatermarkSettings> {
  const now = Date.now();
  if (_wmSettingsCache && now - _wmSettingsCache.ts < 10000) return _wmSettingsCache.settings;
  const s = await getWatermarkSettings();
  _wmSettingsCache = { ts: now, settings: s };
  return s;
}

/** 외부 이미지 URL을 Supabase Storage에 업로드. 실패 시 null 반환 */
export async function serverUploadImageUrl(imgUrl: string): Promise<string | null> {
  if (!imgUrl || isOwnUrl(imgUrl) || !isSafeExternalUrl(imgUrl)) return null;
  if (!SUPABASE_URL || !SERVICE_KEY) return null;

  try {
    const imgResp = await fetch(imgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": new URL(imgUrl).origin + "/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow", // 리다이렉트 허용 (Wikimedia 등 정상 이미지 호스팅 지원)
    });
    if (!imgResp.ok) return null;
    // SSRF 방어: 리다이렉트 후 최종 URL이 내부 네트워크가 아닌지 검증
    if (imgResp.redirected && imgResp.url) {
      if (!isSafeExternalUrl(imgResp.url)) return null;
    }

    let buf = await imgResp.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > 5 * 1024 * 1024) return null;

    let mime = imgResp.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!ALLOWED_TYPES.includes(mime)) {
      const lower = imgUrl.toLowerCase();
      if (lower.includes(".png"))       mime = "image/png";
      else if (lower.includes(".gif"))  mime = "image/gif";
      else if (lower.includes(".webp")) mime = "image/webp";
      else                              mime = "image/jpeg";
    }

    // 워터마크 적용 (GIF 제외)
    if (mime !== "image/gif") {
      try {
        const wmSettings = await getCachedWmSettings();
        if (wmSettings.enabled) {
          const result = await applyWatermark(Buffer.from(buf), wmSettings);
          buf = new Uint8Array(result).buffer as ArrayBuffer;
        }
      } catch { /* 워터마크 실패 시 원본 사용 */ }
    }

    const ext  = EXT_MAP[mime] ?? "jpg";
    const now  = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": mime, "x-upsert": "true" },
      body: buf,
      cache: "no-store",
    });
    if (!up.ok) return null;

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch { return null; }
}

/** Uint8Array/Buffer → Supabase Storage 직접 업로드. ZIP 내 이미지 등에 사용. */
export async function serverUploadBuffer(data: Uint8Array, filename: string): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  if (data.byteLength === 0 || data.byteLength > 10 * 1024 * 1024) return null;

  const lower = filename.toLowerCase();
  let mime = "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
  else if (lower.endsWith(".gif")) mime = "image/gif";
  else if (lower.endsWith(".webp")) mime = "image/webp";

  let buf: ArrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

  // 워터마크 적용 (GIF 제외)
  if (mime !== "image/gif") {
    try {
      const wmSettings = await getCachedWmSettings();
      if (wmSettings.enabled) {
        const result = await applyWatermark(Buffer.from(buf), wmSettings);
        buf = new Uint8Array(result).buffer as ArrayBuffer;
      }
    } catch { /* 워터마크 실패 시 원본 사용 */ }
  }

  const ext  = EXT_MAP[mime] ?? "png";
  const now  = new Date();
  const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": mime, "x-upsert": "true" },
      body: buf,
      cache: "no-store",
    });
    if (!up.ok) return null;
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch { return null; }
}

/** 본문 HTML의 외부 이미지를 Supabase에 업로드하고 URL 교체. 5개씩 병렬 처리 */
export async function serverMigrateBodyImages(html: string): Promise<string> {
  if (!html) return html;
  const urls = [...new Set(
    [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map(m => m[1]).filter(u => !isOwnUrl(u) && isSafeExternalUrl(u))
  )];
  if (urls.length === 0) return html;

  const map = new Map<string, string>();
  for (let i = 0; i < urls.length; i += 5) {
    await Promise.all(urls.slice(i, i + 5).map(async (u) => {
      const newUrl = await serverUploadImageUrl(u);
      if (newUrl) map.set(u, newUrl);
    }));
  }

  return html.replace(/<img([^>]+)src="([^"]+)"/gi, (full, attrs, url) => {
    const r = map.get(url);
    return r ? `<img${attrs}src="${r}"` : full;
  });
}
