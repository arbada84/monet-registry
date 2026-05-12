import {
  cleanEmptyImageWrappers,
  DEFAULT_PRESS_IMAGE_MAX_PER_ARTICLE,
  filterPressImageUrls,
  isManagedPressImageUrl,
  isNoisyPressImageUrl,
} from "@/lib/press-image-policy";

const MAX_WIDTH = 1920;
const QUALITY = 0.85;

function isOwnUrl(url: string): boolean {
  if (isManagedPressImageUrl(url)) return true;
  if (url.includes("culturepeople.co.kr") && !url.includes("files.culturepeople.co.kr")) return true;
  return false;
}

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
        QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve(blob);
    };
    img.src = objUrl;
  });
}

async function fetchBlobFromBrowser(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) {
      const raw = await res.blob();
      if (raw.size > 0) return await compressBlob(raw);
    }
  } catch {
    // Fall back to the image proxy below.
  }

  try {
    const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=85&w=${MAX_WIDTH}&we`;
    const res = await fetch(proxyUrl, { mode: "cors" });
    if (res.ok) {
      const raw = await res.blob();
      if (raw.size > 0) return raw;
    }
  } catch {
    // The server upload endpoint is the final fallback.
  }

  return null;
}

async function uploadBlob(blob: Blob, origUrl: string): Promise<{ success: boolean; url?: string; error?: string }> {
  const ext = blob.type === "image/webp"
    ? "webp"
    : origUrl.match(/\.(png|gif|webp)$/i)?.[1]?.toLowerCase() ?? "jpg";
  const formData = new FormData();
  formData.append("file", blob, `image.${ext}`);
  const resp = await fetch("/api/upload/image", { method: "POST", body: formData });
  return resp.json();
}

async function uploadOneUrl(origUrl: string): Promise<{ success: boolean; url?: string; error?: string }> {
  const hasImageExt = /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(origUrl);
  if (hasImageExt) {
    const blob = await fetchBlobFromBrowser(origUrl);
    if (blob && blob.type.startsWith("image/")) return uploadBlob(blob, origUrl);
  }

  const resp = await fetch("/api/upload/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: origUrl }),
  });
  return resp.json();
}

function extractExternalImageUrls(html: string): string[] {
  const urls: string[] = [];
  const imgSrcRegex = /<img\b[^>]+src=(["'])(https?:\/\/[^"']+)\1[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imgSrcRegex.exec(html)) !== null) {
    const url = match[2];
    if (!isOwnUrl(url)) urls.push(url);
  }
  return urls;
}

export async function reuploadImagesInHtml(
  html: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ html: string; uploaded: number; failed: number; firstError?: string }> {
  const urls = filterPressImageUrls(extractExternalImageUrls(html), {
    maxImages: DEFAULT_PRESS_IMAGE_MAX_PER_ARTICLE,
    keepManaged: false,
  });
  const allowedUrls = new Set(urls);

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
            if (!firstError) firstError = data.error || "image upload failed";
          }
        } catch (error) {
          failed++;
          if (!firstError) firstError = error instanceof Error ? error.message : "network error";
        }
        done++;
        onProgress?.(done, urls.length);
      }),
    );
  }

  const result = html.replace(/<img\b[^>]+src=(["'])(https?:\/\/[^"']+)\1[^>]*>/gi, (full, _quote, url) => {
    if (isOwnUrl(url)) return full;
    if (isNoisyPressImageUrl(url) || !allowedUrls.has(url)) return "";
    const replaced = urlMap.get(url);
    return replaced ? full.replace(/src=(["'])[^"']+\1/i, `src="${replaced}"`) : full;
  });

  return {
    html: cleanEmptyImageWrappers(result),
    uploaded: urlMap.size,
    failed,
    firstError,
  };
}

export async function reuploadImageUrl(url: string): Promise<string> {
  if (!url || isOwnUrl(url)) return url;
  if (isNoisyPressImageUrl(url)) return "";
  try {
    const data = await uploadOneUrl(url);
    if (data.success && data.url) return data.url;
  } catch {
    // Keep the original URL if upload fails.
  }
  return url;
}

export function hasExternalImages(html: string): boolean {
  return extractExternalImageUrls(html).some((url) => !isNoisyPressImageUrl(url));
}
