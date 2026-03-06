/**
 * 사이트 기본 URL 반환 유틸리티
 *
 * 우선순위:
 * 1. NEXT_PUBLIC_SITE_URL 환경변수 (공백/개행 제거 후 사용)
 * 2. site-data.json의 hardcoded URL (항상 올바른 값 보장)
 *
 * NEXT_PUBLIC_SITE_URL에 개행이 포함된 경우에도 안전하게 처리됨
 */

const HARDCODED_URL = "https://culturepeople.co.kr";

function sanitizeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // 첫 번째 공백/개행 이전 토큰만 사용
  const firstToken = raw.split(/[\s\r\n]+/)[0] ?? "";
  const clean = firstToken.replace(/\/$/, "").trim();
  if (clean && /^https?:\/\/[a-zA-Z0-9]/.test(clean)) return clean;
  return null;
}

export function getBaseUrl(): string {
  return sanitizeUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? HARDCODED_URL;
}

/** canonicalUrl 설정값도 sanitize */
export function getCanonicalUrl(canonicalUrl?: string | null): string {
  return sanitizeUrl(canonicalUrl) ?? getBaseUrl();
}
