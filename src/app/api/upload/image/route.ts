/**
 * 이미지 업로드 API
 * Supabase Storage "images" 버킷에 직접 저장
 * URL: {SUPABASE_URL}/storage/v1/object/public/images/YYYY/MM/filename.ext
 */
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { applyWatermark, getWatermarkSettings } from "@/lib/watermark";
import { getImageUploadSettings } from "@/lib/supabase-server-db";
import { extractOgImageUrl } from "@/lib/server-upload-image";
import { verifyAuthToken } from "@/lib/cookie-auth";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET        = "images";

const MAX_SIZE      = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
};

/** 매직 바이트로 실제 이미지 타입 검증 (MIME Spoofing 방어) */
function detectImageType(buffer: ArrayBuffer): string | null {
  const arr = new Uint8Array(buffer).slice(0, 12);
  if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) return "image/jpeg";
  if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) return "image/png";
  if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) return "image/gif";
  if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46 &&
      arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50) return "image/webp";
  return null;
}

// SSRF 방지
function isSafeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h.includes(":")) return false; // IPv6 (URL 파싱 후 대괄호 제거됨)
  if (h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "0.0.0.0") return false;
  // DNS Rebinding 방어: 숫자 IP가 아닌 내부 도메인 패턴 차단
  if (/^(10|172\.(1[6-9]|2\d|3[01])|192\.168|127|0)\./i.test(h)) return false;
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
}

function buildStoragePath(ext: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 10);
  return `${yyyy}/${mm}/${Date.now()}_${rand}.${ext}`;
}

