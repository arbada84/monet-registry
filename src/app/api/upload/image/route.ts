/**
 * 이미지 업로드 API
 * Vercel 서버리스 환경에서는 파일시스템 쓰기 불가 →
 * Cafe24 PHP(db-api.php?action=upload-image)에 프록시하여 Cafe24에 파일 저장.
 * 이미지 URL: https://files.culturepeople.co.kr/uploads/YYYY/MM/filename.ext
 */
import { NextRequest, NextResponse } from "next/server";

const PHP_UPLOAD_URL    = process.env.PHP_UPLOAD_URL!;
const PHP_UPLOAD_SECRET = process.env.PHP_UPLOAD_SECRET!;
const PHP_UPLOAD_HOST   = process.env.PHP_UPLOAD_HOST;
const FILES_BASE_URL    = process.env.FILES_BASE_URL || "https://files.culturepeople.co.kr";

const MAX_SIZE     = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// SSRF 방지
function isSafeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  // IPv6 주소 전체 차단 (loopback, link-local, private 등 포함)
  if (h.startsWith("[") || h.includes(":")) return false;
  if (h === "localhost" || h === "127.0.0.1") return false;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  if (h === "metadata.google.internal") return false;
  return true;
}

async function proxyToPHP(formData: FormData): Promise<{ url: string }> {
  if (!PHP_UPLOAD_URL) throw new Error("PHP_UPLOAD_URL 환경변수가 설정되지 않았습니다.");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${PHP_UPLOAD_SECRET}`,
  };
  if (PHP_UPLOAD_HOST) headers["Host"] = PHP_UPLOAD_HOST;

  const res = await fetch(PHP_UPLOAD_URL, {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PHP upload error ${res.status}: ${text}`);
  }

  const json = await res.json() as { success: boolean; url?: string; error?: string };
  if (!json.success || !json.url) throw new Error(json.error || "업로드 실패");

  // PHP가 반환하는 /uploads/... 경로를 full URL로 변환
  const fullUrl = json.url.startsWith("http")
    ? json.url
    : `${FILES_BASE_URL}${json.url}`;

  return { url: fullUrl };
}

// POST multipart/form-data { file }
// POST application/json    { url }
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      // URL 재호스팅 모드: Next.js에서 직접 이미지 다운로드 후 multipart로 PHP 전송
      // (PHP가 외부 서버에 직접 접근 시 User-Agent/Referer 차단 문제 우회)
      const body = await request.json();
      const { url } = body as { url?: string };
      if (!url || typeof url !== "string") {
        return NextResponse.json({ success: false, error: "url 필드가 필요합니다." }, { status: 400 });
      }
      if (!isSafeUrl(url)) {
        return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
      }

      // 1단계: Next.js 서버에서 이미지 다운로드 (Referer·UA 헤더 포함)
      const imgResp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": new URL(url).origin + "/",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!imgResp.ok) {
        throw new Error(`이미지 다운로드 실패: ${imgResp.status}`);
      }

      const imgBuffer = await imgResp.arrayBuffer();
      if (imgBuffer.byteLength === 0) throw new Error("이미지 데이터가 비어있습니다.");
      if (imgBuffer.byteLength > MAX_SIZE) throw new Error("파일 크기는 5MB 이하여야 합니다.");

      // Content-Type 확인 (헤더 우선, 없으면 URL 확장자로 추측)
      let mimeType = imgResp.headers.get("content-type")?.split(";")[0].trim() || "";
      if (!ALLOWED_TYPES.includes(mimeType)) {
        const lower = url.toLowerCase();
        if (lower.includes(".png"))  mimeType = "image/png";
        else if (lower.includes(".gif"))  mimeType = "image/gif";
        else if (lower.includes(".webp")) mimeType = "image/webp";
        else mimeType = "image/jpeg";
      }
      const extMap: Record<string, string> = {
        "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
      };
      const ext = extMap[mimeType] ?? "jpg";
      const fileName = `image.${ext}`;

      // 2단계: PHP에 multipart로 전송
      const file = new File([imgBuffer], fileName, { type: mimeType });
      const phpForm = new FormData();
      phpForm.append("file", file, fileName);

      const { url: resultUrl } = await proxyToPHP(phpForm);
      return NextResponse.json({ success: true, url: resultUrl });

    } else if (contentType.includes("multipart/form-data")) {
      // 파일 직접 업로드 모드
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

      // PHP로 그대로 프록시
      const phpForm = new FormData();
      phpForm.append("file", file, file.name);

      const { url } = await proxyToPHP(phpForm);
      return NextResponse.json({ success: true, url });

    } else {
      return NextResponse.json({ success: false, error: "지원하지 않는 Content-Type입니다." }, { status: 400 });
    }
  } catch (err) {
    console.error("[upload/image]", err);
    return NextResponse.json({ success: false, error: "업로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}
