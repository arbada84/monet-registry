import { NextRequest, NextResponse } from "next/server";
import {
  extractTitle, extractDate, extractThumbnail,
  extractBodyHtml, toPlainText, extractImages,
} from "@/lib/html-extract";

// 허용 프로토콜만 허용, 내부 IP 차단 (SSRF 방어)
function isSafeUrl(rawUrl: string): boolean {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
  if (h === "metadata.google.internal") return false;
  const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b, c, d] = ipv4.map(Number);
    if (a > 255 || b > 255 || c > 255 || d > 255) return false;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // RFC 6598
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false; // Benchmark
    if (a >= 224) return false; // Multicast + Reserved
  }
  return true;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";

  if (!url) {
    return NextResponse.json({ success: false, error: "url 파라미터가 필요합니다." }, { status: 400 });
  }

  if (!isSafeUrl(url)) {
    return NextResponse.json({ success: false, error: "허용되지 않는 URL입니다." }, { status: 400 });
  }

  try {
    const fetchHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    };
    const resp = await fetch(url, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(15000),
      redirect: "follow", // 리다이렉트 허용 (뉴스 사이트 다중 리다이렉트 지원)
    });
    // SSRF 방어: 리다이렉트 후 최종 URL이 내부 네트워크가 아닌지 검증
    if (resp.redirected && resp.url) {
      if (!isSafeUrl(resp.url)) {
        return NextResponse.json({ success: false, error: "허용되지 않는 URL로 리다이렉트되었습니다." }, { status: 400 });
      }
    }

    if (!resp.ok) {
      return NextResponse.json(
        { success: false, error: `원문 페이지 응답 오류: ${resp.status}` },
        { status: 502 }
      );
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return NextResponse.json({ success: false, error: "HTML 페이지가 아닙니다." }, { status: 400 });
    }

    const html = await resp.text();
    const finalUrl = resp.url || url;

    const title = extractTitle(html);
    const date = extractDate(html);
    const thumbnail = extractThumbnail(html, finalUrl);
    const bodyHtml = extractBodyHtml(html, finalUrl);
    const bodyText = toPlainText(bodyHtml);
    const images = extractImages(bodyHtml);
    if (thumbnail && !images.includes(thumbnail)) images.unshift(thumbnail);

    return NextResponse.json({
      success: true,
      url: finalUrl,
      title,
      date,
      thumbnail,
      bodyHtml,
      bodyText,
      images,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[netpro/origin]", url, msg);
    return NextResponse.json(
      { success: false, error: "원문을 가져오는데 실패했습니다." },
      { status: 500 }
    );
  }
}
