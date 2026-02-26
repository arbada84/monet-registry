import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const EXT_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

function getUploadDir(): { absDir: string; relDir: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const relDir = `uploads/${yyyy}/${mm}`;
  const absDir = path.join(process.cwd(), "public", relDir);
  return { absDir, relDir };
}

function generateFilename(ext: string): string {
  const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${Date.now()}_${uid}${ext}`;
}

// SSRF 방지: 비공개 IP 주소 및 위험한 프로토콜 차단
function isSafeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // http/https만 허용
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const hostname = parsed.hostname.toLowerCase();

  // localhost 및 loopback
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return false;

  // IPv4 사설/링크로컬 주소 차단
  const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10) return false;                         // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false;           // 192.168.0.0/16
    if (a === 169 && b === 254) return false;           // 169.254.0.0/16 (AWS 메타데이터 등)
    if (a === 0) return false;                          // 0.0.0.0/8
  }

  // 내부 도메인 패턴 차단
  if (hostname === "metadata.google.internal") return false;

  return true;
}

// POST multipart/form-data { file } — direct file upload
// POST application/json { url }    — re-host external image
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    let buffer: Buffer;
    let mimeType: string;
    let ext: string;

    if (contentType.includes("application/json")) {
      // URL re-hosting mode
      const body = await request.json();
      const { url } = body as { url?: string };
      if (!url || typeof url !== "string") {
        return NextResponse.json({ success: false, error: "url 필드가 필요합니다." }, { status: 400 });
      }

      if (!isSafeUrl(url)) {
        return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        return NextResponse.json({ success: false, error: `이미지 다운로드 실패: ${res.status}` }, { status: 400 });
      }

      const rawMime = res.headers.get("content-type") ?? "";
      mimeType = rawMime.split(";")[0].trim();
      if (!ALLOWED_TYPES.includes(mimeType)) {
        // Fallback: guess from URL extension
        const urlPath = new URL(url).pathname.toLowerCase();
        if (urlPath.endsWith(".jpg") || urlPath.endsWith(".jpeg")) mimeType = "image/jpeg";
        else if (urlPath.endsWith(".png")) mimeType = "image/png";
        else if (urlPath.endsWith(".gif")) mimeType = "image/gif";
        else if (urlPath.endsWith(".webp")) mimeType = "image/webp";
        else {
          return NextResponse.json({ success: false, error: "지원하지 않는 이미지 형식입니다." }, { status: 400 });
        }
      }

      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      ext = EXT_MAP[mimeType];
    } else if (contentType.includes("multipart/form-data")) {
      // File upload mode
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "file 필드가 필요합니다." }, { status: 400 });
      }

      mimeType = file.type;
      if (!ALLOWED_TYPES.includes(mimeType)) {
        return NextResponse.json({ success: false, error: "jpg, png, gif, webp 형식만 허용됩니다." }, { status: 400 });
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ success: false, error: "파일 크기는 5MB 이하여야 합니다." }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      // Get extension from original filename if available, else from mime
      const originalExt = path.extname(file.name).toLowerCase();
      ext = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(originalExt)
        ? (originalExt === ".jpeg" ? ".jpg" : originalExt)
        : EXT_MAP[mimeType];
    } else {
      return NextResponse.json({ success: false, error: "지원하지 않는 Content-Type입니다." }, { status: 400 });
    }

    if (buffer.length > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "파일 크기는 5MB 이하여야 합니다." }, { status: 400 });
    }

    const { absDir, relDir } = getUploadDir();
    await mkdir(absDir, { recursive: true });

    const filename = generateFilename(ext);
    await writeFile(path.join(absDir, filename), buffer);

    const url = `/${relDir}/${filename}`;
    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error("[upload/image]", err);
    return NextResponse.json({ success: false, error: "업로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
