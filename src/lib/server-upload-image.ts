/**
 * 서버사이드 이미지 업로드 유틸리티 (Supabase Storage)
 * Node.js 환경 전용 (api 라우트에서 사용)
 */
import sharp from "sharp";
import { applyWatermark, getWatermarkSettings } from "@/lib/watermark";
import { assertSafeRemoteUrl, isPlausiblySafeRemoteUrl, safeFetch } from "@/lib/safe-remote-url";
import { getImageUploadSettings } from "@/lib/image-processing-settings";
import { isMediaStorageConfigured, isPublicMediaUrl, uploadBufferToMediaStorage } from "@/lib/media-storage";
import type { WatermarkSettings } from "@/types/article";

const ALLOWED_TYPES  = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
};

export function isOwnUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (isPublicMediaUrl(url)) return true;
    // Supabase Storage URLs
    if (h.endsWith("supabase.co")) return true;
    // culturepeople.co.kr (files.culturepeople.co.kr = 폐쇄된 Cafe24 CDN → 외부 취급하여 이관 대상)
    if (h.includes("culturepeople.co.kr") && !h.startsWith("files.")) return true;
    return false;
  } catch { return false; }
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  return isPlausiblySafeRemoteUrl(rawUrl);
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

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

export function detectImageType(buffer: ArrayBuffer): string | null {
  const arr = new Uint8Array(buffer);
  if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) return "image/jpeg";
  if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) return "image/png";
  if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) return "image/gif";
  if (
    arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46 &&
    arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function getDeclaredContentLength(resp: Response): number | null {
  const raw = resp.headers.get("content-length");
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

async function prepareImageForStorage(buf: ArrayBuffer, mime: string): Promise<{ body: ArrayBuffer; mime: string; ext: string }> {
  let body = new Uint8Array(buf);
  let finalMime = ALLOWED_TYPES.includes(mime) ? mime : "image/jpeg";
  let ext = EXT_MAP[finalMime] ?? "jpg";

  if (finalMime !== "image/gif") {
    try {
      const settings = await getImageUploadSettings();
      if (settings.enabled) {
        const optimized = await sharp(Buffer.from(body))
          .resize({ width: settings.maxWidth, withoutEnlargement: true })
          .webp({ quality: settings.quality })
          .toBuffer();
        body = new Uint8Array(optimized);
        finalMime = "image/webp";
        ext = "webp";
      }
    } catch {
      // Keep the original image if optimization fails.
    }

    try {
      const wmSettings = await getCachedWmSettings();
      if (wmSettings.enabled) {
        const watermarked = await applyWatermark(Buffer.from(body), wmSettings);
        body = new Uint8Array(watermarked);
      }
    } catch {
      // Keep the optimized/original image if watermarking fails.
    }
  }

  return { body: toArrayBuffer(body), mime: finalMime, ext };
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

/** 이미지 ArrayBuffer를 리사이즈/WebP 최적화 및 워터마크 적용 후 설정된 저장소에 업로드. */
async function uploadPreparedBuffer(buf: ArrayBuffer, mime: string): Promise<string | null> {
  const prepared = await prepareImageForStorage(buf, mime);
  return uploadBufferToMediaStorage({
    buffer: prepared.body,
    mime: prepared.mime,
    ext: prepared.ext,
  });
}

/** 이미지 바이너리를 fetch하여 Supabase에 업로드. 직접 fetch 실패 시 weserv.nl 프록시 경유. */
async function fetchAndUploadImage(imgUrl: string): Promise<string | null> {
  // 1차: 직접 fetch
  try {
    const imgResp = await safeFetch(imgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": new URL(imgUrl).origin + "/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      maxRedirects: 5,
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

        const declaredSize = getDeclaredContentLength(imgResp);
        if (declaredSize === null || declaredSize <= MAX_IMAGE_BYTES) {
          const buf = await imgResp.arrayBuffer();
          if (buf.byteLength > 0 && buf.byteLength <= MAX_IMAGE_BYTES) {
            const detectedMime = detectImageType(buf);
            if (!detectedMime) return null;
            const result = await uploadPreparedBuffer(buf, detectedMime);
            if (result) return result;
          }
        }
      }
    }
  } catch { /* 직접 fetch 실패 → 프록시 시도 */ }

  // 2차: weserv.nl 이미지 프록시 경유 (hotlink 보호 우회, CORS 무관)
  try {
    const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imgUrl)}&output=jpg&q=85&w=1920&we`;
    const proxyResp = await safeFetch(proxyUrl, { signal: AbortSignal.timeout(15000), maxRedirects: 5 });
    if (proxyResp.redirected && proxyResp.url && !isSafeExternalUrl(proxyResp.url)) {
      return null; // 프록시 리다이렉트가 위험한 URL로 향하면 중단
    }
    if (proxyResp.ok) {
      const buf = await proxyResp.arrayBuffer();
      if (buf.byteLength > 0 && buf.byteLength <= MAX_IMAGE_BYTES) {
        const detectedMime = detectImageType(buf);
        if (!detectedMime) return null;
        return uploadPreparedBuffer(buf, detectedMime);
      }
    }
  } catch { /* 프록시도 실패 */ }

  return null;
}

/** 외부 이미지 URL을 Supabase Storage에 업로드. 실패 시 null 반환.
 *  - URL이 HTML 페이지면 og:image 자동 추출
 *  - 직접 fetch 실패 시 weserv.nl 프록시 폴백
 *  - 이미 자사 URL이면 그대로 반환 */
export async function serverUploadImageUrl(imgUrl: string): Promise<string | null> {
  if (!imgUrl) return null;
  if (isOwnUrl(imgUrl)) return imgUrl; // 이미 자사 URL → 그대로 유지
  if (!isSafeExternalUrl(imgUrl)) return null;
  if (!isMediaStorageConfigured()) return null;

  try {
    await assertSafeRemoteUrl(imgUrl);
  } catch {
    return null;
  }

  return fetchAndUploadImage(imgUrl);
}

/** Uint8Array/Buffer → Supabase Storage 직접 업로드. ZIP 내 이미지 등에 사용. */
export async function serverUploadBuffer(data: Uint8Array, filename: string): Promise<string | null> {
  if (!isMediaStorageConfigured()) return null;
  if (data.byteLength === 0 || data.byteLength > 10 * 1024 * 1024) return null;

  const lower = filename.toLowerCase();
  let mime = "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
  else if (lower.endsWith(".gif")) mime = "image/gif";
  else if (lower.endsWith(".webp")) mime = "image/webp";

  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  try { return uploadPreparedBuffer(buf, mime); } catch { return null; }
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