async function uploadToSupabase(buffer: ArrayBuffer, mimeType: string, ext: string): Promise<string> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");

  const path = buildStoragePath(ext);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
    body: buffer,
    signal: AbortSignal.timeout(25000), // 25초 타임아웃
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[upload/image] Storage 업로드 실패 (${res.status}):`, err.slice(0, 200));
    throw new Error(`이미지 업로드에 실패했습니다. (${res.status})`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

type ImageSettings = Awaited<ReturnType<typeof getImageUploadSettings>> | null;

/** 이미지 리사이즈 + WebP 변환 (GIF 제외, 실패 시 원본 유지) */
async function maybeResizeAndConvert(
  buf: ArrayBuffer,
  mime: string,
  settings: ImageSettings,
): Promise<{ buffer: ArrayBuffer; mime: string; ext: string }> {
  // 비활성화 또는 설정 없음 → 원본 유지
  if (!settings?.enabled) {
    return { buffer: buf, mime, ext: EXT_MAP[mime] ?? "jpg" };
  }
  // GIF는 변환하지 않음 (애니메이션 보존)
  if (mime === "image/gif") {
    return { buffer: buf, mime, ext: "gif" };
  }
  try {
    const processed = await sharp(Buffer.from(buf))
      .resize({ width: settings.maxWidth, withoutEnlargement: true })
      .webp({ quality: settings.quality })
      .toBuffer();
    return {
      buffer: new Uint8Array(processed).buffer as ArrayBuffer,
      mime: "image/webp",
      ext: "webp",
    };
  } catch {
    // sharp 실패 시 원본 유지
    return { buffer: buf, mime, ext: EXT_MAP[mime] ?? "jpg" };
  }
}

// POST multipart/form-data { file }
// POST application/json    { url }
// 쿼리파라미터 ?noWatermark=1 로 워터마크 생략 가능 (로고 업로드 등)
export async function POST(request: NextRequest) {
  // 관리자 인증 필수
  const cookie = request.cookies.get("cp-admin-auth");
  const auth = await verifyAuthToken(cookie?.value ?? "");
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let skipWatermark = request.nextUrl.searchParams.get("noWatermark") === "1";

  // noWatermark는 관리자(superadmin) 전용
  if (skipWatermark) {
    const { getTokenPayload } = await import("@/lib/cookie-auth");
    const payload = await getTokenPayload(request);
    if (payload?.role !== "superadmin" && payload?.role !== "admin") {
      // 권한 없으면 워터마크 강제 적용
      skipWatermark = false;
    }
  }

  // 워터마크 설정 미리 로드 (GIF에는 적용하지 않음)
  let wmSettings: Awaited<ReturnType<typeof getWatermarkSettings>> | null = null;
  if (!skipWatermark) {
    try {
      wmSettings = await getWatermarkSettings();
    } catch { /* 실패 시 워터마크 없이 진행 */ }
  }

  // 이미지 리사이즈/WebP 변환 설정 로드
  let imgSettings: ImageSettings = null;
  try {
    imgSettings = await getImageUploadSettings();
  } catch { /* 실패 시 변환 없이 진행 */ }

  /** GIF가 아닌 이미지에 워터마크 적용 */
  async function maybeApplyWatermark(buf: ArrayBuffer, mime: string): Promise<ArrayBuffer> {
    if (skipWatermark || !wmSettings?.enabled || mime === "image/gif") return buf;
    try {
      const result = await applyWatermark(Buffer.from(buf), wmSettings);
      return new Uint8Array(result).buffer as ArrayBuffer;
    } catch { return buf; }
  }

  try {
    if (contentType.includes("application/json")) {
      // URL 재호스팅 모드
      const body = await request.json();
      const { url } = body as { url?: string };
      if (!url || typeof url !== "string") {
        return NextResponse.json({ success: false, error: "url 필드가 필요합니다." }, { status: 400 });
      }
      if (!isSafeUrl(url)) {
        return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
      }

      /** URL에서 이미지를 fetch하여 업로드. HTML이면 og:image 추출, 실패 시 프록시 폴백. */
      async function fetchResolveUpload(targetUrl: string, depth = 0): Promise<string> {
        // 1차: 직접 fetch
        const resp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": new URL(targetUrl).origin + "/",
            "Accept": "text/html,image/webp,image/apng,image/*,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
          redirect: "follow",
        });
        if (!resp.ok) throw new Error(`다운로드 실패: ${resp.status}`);
        if (resp.redirected && resp.url && !isSafeUrl(resp.url)) {
          throw new Error("허용되지 않는 URL로 리다이렉트되었습니다.");
        }

        const ct = resp.headers.get("content-type")?.split(";")[0].trim() ?? "";

        // HTML → og:image 추출 후 재귀
        if ((ct.startsWith("text/html") || ct.startsWith("application/xhtml")) && depth < 2) {
          const html = await resp.text();
          const ogUrl = extractOgImageUrl(html, targetUrl);
          if (ogUrl && isSafeUrl(ogUrl)) {
            return fetchResolveUpload(ogUrl, depth + 1);
          }
          throw new Error("이미지 URL이 아닌 웹 페이지입니다. og:image도 없습니다.");
        }

        // 이미지 응답 처리
        let imgBuffer = await resp.arrayBuffer();
        if (imgBuffer.byteLength === 0) throw new Error("이미지 데이터가 비어있습니다.");
        if (imgBuffer.byteLength > MAX_SIZE) throw new Error("파일 크기는 5MB 이하여야 합니다.");

        // 매직 바이트로 실제 이미지 타입 검증
        const detectedMime = detectImageType(imgBuffer);
        if (!detectedMime) throw new Error("유효한 이미지 파일이 아닙니다.");
        const mimeType = detectedMime;

        const resized = await maybeResizeAndConvert(imgBuffer, mimeType, imgSettings);
        imgBuffer = resized.buffer;
        const finalMime = resized.mime;
        const ext = resized.ext;
        imgBuffer = await maybeApplyWatermark(imgBuffer, finalMime);
        return uploadToSupabase(imgBuffer, finalMime, ext);
      }

      // 직접 시도 → 실패 시 프록시 폴백
      let resultUrl: string;
      try {
        resultUrl = await fetchResolveUpload(url);
      } catch (directErr) {
        // weserv.nl 프록시 폴백
        try {
          const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=85&w=1920&we`;
          const proxyResp = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000), redirect: "follow" });
          if (!proxyResp.ok) throw new Error(`프록시 실패: ${proxyResp.status}`);
          if (proxyResp.redirected && proxyResp.url && !isSafeUrl(proxyResp.url)) {
            throw new Error("프록시가 허용되지 않는 URL로 리다이렉트되었습니다.");
          }
          let imgBuffer = await proxyResp.arrayBuffer();
          if (imgBuffer.byteLength === 0 || imgBuffer.byteLength > MAX_SIZE) throw directErr;
          const mimeType = "image/jpeg";
          const resizedProxy = await maybeResizeAndConvert(imgBuffer, mimeType, imgSettings);
          imgBuffer = resizedProxy.buffer;
          const finalMimeProxy = resizedProxy.mime;
          const extProxy = resizedProxy.ext;
          imgBuffer = await maybeApplyWatermark(imgBuffer, finalMimeProxy);
          resultUrl = await uploadToSupabase(imgBuffer, finalMimeProxy, extProxy);
        } catch {
          throw directErr; // 프록시도 실패하면 원래 에러 전달
        }
      }

      return NextResponse.json({ success: true, url: resultUrl });

    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "file 필드가 필요합니다." }, { status: 400 });
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ success: false, error: "jpg, png, gif, webp 형식만 허용됩니다." }, { status: 400 });
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ success: false, error: "파일 크기는 5MB 이하여야 합니다." }, { status: 400 });
      }

      let buffer  = await file.arrayBuffer();

      // 매직 바이트로 실제 파일 타입 검증 (MIME Spoofing 방어)
      const detectedType = detectImageType(buffer);
      if (!detectedType) {
        return NextResponse.json({ success: false, error: "유효한 이미지 파일이 아닙니다. (매직 바이트 검증 실패)" }, { status: 400 });
      }
      // 클라이언트 MIME과 실제 타입이 다르면 실제 타입 사용
      const actualType = detectedType;

      // 리사이즈 + WebP 변환
      const resized = await maybeResizeAndConvert(buffer, actualType, imgSettings);
      buffer = resized.buffer;
      const finalMime = resized.mime;
      const ext = resized.ext;

      // 워터마크 적용
      buffer = await maybeApplyWatermark(buffer, finalMime);

      const resultUrl = await uploadToSupabase(buffer, finalMime, ext);
      return NextResponse.json({ success: true, url: resultUrl });

    } else {
      return NextResponse.json({ success: false, error: "지원하지 않는 Content-Type입니다." }, { status: 400 });
    }
  } catch (err) {
    console.error("[upload/image]", err);
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    const safeMsg = isTimeout
      ? "이미지 업로드 시간이 초과되었습니다. 다시 시도해주세요."
      : err instanceof Error && /^(파일|이미지|허용)/.test(err.message)
        ? err.message  // 사용자 친화적 메시지만 허용
        : "이미지 업로드 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: safeMsg }, { status: 500 });
  }
}
