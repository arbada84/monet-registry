import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertSafeRemoteUrl, isPlausiblySafeRemoteUrl, safeFetch } from "@/lib/safe-remote-url";

const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function getWorkerSecret(): string {
  return (process.env.AUTO_PRESS_WORKER_SECRET || "").trim();
}

function extractToken(request: NextRequest): string {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || request.headers.get("x-auto-press-worker-secret")?.trim() || "";
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer);
}

function getDeclaredContentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function isSafeUrl(rawUrl: string): boolean {
  return isPlausiblySafeRemoteUrl(rawUrl);
}

function jpegProxyUrl(rawUrl: string): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(rawUrl)}&output=jpg&q=85&w=1920&we`;
}

function detectImageType(buffer: ArrayBuffer): string | null {
  const arr = new Uint8Array(buffer);
  if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) return "image/jpeg";
  if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) return "image/png";
  if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46) return "image/gif";
  if (
    arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46
    && arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function fetchImageBuffer(targetUrl: string): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const response = await safeFetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": new URL(targetUrl).origin + "/",
      "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
    maxRedirects: 5,
  });

  if (!response.ok) throw new Error(`이미지 응답 HTTP ${response.status}`);

  const declaredSize = getDeclaredContentLength(response);
  if (declaredSize !== null && declaredSize > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error("이미지 크기가 10MB를 초과했습니다.");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error("이미지 데이터가 비어 있습니다.");
  if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) throw new Error("이미지 크기가 10MB를 초과했습니다.");

  const detected = detectImageType(buffer);
  if (!detected || !ALLOWED_TYPES.has(detected)) {
    throw new Error("유효한 이미지 파일이 아닙니다.");
  }

  return { buffer, mime: detected };
}

async function fetchImageWithProxyFallback(rawUrl: string): Promise<{ buffer: ArrayBuffer; mime: string; via: "direct" | "proxy" }> {
  try {
    return { ...(await fetchImageBuffer(rawUrl)), via: "direct" };
  } catch (directError) {
    try {
      return { ...(await fetchImageBuffer(jpegProxyUrl(rawUrl))), via: "proxy" };
    } catch (proxyError) {
      const directMessage = directError instanceof Error ? directError.message : String(directError);
      const proxyMessage = proxyError instanceof Error ? proxyError.message : String(proxyError);
      throw new Error(`${directMessage} / 이미지 프록시 실패: ${proxyMessage}`);
    }
  }
}

export async function GET(request: NextRequest) {
  const expectedSecret = getWorkerSecret();
  if (!expectedSecret) {
    return NextResponse.json({ success: false, error: "AUTO_PRESS_WORKER_SECRET이 설정되지 않았습니다." }, { status: 503 });
  }
  if (!safeEqual(extractToken(request), expectedSecret)) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다." }, { status: 401 });
  }

  const rawUrl = request.nextUrl.searchParams.get("url") || "";
  if (!rawUrl) {
    return NextResponse.json({ success: false, error: "url 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!isSafeUrl(rawUrl)) {
    return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
  }

  try {
    await assertSafeRemoteUrl(rawUrl);
  } catch {
    return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
  }

  try {
    const image = await fetchImageWithProxyFallback(rawUrl);
    return new NextResponse(image.buffer, {
      status: 200,
      headers: {
        "content-type": image.mime,
        "content-length": String(image.buffer.byteLength),
        "cache-control": "private, no-store",
        "x-cp-image-proxy": image.via,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이미지를 가져오지 못했습니다.";
    console.error("[netpro/image]", rawUrl, message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
