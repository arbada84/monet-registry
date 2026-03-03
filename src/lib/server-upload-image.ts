/**
 * 서버사이드 이미지 업로드 유틸리티 (Supabase Storage)
 * Node.js 환경 전용 (api 라우트에서 사용)
 */

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
    if (h.startsWith("[") || h.includes(":")) return false;
    if (h === "localhost" || h === "127.0.0.1") return false;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b, c, d] = ipv4.map(Number);
      if (a > 255 || b > 255 || c > 255 || d > 255) return false;
      if (a === 10 || a === 0 || a === 127) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
    }
    if (h === "metadata.google.internal") return false;
    return true;
  } catch { return false; }
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
    });
    if (!imgResp.ok) return null;

    const buf = await imgResp.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > 5 * 1024 * 1024) return null;

    let mime = imgResp.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!ALLOWED_TYPES.includes(mime)) {
      const lower = imgUrl.toLowerCase();
      if (lower.includes(".png"))       mime = "image/png";
      else if (lower.includes(".gif"))  mime = "image/gif";
      else if (lower.includes(".webp")) mime = "image/webp";
      else                              mime = "image/jpeg";
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
