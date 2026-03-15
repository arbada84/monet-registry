/**
 * 외부 이미지 URL → Supabase Storage 재업로드 유틸리티
 * 브라우저(클라이언트)에서만 사용
 */

const MAX_WIDTH  = 1920;   // 리사이징 최대 너비
const QUALITY    = 0.85;   // WebP/JPEG 압축 품질

/**
 * Supabase Storage에 올라간 이미지 또는 현재 도메인 이미지인지 확인
 * files.culturepeople.co.kr = 삭제된 Cafe24 CDN → 외부 URL로 취급하여 이관 대상 포함
 */
function isOwnUrl(url: string): boolean {
  // Supabase Storage URL은 항상 자사 URL
  if (url.includes("supabase")) return true;
  // culturepeople.co.kr 이미지: files 서브도메인(Cafe24, 삭제됨)은 외부로 취급
  if (url.includes("culturepeople.co.kr") && !url.includes("files.culturepeople.co.kr")) return true;
  return false;
}

/**
 * Blob을 canvas로 최대 1920px, WebP 85%로 압축한다.
 * 원본이 이미 작거나 변환 실패 시 원본 반환.
 */
async function compressBlob(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (compressed) => resolve(compressed ?? blob),
        "image/webp",
        QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(blob); };
    img.src = objUrl;
  });
}

/**
 * 1순위: 브라우저 직접 CORS fetch (Wikimedia, imgur 등)
 * 2순위: images.weserv.nl 프록시 경유 (hotlink protection 우회)
 * 실패 시 null 반환 → 서버 사이드 URL 전송으로 폴백
 * 성공한 blob은 압축 후 반환.
 */
async function fetchBlobFromBrowser(url: string): Promise<Blob | null> {
  // 1) 직접 CORS fetch
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) {
      const raw = await res.blob();
      if (raw.size > 0) return await compressBlob(raw);
    }
  } catch { /* CORS 차단 → 프록시 시도 */ }

  // 2) images.weserv.nl 프록시 경유 (서버사이드 리사이징 포함)
  try {
    const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=85&w=${MAX_WIDTH}&we`;
    const res = await fetch(proxyUrl, { mode: "cors" });
    if (res.ok) {
      const raw = await res.blob();
      if (raw.size > 0) return raw; // 프록시가 이미 리사이즈
    }
  } catch { /* 프록시도 실패 → 서버 폴백 */ }

  return null;
}

/**
 * 이미지 blob을 /api/upload/image 에 multipart로 업로드
 */
async function uploadBlob(blob: Blob, origUrl: string): Promise<{ success: boolean; url?: string; error?: string }> {
  const ext = blob.type === "image/webp" ? "webp"
    : origUrl.match(/\.(png|gif|webp)$/i)?.[1]?.toLowerCase() ?? "jpg";
  const formData = new FormData();
  formData.append("file", blob, `image.${ext}`);
  const resp = await fetch("/api/upload/image", { method: "POST", body: formData });
  return resp.json();
}

/** 단일 URL 업로드 공통 로직.
 *  URL이 이미지가 아닌 HTML 페이지일 경우 서버에서 og:image 자동 추출하여 처리. */
async function uploadOneUrl(origUrl: string): Promise<{ success: boolean; url?: string; error?: string }> {
  // 이미지 확장자가 있는 URL만 브라우저에서 직접 시도 (HTML 페이지는 서버에 위임)
  const hasImageExt = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(origUrl);
  if (hasImageExt) {
    const blob = await fetchBlobFromBrowser(origUrl);
    if (blob && blob.type.startsWith("image/")) return uploadBlob(blob, origUrl);
  }
  // 서버 사이드 URL 폴백 (HTML → og:image 자동 추출 포함)
  const resp = await fetch("/api/upload/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: origUrl }),
  });
  return resp.json();
}

/**
 * HTML 본문의 <img src="..."> 외부 URL을 Supabase에 재업로드하고 URL을 교체한다.
 * - 이미 Supabase/자사 URL이면 스킵
 * - 업로드 실패 시 원본 URL 유지
 * - 5개씩 병렬 처리
 */
export async function reuploadImagesInHtml(
  html: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ html: string; uploaded: number; failed: number; firstError?: string }> {
  const urlSet = new Set<string>();
  const imgSrcRegex = /<img[^>]+src="(https?:\/\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = imgSrcRegex.exec(html)) !== null) {
    if (!isOwnUrl(m[1])) urlSet.add(m[1]);
  }

  const urls = [...urlSet];
  if (urls.length === 0) return { html, uploaded: 0, failed: 0 };

  const urlMap = new Map<string, string>();
  let done = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (let i = 0; i < urls.length; i += 5) {
    const batch = urls.slice(i, i + 5);
    await Promise.all(
      batch.map(async (origUrl) => {
        try {
          const data = await uploadOneUrl(origUrl);
          if (data.success && data.url) {
            urlMap.set(origUrl, data.url);
          } else {
            failed++;
            if (!firstError) firstError = data.error || "업로드 실패";
          }
        } catch (e) {
          failed++;
          if (!firstError) firstError = e instanceof Error ? e.message : "네트워크 오류";
        }
        done++;
        onProgress?.(done, urls.length);
      })
    );
  }

  const uploaded = urlMap.size;
  const result = html.replace(/<img([^>]+)src="(https?:\/\/[^"]+)"/gi, (full, attrs, url) => {
    const replaced = urlMap.get(url);
    return replaced ? `<img${attrs}src="${replaced}"` : full;
  });

  return { html: result, uploaded, failed, firstError };
}

/**
 * 단일 이미지 URL을 Supabase에 재업로드한다.
 * 실패 시 원본 URL 반환.
 */
export async function reuploadImageUrl(url: string): Promise<string> {
  if (!url || isOwnUrl(url)) return url;
  try {
    const data = await uploadOneUrl(url);
    if (data.success && data.url) return data.url;
  } catch { /* ignore */ }
  return url;
}

/**
 * HTML 본문에 외부 이미지가 포함되어 있는지 확인한다.
 */
export function hasExternalImages(html: string): boolean {
  const imgSrcRegex = /<img[^>]+src="(https?:\/\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = imgSrcRegex.exec(html)) !== null) {
    if (!isOwnUrl(m[1])) return true;
  }
  return false;
}
