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

export function getBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) {
    // 첫 번째 공백(개행 포함) 전까지만 사용
    const clean = env.split(/\s/)[0]?.replace(/\/$/, "").trim();
    if (clean && clean.startsWith("http")) return clean;
  }
  return HARDCODED_URL;
}
