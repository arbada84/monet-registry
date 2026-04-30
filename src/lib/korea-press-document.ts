import { unzipSync } from "fflate";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { extractKoreaPressAttachments } from "@/lib/korea-press-extract";

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const KOREAN_RE = /[\uAC00-\uD7A3]/;
const CONTACT_PREFIX_RE = /^\uB2F4\uB2F9\s*\uBD80\uC11C/; // 담당 부서
const APPENDIX_ONLY_RE = /^\uBD99\s*\uC784\s*:?\s*$/i; // 붙 임
const BODY_ENDING_RE = /[.!?\u3002\uB2E4\uC694\uC74C\uC784\uB428]$/;
const HEADER_PREFIX_RE = new RegExp(
  "^(?:"
    + "\uBCF4\uB3C4\uC790\uB8CC" // 보도자료
    + "|\uBCF4\uB3C4\uC2DC\uC810" // 보도시점
    + "|\uBC30\uD3EC" // 배포
    + "|\uB2F4\uB2F9\\s*\uBD80\uC11C" // 담당 부서
    + ")",
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDocumentLine(line: string): string {
  return line
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHwpxHeaderLine(line: string): boolean {
  if (!line) return true;
  if (/^<.*>$/.test(line)) return true;
  if (HEADER_PREFIX_RE.test(line)) return true;
  return false;
}

function isLikelyBodyStart(line: string): boolean {
  if (line.length < 30) return false;
  if (!KOREAN_RE.test(line)) return false;
  if (HEADER_PREFIX_RE.test(line)) return false;
  return BODY_ENDING_RE.test(line)
    || line.includes("\uD558\uC600\uB2E4") // 하였다
    || line.includes("\uBC1D\uD614\uB2E4"); // 밝혔다
}

export function hwpxPreviewTextToBodyHtml(text: string): string {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map(normalizeDocumentLine)
    .filter(Boolean);

  const start = lines.findIndex((line) => !isHwpxHeaderLine(line) && isLikelyBodyStart(line));
  const candidates = start >= 0 ? lines.slice(start) : lines.filter((line) => !isHwpxHeaderLine(line));
  const end = candidates.findIndex((line) => CONTACT_PREFIX_RE.test(line));
  const bodyLines = (end >= 0 ? candidates.slice(0, end) : candidates)
    .filter((line) => !APPENDIX_ONLY_RE.test(line));

  return bodyLines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<hp:lineBreak\s*\/>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractHwpxBodyHtml(bytes: Uint8Array): string {
  const zip = unzipSync(bytes);
  const decoder = new TextDecoder("utf-8");

  const preview = zip["Preview/PrvText.txt"];
  if (preview) {
    const html = hwpxPreviewTextToBodyHtml(decoder.decode(preview));
    if (html) return html;
  }

  const sectionText = Object.keys(zip)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort()
    .map((name) => xmlToText(decoder.decode(zip[name])))
    .join("\n\n");

  return hwpxPreviewTextToBodyHtml(sectionText);
}

export async function fetchKoreaPressDocumentBodyHtml(html: string, baseUrl: string): Promise<string> {
  const attachment = extractKoreaPressAttachments(html, baseUrl)
    .find((item) => item.extension === "hwpx");
  if (!attachment) return "";

  const resp = await fetchWithRetry(attachment.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 CulturePeople-Bot/1.0",
      Referer: baseUrl,
    },
    signal: AbortSignal.timeout(15000),
    maxRetries: 2,
    retryDelayMs: 1000,
    safeRemote: true,
    safeMaxRedirects: 5,
  });
  if (!resp.ok) return "";

  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_DOCUMENT_BYTES) return "";
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return "";

  try {
    return extractHwpxBodyHtml(bytes);
  } catch {
    return "";
  }
}
