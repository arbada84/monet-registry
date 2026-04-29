/**
 * 서버사이드 워터마크 적용 유틸리티 (sharp 사용)
 * Node.js 환경 전용 — API 라우트에서만 사용
 */
import "server-only";
import sharp from "sharp";
import { getWatermarkSettings as loadWatermarkSettings } from "@/lib/image-processing-settings";
import { safeFetch } from "@/lib/safe-remote-url";
import type { WatermarkSettings } from "@/types/article";

const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY!;

/** Read watermark settings through the active database read adapter. */
export async function getWatermarkSettings(): Promise<WatermarkSettings> {
  return loadWatermarkSettings();
}

/** 텍스트 워터마크를 위한 SVG 생성 */
function createTextWatermarkSvg(
  text: string,
  fontSize: number,
  opacity: number
): Buffer {
  // 글자 수 기반 너비 추정 (한글 = 1em, 영문/기호 = 0.6em)
  const charWidth = [...text].reduce((w, ch) => {
    return w + (ch.charCodeAt(0) > 127 ? fontSize : fontSize * 0.6);
  }, 0);
  const svgWidth = Math.ceil(charWidth + fontSize); // 좌우 패딩
  const svgHeight = Math.ceil(fontSize * 1.5);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">
  <text
    x="${svgWidth / 2}" y="${fontSize * 1.1}"
    text-anchor="middle"
    font-family="sans-serif"
    font-size="${fontSize}"
    font-weight="bold"
    fill="white"
    opacity="${opacity}"
    filter="url(#shadow)"
  >${escapeXml(text)}</text>
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>
</svg>`;
  return Buffer.from(svg);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * 이미지 Buffer에 워터마크를 합성하여 반환
 * 워터마크 설정이 꺼져있거나 내용이 없으면 원본 반환
 */
export async function applyWatermark(
  imageBuffer: Buffer | ArrayBuffer,
  settings?: WatermarkSettings
): Promise<Buffer> {
  const buf = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);

  // 설정 로드
  const ws = settings ?? await getWatermarkSettings();

  // 비활성이면 원본 반환
  if (!ws.enabled) return buf;

  // 텍스트도 이미지도 없으면 원본
  if (ws.type === "text" && !ws.text.trim()) return buf;
  if (ws.type === "image" && !ws.imageUrl.trim()) return buf;

  try {
    const image = sharp(buf);
    const metadata = await image.metadata();
    const imgWidth  = metadata.width  ?? 800;
    const imgHeight = metadata.height ?? 600;

    // 워터마크 크기 계산 (원본 대비 %)
    const sizeRatio = Math.max(10, Math.min(50, ws.size)) / 100;
    const targetWidth = Math.round(imgWidth * sizeRatio);

    let watermarkBuf: Buffer;

    if (ws.type === "image" && ws.imageUrl) {
      // 이미지 워터마크 로드
      const wmImage = await fetchWatermarkImage(ws.imageUrl);
      if (!wmImage) return buf; // 로드 실패 시 원본
      watermarkBuf = await sharp(wmImage)
        .resize({ width: targetWidth, withoutEnlargement: true })
        .ensureAlpha()
        .composite([{
          input: Buffer.from([255, 255, 255, Math.round(ws.opacity * 255)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        }])
        .png()
        .toBuffer();
    } else {
      // 텍스트 워터마크
      const fontSize = Math.max(12, Math.round(targetWidth / Math.max(ws.text.length, 1) * 1.2));
      const svgBuf = createTextWatermarkSvg(ws.text, Math.min(fontSize, 80), ws.opacity);
      watermarkBuf = await sharp(svgBuf)
        .resize({ width: targetWidth, withoutEnlargement: true })
        .png()
        .toBuffer();
    }

    // 워터마크 메타데이터
    const wmMeta = await sharp(watermarkBuf).metadata();
    const wmWidth  = wmMeta.width  ?? targetWidth;
    const wmHeight = wmMeta.height ?? 40;

    // 하단 우측 위치 계산 (margin: 이미지의 2%)
    const margin = Math.round(Math.max(imgWidth, imgHeight) * 0.02);
    const left = Math.max(0, imgWidth - wmWidth - margin);
    const top  = Math.max(0, imgHeight - wmHeight - margin);

    // 합성
    const result = await image
      .composite([{
        input: watermarkBuf,
        left,
        top,
        blend: "over",
      }])
      .toBuffer();

    return result;
  } catch (err) {
    console.error("[watermark] 워터마크 적용 실패:", err);
    return buf; // 실패 시 원본 반환
  }
}

/** 외부/내부 URL에서 워터마크 이미지 다운로드 */
async function fetchWatermarkImage(url: string): Promise<Buffer | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
    };
    // Supabase Storage URL이면 인증 헤더 추가
    if (url.includes("supabase") && SERVICE_KEY) {
      headers["Authorization"] = `Bearer ${SERVICE_KEY}`;
      headers["apikey"] = SERVICE_KEY;
    }
    const res = await safeFetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
      maxRedirects: 3,
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}
