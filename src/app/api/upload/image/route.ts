/**
 * 이미지 업로드 API
 * Supabase Storage "images" 버킷에 직접 저장
 * URL: {SUPABASE_URL}/storage/v1/object/public/images/YYYY/MM/filename.ext
 */
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET        = "images";

const MAX_SIZE      = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
};

// SSRF 방지
function isSafeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h.startsWith("[") || h.includes(":")) return false;
  if (h === "localhost" || h === "127.0.0.1") return false;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10 || a === 0 || a === 127) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
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

// POST multipart/form-data { file }
// POST application/json    { url }
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

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

      const imgResp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": new URL(url).origin + "/",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!imgResp.ok) throw new Error(`이미지 다운로드 실패: ${imgResp.status}`);

      const imgBuffer = await imgResp.arrayBuffer();
      if (imgBuffer.byteLength === 0) throw new Error("이미지 데이터가 비어있습니다.");
      if (imgBuffer.byteLength > MAX_SIZE) throw new Error("파일 크기는 5MB 이하여야 합니다.");

      let mimeType = imgResp.headers.get("content-type")?.split(";")[0].trim() || "";
      if (!ALLOWED_TYPES.includes(mimeType)) {
        const lower = url.toLowerCase();
        if (lower.includes(".png"))       mimeType = "image/png";
        else if (lower.includes(".gif"))  mimeType = "image/gif";
        else if (lower.includes(".webp")) mimeType = "image/webp";
        else                              mimeType = "image/jpeg";
      }
      const ext = EXT_MAP[mimeType] ?? "jpg";

      const resultUrl = await uploadToSupabase(imgBuffer, mimeType, ext);
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

      const buffer  = await file.arrayBuffer();
      const ext     = EXT_MAP[file.type] ?? "jpg";
      const resultUrl = await uploadToSupabase(buffer, file.type, ext);
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
