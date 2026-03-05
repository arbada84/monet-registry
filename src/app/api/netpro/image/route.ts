/**
 * 넷프로/뉴스와이어 이미지 프록시
 * - 외부 이미지를 서버에서 가져와 전달 (Referer 검증 우회)
 * - SSRF 방지: private IP / localhost 차단
 * - 이미지 Content-Type만 허용
 */
import { NextRequest, NextResponse } from "next/server";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// SVG는 인라인 스크립트 포함 가능 → XSS 위험으로 화이트리스트만 허용
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/gif",
  "image/webp", "image/avif", "image/bmp", "image/tiff",
];

function isSafeUrl(rawUrl: string): { ok: boolean; origin?: string } {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return { ok: false }; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
  const h = parsed.hostname.toLowerCase();
  // IPv6
  if (h.startsWith("[") || h.includes(":")) return { ok: false };
  // localhost
  if (h === "localhost" || h === "127.0.0.1") return { ok: false };
  // private ranges
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 0 || a === 10 || a === 127) return { ok: false };
    if (a === 100 && b >= 64 && b <= 127) return { ok: false };
    if (a === 169 && b === 254) return { ok: false };
    if (a === 172 && b >= 16 && b <= 31) return { ok: false };
    if (a === 192 && b === 168) return { ok: false };
    if (a === 198 && (b === 18 || b === 19)) return { ok: false };
    if (a >= 224) return { ok: false };
  }
  if (h === "metadata.google.internal") return { ok: false };
  return { ok: true, origin: parsed.origin };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url") || "";

  const check = isSafeUrl(rawUrl);
  if (!check.ok) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    const resp = await fetch(rawUrl, {
      headers: {
        // 이미지 원본 도메인을 Referer로 설정해 hotlink 보호 우회
        "Referer": check.origin + "/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error", // SSRF: 리다이렉트 차단
    });

    if (!resp.ok) {
      return new NextResponse(null, { status: 502 });
    }

    const contentType = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "not an image" }, { status: 400 });
    }

    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: "too large" }, { status: 413 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
