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

export function isOwnUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    // Supabase Storage URLs
    if (h.endsWith("supabase.co")) return true;
    // culturepeople.co.kr (files.culturepeople.co.kr = 폐쇄된 Cafe24 CDN → 외부 취급하여 이관 대상)
    if (h.includes("culturepeople.co.kr") && !h.startsWith("files.")) return true;
    return false;
  } catch { return false; }
}

export function isSafeExternalUrl(rawUrl: string): boolean {
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

/** HTML에서 대표 이미지 URL을 추출 (우선순위: og:image → twitter:image → link[image_src] → 본문 큰 이미지) */
export function extractOgImageUrl(html: string, baseUrl: string): string | null {
  // 1. og:image (property="og:image" content="..." 또는 content="..." property="og:image")
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch?.[1]) {
    try {
      return ogMatch[1].startsWith("http") ? ogMatch[1] : new URL(ogMatch[1], baseUrl).href;
    } catch { /* ignore */ }
  }
  // 2. twitter:image
  const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  if (twMatch?.[1]) {
    try {
      return twMatch[1].startsWith("http") ? twMatch[1] : new URL(twMatch[1], baseUrl).href;
    } catch { /* ignore */ }
  }
  // 3. <link rel="image_src">
  const linkMatch = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i);
  if (linkMatch?.[1]) {
    try {
      return linkMatch[1].startsWith("http") ? linkMatch[1] : new URL(linkMatch[1], baseUrl).href;
    } catch { /* ignore */ }
  }
  // 4. 본문 <img> 중 이미지 확장자가 있고 크기가 큰 것 (아이콘/로고 제외)
  const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)];
  for (const m of imgMatches) {
    const src = m[1];
    if (!src) continue;
    // SVG, 1x1 추적 픽셀, 아이콘 제외
    if (/\.(svg|ico)(\?|#|$)/i.test(src)) continue;
    if (/tracking|pixel|spacer|blank|logo|icon|badge|button/i.test(src)) continue;
    // width/height 속성이 있으면 작은 이미지 제외
    const tag = m[0];
    const wMatch = tag.match(/width=["']?(\d+)/i);
    const hMatch = tag.match(/height=["']?(\d+)/i);
    if (wMatch && parseInt(wMatch[1]) < 150) continue;
    if (hMatch && parseInt(hMatch[1]) < 100) continue;
    // 이미지 확장자 확인
    if (/\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(src) || /\/media\//i.test(src) || /\/images?\//i.test(src)) {
      try {
        return src.startsWith("http") ? src : new URL(src, baseUrl).href;
      } catch { continue; }
    }
  }
  return null;
}

/** 이미지 ArrayBuffer를 워터마크 적용 후 Supabase에 업로드. 성공 시 public URL 반환 */
async function uploadBufferToSupabase(buf: ArrayBuffer, mime: string): Promise<string | null> {
  let finalBuf = buf;
  // 워터마크 적용 (GIF 제외)
  if (mime !== "image/gif") {
    try {
      const wmSettings = await getCachedWmSettings();
      if (wmSettings.enabled) {
        const result = await applyWatermark(Buffer.from(finalBuf), wmSettings);
        finalBuf = new Uint8Array(result).buffer as ArrayBuffer;
      }
    } catch { /* 워터마크 실패 시 원본 사용 */ }
  }

  const ext  = EXT_MAP[mime] ?? "jpg";
  const now  = new Date();
  const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": mime, "x-upsert": "true" },
    body: finalBuf,
    cache: "no-store",
  });
  if (!up.ok) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** 이미지 바이너리를 fetch하여 Supabase에 업로드. 직접 fetch 실패 시 weserv.nl 프록시 경유. */
async function fetchAndUploadImage(imgUrl: string): Promise<string | null> {
  // 1차: 직접 fetch
  try {
    const imgResp = await fetch(imgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": new URL(imgUrl).origin + "/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (imgResp.ok) {
      if (imgResp.redirected && imgResp.url && !isSafeExternalUrl(imgResp.url)) {
        // SSRF: 리다이렉트 대상이 위험 → 프록시로 폴백
      } else {
        const ct = imgResp.headers.get("content-type")?.split(";")[0].trim() ?? "";

        // HTML 응답 → og:image 추출 후 실제 이미지 URL로 재시도
        if (ct.startsWith("text/html") || ct.startsWith("application/xhtml")) {
          const html = await imgResp.text();
          const ogUrl = extractOgImageUrl(html, imgUrl);
          if (ogUrl && isSafeExternalUrl(ogUrl) && !isOwnUrl(ogUrl)) {
            return fetchAndUploadImage(ogUrl);
          }
          return null; // og:image 없으면 이미지 없음
        }

        if (ct.startsWith("image/") || ct.startsWith("application/octet-stream") || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(imgUrl)) {
          const buf = await imgResp.arrayBuffer();
          if (buf.byteLength > 0 && buf.byteLength <= 5 * 1024 * 1024) {
            let mime = ct;
            if (!ALLOWED_TYPES.includes(mime)) {
              mime = guessMimeFromUrl(imgUrl);
            }
            const result = await uploadBufferToSupabase(buf, mime);
            if (result) return result;
          }
        }
      }
    }
  } catch { /* 직접 fetch 실패 → 프록시 시도 */ }

  // 2차: weserv.nl 이미지 프록시 경유 (hotlink 보호 우회, CORS 무관)
  try {
    const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imgUrl)}&output=jpg&q=85&w=1920&we`;
    const proxyResp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (proxyResp.redirected && proxyResp.url && !isSafeExternalUrl(proxyResp.url)) {
      return null; // 프록시 리다이렉트가 위험한 URL로 향하면 중단
    }
    if (proxyResp.ok) {
      const buf = await proxyResp.arrayBuffer();
      if (buf.byteLength > 0 && buf.byteLength <= 5 * 1024 * 1024) {
        const mime = proxyResp.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
        return uploadBufferToSupabase(buf, ALLOWED_TYPES.includes(mime) ? mime : "image/jpeg");
      }
    }
  } catch { /* 프록시도 실패 */ }

  return null;
}

/** URL 확장자로 MIME 타입 추정 */
function guessMimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png"))       return "image/png";
  if (lower.includes(".gif"))       return "image/gif";
  if (lower.includes(".webp"))      return "image/webp";
  return "image/jpeg";
}

/** 외부 이미지 URL을 Supabase Storage에 업로드. 실패 시 null 반환.
 *  - URL이 HTML 페이지면 og:image 자동 추출
 *  - 직접 fetch 실패 시 weserv.nl 프록시 폴백
 *  - 이미 자사 URL이면 그대로 반환 */
export async function serverUploadImageUrl(imgUrl: string): Promise<string | null> {
  if (!imgUrl) return null;
  if (isOwnUrl(imgUrl)) return imgUrl; // 이미 자사 URL → 그대로 유지
  if (!isSafeExternalUrl(imgUrl)) return null;
  if (!SUPABASE_URL || !SERVICE_KEY) return null;

  return fetchAndUploadImage(imgUrl);
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

/** 본문 HTML의 외부 이미지를 Supabase에 업로드하고 URL 교체.
 *  업로드 실패한 외부 이미지는 본문에서 제거 (깨진 링크 방지).
 *  5개씩 병렬 처리. */
export async function serverMigrateBodyImages(html: string): Promise<string> {
  if (!html) return html;
  const urls = [...new Set(
    [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]).filter(u => !isOwnUrl(u) && isSafeExternalUrl(u))
  )];
  if (urls.length === 0) return html;

  const map = new Map<string, string | null>();
  for (let i = 0; i < urls.length; i += 5) {
    await Promise.all(urls.slice(i, i + 5).map(async (u) => {
      const newUrl = await serverUploadImageUrl(u);
      map.set(u, newUrl); // null이면 업로드 실패
    }));
  }

  // 성공한 이미지는 URL 교체, 실패한 이미지는 <img> 태그 전체 제거
  return html.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (full, url) => {
    if (!map.has(url)) return full; // 자사 URL은 변경 없이 유지
    const newUrl = map.get(url);
    if (newUrl) return full.replace(/src=["'][^"']+["']/, `src="${newUrl}"`);
    // 업로드 실패 → <p>로 감싸져 있으면 <p>도 제거
    return ""; // 깨진 외부 이미지 태그 제거
  }).replace(/<p>\s*<\/p>/g, ""); // 빈 <p> 정리
}
