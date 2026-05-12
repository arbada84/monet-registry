/**
 * 이미지 업로드 API
 * 설정된 미디어 저장소(Supabase Storage 또는 Cloudflare R2)에 저장
 */
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { applyWatermark, getWatermarkSettings } from "@/lib/watermark";
import { getImageUploadSettings } from "@/lib/image-processing-settings";
import { detectImageType, extractOgImageUrl } from "@/lib/server-upload-image";
import { assertSafeRemoteUrl, isPlausiblySafeRemoteUrl, safeFetch } from "@/lib/safe-remote-url";
import { verifyAuthToken } from "@/lib/cookie-auth";
import { isMediaStorageConfigured, uploadBufferToMediaStorage } from "@/lib/media-storage";

const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024;
const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
};

// SSRF 방지
function isSafeUrl(rawUrl: string): boolean {
  return isPlausiblySafeRemoteUrl(rawUrl);
}

function getDeclaredContentLength(resp: Response): number | null {
  const raw = resp.headers.get("content-length");
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

async function uploadToConfiguredStorage(buffer: ArrayBuffer, mimeType: string, ext: string): Promise<string> {
  if (!isMediaStorageConfigured()) {
    throw new Error("미디어 저장소 환경변수가 설정되지 않았습니다.");
  }

  const url = await uploadBufferToMediaStorage({ buffer, mime: mimeType, ext });
  if (!url) {
    throw new Error("이미지 업로드에 실패했습니다.");
  }
  return url;
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
      try {
        await assertSafeRemoteUrl(url);
      } catch {
        return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
      }

      async function fetchResolveUpload(targetUrl: string, depth = 0): Promise<string> {
        // 1차: 직접 fetch
        const resp = await safeFetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": new URL(targetUrl).origin + "/",
            "Accept": "text/html,image/webp,image/apng,image/*,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
          maxRedirects: 5,
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
        const declaredSize = getDeclaredContentLength(resp);
        if (declaredSize !== null && declaredSize > MAX_REMOTE_IMAGE_BYTES) {
          throw new Error("원격 이미지 크기는 10MB 이하여야 합니다.");
        }
        let imgBuffer = await resp.arrayBuffer();
        if (imgBuffer.byteLength === 0) throw new Error("이미지 데이터가 비어있습니다.");
        if (imgBuffer.byteLength > MAX_REMOTE_IMAGE_BYTES) throw new Error("원격 이미지 크기는 10MB 이하여야 합니다.");

        // 매직 바이트로 실제 이미지 타입 검증
        const detectedMime = detectImageType(imgBuffer);
        if (!detectedMime) throw new Error("유효한 이미지 파일이 아닙니다.");
        const mimeType = detectedMime;

        const resized = await maybeResizeAndConvert(imgBuffer, mimeType, imgSettings);
        imgBuffer = resized.buffer;
        const finalMime = resized.mime;
        const ext = resized.ext;
        imgBuffer = await maybeApplyWatermark(imgBuffer, finalMime);
        return uploadToConfiguredStorage(imgBuffer, finalMime, ext);
      }

      // 직접 시도 → 실패 시 프록시 폴백
      let resultUrl: string;
      try {
        resultUrl = await fetchResolveUpload(url);
      } catch (directErr) {
        // weserv.nl 프록시 폴백
        try {
          const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=jpg&q=85&w=1920&we`;
          const proxyResp = await safeFetch(proxyUrl, { signal: AbortSignal.timeout(15000), maxRedirects: 5 });
          if (!proxyResp.ok) throw new Error(`프록시 실패: ${proxyResp.status}`);
          if (proxyResp.redirected && proxyResp.url && !isSafeUrl(proxyResp.url)) {
            throw new Error("프록시가 허용되지 않는 URL로 리다이렉트되었습니다.");
          }
          const declaredSize = getDeclaredContentLength(proxyResp);
          if (declaredSize !== null && declaredSize > MAX_REMOTE_IMAGE_BYTES) throw directErr;
          let imgBuffer = await proxyResp.arrayBuffer();
          if (imgBuffer.byteLength === 0 || imgBuffer.byteLength > MAX_REMOTE_IMAGE_BYTES) throw directErr;
          const detectedMime = detectImageType(imgBuffer);
          if (!detectedMime) throw directErr;
          const mimeType = detectedMime;
          const resizedProxy = await maybeResizeAndConvert(imgBuffer, mimeType, imgSettings);
          imgBuffer = resizedProxy.buffer;
          const finalMimeProxy = resizedProxy.mime;
          const extProxy = resizedProxy.ext;
          imgBuffer = await maybeApplyWatermark(imgBuffer, finalMimeProxy);
          resultUrl = await uploadToConfiguredStorage(imgBuffer, finalMimeProxy, extProxy);
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
      if (file.size > MAX_UPLOAD_FILE_BYTES) {
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

      const resultUrl = await uploadToConfiguredStorage(buffer, finalMime, ext);
      return NextResponse.json({ success: true, url: resultUrl });

    } else {
      return NextResponse.json({ success: false, error: "지원하지 않는 Content-Type입니다." }, { status: 400 });
    }
  } catch (err) {
    console.error("[upload/image]", err);
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    const safeMsg = isTimeout
      ? "이미지 업로드 시간이 초과되었습니다. 다시 시도해주세요."
      : err instanceof Error && /^(원격|파일|이미지|허용)/.test(err.message)
        ? err.message  // 사용자 친화적 메시지만 허용
        : "이미지 업로드 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: safeMsg }, { status: 500 });
  }
}
